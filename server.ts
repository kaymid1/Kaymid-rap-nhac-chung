import { randomUUID } from 'node:crypto';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import { WebSocket, WebSocketServer } from 'ws';
import type {
  ChatMessage,
  ClientEvent,
  EmoteType,
  MemberPermissions,
  PlaybackState,
  QueueItem,
  RoomLookupStatus,
  RoomSettings,
  RoomSummary,
  ServerEvent,
  TheaterThemeId,
  TheaterUser,
} from './src/types.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const IS_PROD = process.env.NODE_ENV === 'production';

const VALID_EMOTES = new Set<EmoteType>(['dance', 'clap', 'whistle', 'boo']);
const thumbnailCache = new Map<string, { buf: Buffer; contentType: string }>();

interface StoryboardSpec {
  baseUrl: string;
  levelIndex: number;
  frameWidth: number;
  frameHeight: number;
  frameCount: number;
  cols: number;
  rows: number;
  intervalMs: number;
  namePattern: string;
  sigh: string;
  sheetCount: number;
  fetchedAt: number;
}

const storyboardCache = new Map<string, { spec: StoryboardSpec | null; fetchedAt: number }>();
const storyboardSheetCache = new Map<string, { buf: Buffer; contentType: string }>();

function parseStoryboardSpec(rawSpec: string): StoryboardSpec | null {
  const parts = rawSpec.split('|');
  if (parts.length < 2) return null;
  const baseUrl = parts[0];
  if (!baseUrl.startsWith('https://')) return null;

  const levelParts = parts.slice(1);
  // Prefer Level 1 (80x45, 2s/frame); fallback to Level 2 or Level 0
  const preferredOrder = [1, 2, 0].filter((idx) => idx < levelParts.length);

  for (const levelIndex of preferredOrder) {
    const tokens = levelParts[levelIndex].split('#');
    if (tokens.length < 8) continue;
    const frameWidth = Number(tokens[0]);
    const frameHeight = Number(tokens[1]);
    const frameCount = Number(tokens[2]);
    const cols = Number(tokens[3]);
    const rows = Number(tokens[4]);
    const intervalMs = Number(tokens[5]);
    const namePattern = tokens[6];
    const sigh = tokens[7];

    if (
      !Number.isFinite(frameWidth) ||
      !Number.isFinite(frameHeight) ||
      !Number.isFinite(frameCount) ||
      !Number.isFinite(cols) ||
      !Number.isFinite(rows) ||
      frameWidth <= 0 ||
      frameHeight <= 0 ||
      frameCount <= 0 ||
      cols <= 0 ||
      rows <= 0
    ) {
      continue;
    }

    const perSheet = cols * rows;
    const sheetCount = Math.min(8, Math.max(1, Math.ceil(frameCount / perSheet)));
    return {
      baseUrl,
      levelIndex,
      frameWidth,
      frameHeight,
      frameCount: Math.min(frameCount, sheetCount * perSheet),
      cols,
      rows,
      intervalMs: Number.isFinite(intervalMs) && intervalMs >= 0 ? intervalMs : 2000,
      namePattern,
      sigh,
      sheetCount,
      fetchedAt: Date.now(),
    };
  }

  return null;
}

async function fetchYouTubeStoryboardSpec(videoId: string): Promise<StoryboardSpec | null> {
  const cached = storyboardCache.get(videoId);
  if (cached) {
    const ttl = cached.spec ? 30 * 60_000 : 5 * 60_000;
    if (Date.now() - cached.fetchedAt < ttl) {
      return cached.spec;
    }
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const resp = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
      signal: controller.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });
    clearTimeout(timeout);

    if (!resp.ok) {
      return null;
    }

    const html = await resp.text();
    const match = html.match(/"playerStoryboardSpecRenderer":\{"spec":"([^"]+)"/);
    if (!match) {
      if (storyboardCache.size >= 100) {
        const oldest = storyboardCache.keys().next().value;
        if (oldest) storyboardCache.delete(oldest);
      }
      storyboardCache.set(videoId, { spec: null, fetchedAt: Date.now() });
      return null;
    }

    const decodedSpec = match[1].replace(/\\u0026/g, '&').replace(/\\\//g, '/');
    const parsed = parseStoryboardSpec(decodedSpec);

    if (storyboardCache.size >= 100) {
      const oldest = storyboardCache.keys().next().value;
      if (oldest) storyboardCache.delete(oldest);
    }
    storyboardCache.set(videoId, { spec: parsed, fetchedAt: Date.now() });
    return parsed;
  } catch {
    return null;
  }
}

interface RoomUserEntry {
  user: TheaterUser;
  ws: WebSocket | null;
  disconnectTimer: NodeJS.Timeout | null;
}

const VALID_THEMES = new Set<TheaterThemeId>(['cinema', 'vinyl', 'edm', 'opera']);
const THEME_LABELS: Record<TheaterThemeId, string> = {
  cinema: 'Rạp Chiếu Phim',
  vinyl: 'Máy Phát Đĩa Than',
  edm: 'Sàn Nhạc EDM',
  opera: 'Sảnh Khiêu Vũ',
};

function sanitizeTheme(raw?: unknown, fallback: TheaterThemeId = 'cinema'): TheaterThemeId {
  if (typeof raw === 'string' && VALID_THEMES.has(raw as TheaterThemeId)) {
    return raw as TheaterThemeId;
  }
  return fallback;
}

interface Room {
  code: string;
  hostId: string | null;
  isLocked: boolean;
  password: string | null;
  theme: TheaterThemeId;
  defaultPermissions: MemberPermissions;
  users: Map<string, RoomUserEntry>;
  queue: QueueItem[];
  currentItem: QueueItem | null;
  trackHearts: number;
  playback: PlaybackState;
  messages: ChatMessage[];
  cleanupTimer: NodeJS.Timeout | null;
}

interface SocketMeta {
  roomCode: string | null;
  userId: string | null;
  missedPings: number;
  lastEmoteAt: number;
}

const rooms = new Map<string, Room>();
const socketMetaMap = new WeakMap<WebSocket, SocketMeta>();

function sanitizeRoomCode(raw: string): string {
  const cleaned = String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, '')
    .slice(0, 16);
  return cleaned || 'MOVIE-7K2';
}

function normalizePermissions(
  raw?: Partial<MemberPermissions>,
  fallback: MemberPermissions = { canAddQueue: true, canControlPlayback: true, canEmote: true }
): MemberPermissions {
  return {
    canAddQueue: typeof raw?.canAddQueue === 'boolean' ? raw.canAddQueue : fallback.canAddQueue,
    canControlPlayback:
      typeof raw?.canControlPlayback === 'boolean'
        ? raw.canControlPlayback
        : fallback.canControlPlayback,
    canEmote: typeof raw?.canEmote === 'boolean' ? raw.canEmote : fallback.canEmote,
  };
}

function toPublicSettings(room: Room): RoomSettings {
  return {
    isLocked: room.isLocked,
    hasPassword: Boolean(room.password),
    theme: room.theme,
    defaultPermissions: { ...room.defaultPermissions },
  };
}

function isRoomHost(room: Room, userId: string): boolean {
  return room.hostId === userId;
}

function getOrCreateRoom(code: string): { room: Room; isNew: boolean } {
  let room = rooms.get(code);
  let isNew = false;
  if (!room) {
    isNew = true;
    room = {
      code,
      hostId: null,
      isLocked: false,
      password: null,
      theme: 'cinema',
      defaultPermissions: { canAddQueue: true, canControlPlayback: true, canEmote: true },
      users: new Map(),
      queue: [],
      currentItem: null,
      trackHearts: 0,
      playback: {
        isPlaying: false,
        position: 0,
        updatedAt: Date.now(),
      },
      messages: [],
      cleanupTimer: null,
    };
    rooms.set(code, room);
  }
  if (room.cleanupTimer) {
    clearTimeout(room.cleanupTimer);
    room.cleanupTimer = null;
  }
  return { room, isNew };
}

function allocateSeatIndex(room: Room): number {
  const occupied = new Set<number>();
  for (const entry of room.users.values()) {
    occupied.add(entry.user.seatIndex);
  }
  let idx = 0;
  while (occupied.has(idx)) {
    idx += 1;
  }
  return idx;
}

function sendEvent(ws: WebSocket, event: ServerEvent): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(event));
  }
}

function broadcastToRoom(room: Room, event: ServerEvent, excludeUserId?: string): void {
  const payload = JSON.stringify(event);
  for (const [uid, entry] of room.users.entries()) {
    if (excludeUserId && uid === excludeUserId) continue;
    if (entry.ws && entry.ws.readyState === WebSocket.OPEN) {
      entry.ws.send(payload);
    }
  }
}

function appendSystemMessage(room: Room, text: string): ChatMessage {
  const msg: ChatMessage = {
    id: randomUUID(),
    userId: 'system',
    userName: 'Rạp chiếu',
    shirtColor: '#D4AF37',
    text,
    timestamp: Date.now(),
    isSystem: true,
  };
  room.messages.push(msg);
  if (room.messages.length > 60) {
    room.messages.shift();
  }
  return msg;
}

async function fetchYouTubeOEmbed(videoId: string): Promise<{
  videoId: string;
  title: string;
  authorName: string;
  thumbnailUrl: string;
}> {
  const fallback = {
    videoId,
    title: `Video YouTube (${videoId})`,
    authorName: 'YouTube',
    thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
  };

  try {
    const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(
      `https://www.youtube.com/watch?v=${videoId}`
    )}&format=json`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const resp = await fetch(oembedUrl, { signal: controller.signal });
    clearTimeout(timeout);

    if (!resp.ok) {
      if (resp.status === 404 || resp.status === 400) {
        throw new Error('VIDEO_NOT_FOUND');
      }
      return fallback;
    }

    const data = (await resp.json()) as {
      title?: string;
      author_name?: string;
      thumbnail_url?: string;
    };

    return {
      videoId,
      title: data.title?.trim() || fallback.title,
      authorName: data.author_name?.trim() || fallback.authorName,
      thumbnailUrl: data.thumbnail_url || fallback.thumbnailUrl,
    };
  } catch (err) {
    if (err instanceof Error && err.message === 'VIDEO_NOT_FOUND') {
      throw err;
    }
    return fallback;
  }
}

function scheduleRoomCleanupIfEmpty(room: Room): void {
  if (room.users.size === 0) {
    if (room.cleanupTimer) clearTimeout(room.cleanupTimer);
    room.cleanupTimer = setTimeout(() => {
      const latest = rooms.get(room.code);
      if (latest && latest.users.size === 0) {
        rooms.delete(room.code);
      }
    }, 60_000);
  }
}

function removeUserImmediately(roomCode: string, userId: string): void {
  const room = rooms.get(roomCode);
  if (!room) return;
  const existing = room.users.get(userId);
  if (!existing) return;

  if (existing.disconnectTimer) {
    clearTimeout(existing.disconnectTimer);
    existing.disconnectTimer = null;
  }

  room.users.delete(userId);
  broadcastToRoom(room, { type: 'user_left', userId });
  const sysMsg = appendSystemMessage(room, `${existing.user.name} đã rời rạp.`);
  broadcastToRoom(room, { type: 'chat_message', message: sysMsg });
  if (room.users.size === 0) {
    room.hostId = null;
  }
  scheduleRoomCleanupIfEmpty(room);
}

function scheduleUserRemoval(ws: WebSocket): void {
  const meta = socketMetaMap.get(ws);
  if (!meta || !meta.roomCode || !meta.userId) return;

  const { roomCode, userId } = meta;
  meta.roomCode = null;
  meta.userId = null;

  const room = rooms.get(roomCode);
  const entry = room?.users.get(userId);
  if (!room || !entry) return;

  // Only start grace timer if this ws is still the active socket for the entry
  if (entry.ws && entry.ws !== ws) return;

  entry.ws = null;
  if (entry.disconnectTimer) {
    clearTimeout(entry.disconnectTimer);
  }

  // 25s grace period so tab-switching / brief backgrounding never spams left + rejoin
  entry.disconnectTimer = setTimeout(() => {
    const latestRoom = rooms.get(roomCode);
    const latestEntry = latestRoom?.users.get(userId);
    if (latestEntry && latestEntry.ws === null) {
      removeUserImmediately(roomCode, userId);
    }
  }, 25_000);
}

async function startServer() {
  const app = express();
  app.use(express.json());

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, rooms: rooms.size });
  });

  app.get('/api/rooms', (_req, res) => {
    const list: RoomSummary[] = [];
    for (const room of rooms.values()) {
      if (room.users.size > 0) {
        list.push({
          roomCode: room.code,
          userCount: room.users.size,
          currentTitle: room.currentItem ? room.currentItem.title : null,
          isLocked: room.isLocked,
          hasPassword: Boolean(room.password),
        });
      }
    }
    list.sort((a, b) => b.userCount - a.userCount);
    res.json({ rooms: list.slice(0, 8) });
  });

  app.get('/api/rooms/:code/status', (req, res) => {
    const roomCode = sanitizeRoomCode(req.params.code);
    const room = rooms.get(roomCode);
    const hostEntry = room?.hostId ? room.users.get(room.hostId) : undefined;
    const payload: RoomLookupStatus = {
      exists: Boolean(room && room.users.size > 0),
      roomCode,
      userCount: room ? room.users.size : 0,
      isLocked: room ? room.isLocked : false,
      hasPassword: room ? Boolean(room.password) : false,
      hostName: hostEntry ? hostEntry.user.name : null,
    };
    res.json(payload);
  });

  app.get('/api/oembed', async (req, res) => {
    const videoId = String(req.query.videoId || '').trim();
    if (!/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
      res.status(400).json({ error: 'Mã video YouTube không hợp lệ.' });
      return;
    }

    try {
      const info = await fetchYouTubeOEmbed(videoId);
      res.json(info);
    } catch {
      res.status(404).json({ error: 'Không tìm thấy video YouTube hoặc video bị hạn chế.' });
    }
  });

  app.get('/api/thumbnail', async (req, res) => {
    const videoId = String(req.query.videoId || '').trim();
    const frameRaw = Number(req.query.frame ?? 0);
    const frame = Number.isInteger(frameRaw) && frameRaw >= 0 && frameRaw <= 3 ? frameRaw : 0;

    if (!/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
      res.status(400).end();
      return;
    }

    const cacheKey = `${videoId}:${frame}`;
    const cached = thumbnailCache.get(cacheKey);
    if (cached) {
      res.setHeader('Content-Type', cached.contentType);
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.send(cached.buf);
      return;
    }

    const urlsByFrame: Record<number, string[]> = {
      0: [
        `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
        `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
      ],
      1: [
        `https://i.ytimg.com/vi/${videoId}/hq1.jpg`,
        `https://i.ytimg.com/vi/${videoId}/1.jpg`,
        `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      ],
      2: [
        `https://i.ytimg.com/vi/${videoId}/hq2.jpg`,
        `https://i.ytimg.com/vi/${videoId}/2.jpg`,
        `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      ],
      3: [
        `https://i.ytimg.com/vi/${videoId}/hq3.jpg`,
        `https://i.ytimg.com/vi/${videoId}/3.jpg`,
        `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      ],
    };

    const urls = urlsByFrame[frame] || urlsByFrame[0];

    for (const targetUrl of urls) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 4500);
        const resp = await fetch(targetUrl, { signal: controller.signal });
        clearTimeout(timeout);
        if (!resp.ok) continue;
        const arrBuf = await resp.arrayBuffer();
        const buf = Buffer.from(arrBuf);
        const contentType = resp.headers.get('content-type') || 'image/jpeg';

        if (thumbnailCache.size >= 160) {
          const oldestKey = thumbnailCache.keys().next().value;
          if (oldestKey) thumbnailCache.delete(oldestKey);
        }
        thumbnailCache.set(cacheKey, { buf, contentType });

        res.setHeader('Content-Type', contentType);
        res.setHeader('Cache-Control', 'public, max-age=3600');
        res.send(buf);
        return;
      } catch {
        // try next fallback URL
      }
    }

    res.status(404).end();
  });

  app.get('/api/storyboard', async (req, res) => {
    const videoId = String(req.query.videoId || '').trim();
    if (!/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
      res.status(400).json({ available: false });
      return;
    }

    const spec = await fetchYouTubeStoryboardSpec(videoId);
    if (!spec) {
      res.json({ available: false });
      return;
    }

    res.json({
      available: true,
      frameWidth: spec.frameWidth,
      frameHeight: spec.frameHeight,
      frameCount: spec.frameCount,
      cols: spec.cols,
      rows: spec.rows,
      intervalMs: spec.intervalMs,
      sheetCount: spec.sheetCount,
    });
  });

  app.get('/api/storyboard-sheet', async (req, res) => {
    const videoId = String(req.query.videoId || '').trim();
    const sheetRaw = Number(req.query.sheet ?? 0);
    if (!/^[a-zA-Z0-9_-]{11}$/.test(videoId) || !Number.isInteger(sheetRaw) || sheetRaw < 0) {
      res.status(400).end();
      return;
    }

    const spec = await fetchYouTubeStoryboardSpec(videoId);
    if (!spec || sheetRaw >= spec.sheetCount) {
      res.status(404).end();
      return;
    }

    const cacheKey = `${videoId}:${spec.levelIndex}:${sheetRaw}`;
    const cached = storyboardSheetCache.get(cacheKey);
    if (cached) {
      res.setHeader('Content-Type', cached.contentType);
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.send(cached.buf);
      return;
    }

    const fileName = spec.namePattern.includes('$M')
      ? spec.namePattern.replace('$M', String(sheetRaw))
      : spec.namePattern;
    const urlWithLevel = spec.baseUrl
      .replace('$L', String(spec.levelIndex))
      .replace('$N', fileName);
    const sep = urlWithLevel.includes('?') ? '&' : '?';
    const sheetUrl = `${urlWithLevel}${sep}sigh=${encodeURIComponent(spec.sigh)}`;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const resp = await fetch(sheetUrl, { signal: controller.signal });
      clearTimeout(timeout);
      if (!resp.ok) {
        res.status(404).end();
        return;
      }

      const arrBuf = await resp.arrayBuffer();
      const buf = Buffer.from(arrBuf);
      const contentType = resp.headers.get('content-type') || 'image/jpeg';

      if (storyboardSheetCache.size >= 120) {
        const oldest = storyboardSheetCache.keys().next().value;
        if (oldest) storyboardSheetCache.delete(oldest);
      }
      storyboardSheetCache.set(cacheKey, { buf, contentType });

      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.send(buf);
    } catch {
      res.status(502).end();
    }
  });

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws: WebSocket) => {
    socketMetaMap.set(ws, { roomCode: null, userId: null, missedPings: 0, lastEmoteAt: 0 });

    ws.on('pong', () => {
      const meta = socketMetaMap.get(ws);
      if (meta) meta.missedPings = 0;
    });

    ws.on('message', async (rawData) => {
      let event: ClientEvent;
      try {
        event = JSON.parse(rawData.toString()) as ClientEvent;
      } catch {
        sendEvent(ws, { type: 'error', message: 'Dữ liệu gửi lên không hợp lệ.' });
        return;
      }

      const meta = socketMetaMap.get(ws);
      if (!meta) return;
      meta.missedPings = 0;

      if (event.type === 'ping') {
        sendEvent(ws, { type: 'pong', serverTime: Date.now() });
        return;
      }

      if (event.type === 'leave_room') {
        if (meta.roomCode && meta.userId) {
          const oldRoom = meta.roomCode;
          const oldUser = meta.userId;
          meta.roomCode = null;
          meta.userId = null;
          removeUserImmediately(oldRoom, oldUser);
        }
        return;
      }

      if (event.type === 'join_room') {
        const roomCode = sanitizeRoomCode(event.roomCode);
        const name = String(event.user?.name || 'Khán giả').trim().slice(0, 24) || 'Khán giả';
        const shirtColor = String(event.user?.shirtColor || '#DC2626').trim();
        const rawClientId = String(event.clientId || '').trim().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
        const userId = rawClientId || randomUUID();

        // If switching rooms on the same socket, leave the previous room cleanly
        if (meta.roomCode && meta.userId && (meta.roomCode !== roomCode || meta.userId !== userId)) {
          const oldRoom = meta.roomCode;
          const oldUser = meta.userId;
          meta.roomCode = null;
          meta.userId = null;
          removeUserImmediately(oldRoom, oldUser);
        }

        const { room, isNew } = getOrCreateRoom(roomCode);
        const existingEntry = room.users.get(userId);

        if (existingEntry) {
          if (existingEntry.disconnectTimer) {
            clearTimeout(existingEntry.disconnectTimer);
            existingEntry.disconnectTimer = null;
          }
          if (existingEntry.ws && existingEntry.ws !== ws) {
            const oldMeta = socketMetaMap.get(existingEntry.ws);
            if (oldMeta) {
              oldMeta.roomCode = null;
              oldMeta.userId = null;
            }
            try {
              existingEntry.ws.close();
            } catch {
              // ignore
            }
          }
          existingEntry.ws = ws;
          existingEntry.user.name = name;
          existingEntry.user.shirtColor = shirtColor;
          existingEntry.user.isHost = room.hostId === userId;
          meta.roomCode = roomCode;
          meta.userId = userId;

          sendEvent(ws, {
            type: 'room_state',
            payload: {
              roomCode: room.code,
              selfId: userId,
              hostId: room.hostId || '',
              settings: toPublicSettings(room),
              users: Array.from(room.users.values()).map((entry) => entry.user),
              queue: room.queue,
              currentItem: room.currentItem,
              trackHearts: room.trackHearts,
              playback: room.playback,
              messages: room.messages,
              serverTime: Date.now(),
            },
          });
          return;
        }

        const isCreatorJoining = isNew || (room.users.size === 0 && !room.hostId);
        if (isCreatorJoining) {
          room.hostId = userId;
          if (event.createSettings) {
            room.isLocked = Boolean(event.createSettings.isLocked);
            const rawPw = String(event.createSettings.password || '').trim().slice(0, 32);
            room.password = rawPw || null;
            room.theme = sanitizeTheme(event.createSettings.theme, 'cinema');
            room.defaultPermissions = normalizePermissions(event.createSettings.defaultPermissions);
          }
        } else if (room.hostId !== userId) {
          if (room.isLocked) {
            sendEvent(ws, {
              type: 'join_rejected',
              reason: 'locked',
              message: 'Phòng chiếu này đang bị chủ phòng khóa, không nhận thêm thành viên mới.',
            });
            return;
          }
          if (room.password) {
            const providedPw = String(event.password || '').trim();
            if (!providedPw) {
              sendEvent(ws, {
                type: 'join_rejected',
                reason: 'password_required',
                message: 'Phòng chiếu này có đặt mật khẩu. Vui lòng nhập mật khẩu để vào rạp.',
              });
              return;
            }
            if (providedPw !== room.password) {
              sendEvent(ws, {
                type: 'join_rejected',
                reason: 'wrong_password',
                message: 'Mật khẩu phòng không chính xác.',
              });
              return;
            }
          }
        }

        const isHost = room.hostId === userId;
        const seatIndex = allocateSeatIndex(room);
        const user: TheaterUser = {
          id: userId,
          name,
          shirtColor,
          seatIndex,
          joinedAt: Date.now(),
          isHost,
          permissions: isHost
            ? { canAddQueue: true, canControlPlayback: true, canEmote: true }
            : { ...room.defaultPermissions },
        };

        room.users.set(userId, { user, ws, disconnectTimer: null });
        meta.roomCode = roomCode;
        meta.userId = userId;

        const sysMsg = appendSystemMessage(
          room,
          isHost
            ? `${user.name} (Chủ phòng) vừa mở rạp (ghế #${seatIndex + 1}).`
            : `${user.name} vừa bước vào rạp (ghế #${seatIndex + 1}).`
        );

        sendEvent(ws, {
          type: 'room_state',
          payload: {
            roomCode: room.code,
            selfId: userId,
            hostId: room.hostId || '',
            settings: toPublicSettings(room),
            users: Array.from(room.users.values()).map((entry) => entry.user),
            queue: room.queue,
            currentItem: room.currentItem,
            trackHearts: room.trackHearts,
            playback: room.playback,
            messages: room.messages,
            serverTime: Date.now(),
          },
        });

        broadcastToRoom(room, { type: 'user_joined', user }, userId);
        broadcastToRoom(room, { type: 'chat_message', message: sysMsg }, userId);
        return;
      }

      if (!meta.roomCode || !meta.userId) {
        sendEvent(ws, { type: 'error', message: 'Bạn chưa tham gia phòng chiếu nào.' });
        return;
      }

      const room = rooms.get(meta.roomCode);
      const actor = room?.users.get(meta.userId)?.user;
      if (!room || !actor) {
        sendEvent(ws, { type: 'error', message: 'Phòng chiếu không còn tồn tại.' });
        return;
      }

      const actorIsHost = isRoomHost(room, actor.id);

      if (event.type === 'room_settings_update') {
        if (!actorIsHost) {
          sendEvent(ws, { type: 'error', message: 'Chỉ chủ phòng mới có thể thay đổi cài đặt phòng.' });
          return;
        }

        const changes: string[] = [];
        if (typeof event.isLocked === 'boolean' && event.isLocked !== room.isLocked) {
          room.isLocked = event.isLocked;
          changes.push(room.isLocked ? 'đã khóa phòng' : 'đã mở khóa phòng');
        }

        if (event.password !== undefined) {
          const cleanPw = event.password === null ? '' : String(event.password).trim().slice(0, 32);
          const nextPw = cleanPw || null;
          if (nextPw !== room.password) {
            room.password = nextPw;
            changes.push(nextPw ? 'đã đặt mật khẩu phòng' : 'đã gỡ mật khẩu phòng');
          }
        }

        if (event.theme !== undefined) {
          const nextTheme = sanitizeTheme(event.theme, room.theme);
          if (nextTheme !== room.theme) {
            room.theme = nextTheme;
            changes.push(`đã đổi không gian sang ${THEME_LABELS[nextTheme]}`);
          }
        }

        if (event.defaultPermissions) {
          room.defaultPermissions = normalizePermissions(
            event.defaultPermissions,
            room.defaultPermissions
          );
        }

        if (event.applyToAllMembers) {
          for (const entry of room.users.values()) {
            if (!isRoomHost(room, entry.user.id)) {
              entry.user.permissions = { ...room.defaultPermissions };
            }
          }
          broadcastToRoom(room, {
            type: 'users_synced',
            users: Array.from(room.users.values()).map((entry) => entry.user),
            hostId: room.hostId || '',
          });
          changes.push('đã áp dụng quyền mặc định cho cả rạp');
        }

        broadcastToRoom(room, {
          type: 'room_settings_updated',
          settings: toPublicSettings(room),
          hostId: room.hostId || '',
        });

        if (changes.length > 0) {
          const sysMsg = appendSystemMessage(room, `${actor.name} ${changes.join(', ')}.`);
          broadcastToRoom(room, { type: 'chat_message', message: sysMsg });
        }
        return;
      }

      if (event.type === 'member_permissions_update') {
        if (!actorIsHost) {
          sendEvent(ws, { type: 'error', message: 'Chỉ chủ phòng mới có thể chỉnh quyền thành viên.' });
          return;
        }

        const targetEntry = room.users.get(event.targetUserId);
        if (!targetEntry) return;
        if (isRoomHost(room, targetEntry.user.id)) {
          sendEvent(ws, { type: 'error', message: 'Không thể tự giới hạn quyền của chủ phòng.' });
          return;
        }

        targetEntry.user.permissions = normalizePermissions(
          event.permissions,
          targetEntry.user.permissions
        );

        broadcastToRoom(room, { type: 'user_updated', user: targetEntry.user });
        const sysMsg = appendSystemMessage(
          room,
          `${actor.name} đã cập nhật quyền tương tác cho ${targetEntry.user.name}.`
        );
        broadcastToRoom(room, { type: 'chat_message', message: sysMsg });
        return;
      }

      if (event.type === 'kick_member') {
        if (!actorIsHost) {
          sendEvent(ws, { type: 'error', message: 'Chỉ chủ phòng mới có quyền mời thành viên ra khỏi rạp.' });
          return;
        }
        if (event.targetUserId === actor.id) {
          sendEvent(ws, { type: 'error', message: 'Không thể tự kick chính mình.' });
          return;
        }

        const targetEntry = room.users.get(event.targetUserId);
        if (!targetEntry) return;

        if (targetEntry.disconnectTimer) {
          clearTimeout(targetEntry.disconnectTimer);
          targetEntry.disconnectTimer = null;
        }

        const targetWs = targetEntry.ws;
        if (targetWs) {
          const targetMeta = socketMetaMap.get(targetWs);
          if (targetMeta) {
            targetMeta.roomCode = null;
            targetMeta.userId = null;
          }
          if (targetWs.readyState === WebSocket.OPEN) {
            targetWs.send(
              JSON.stringify({
                type: 'kicked',
                message: 'Bạn đã bị chủ phòng mời ra khỏi rạp.',
              } satisfies ServerEvent),
              () => {
                try {
                  targetWs.close(4001, 'KICKED');
                } catch {
                  // ignore
                }
              }
            );
          }
        }

        room.users.delete(event.targetUserId);
        broadcastToRoom(room, { type: 'user_left', userId: event.targetUserId });
        const sysMsg = appendSystemMessage(
          room,
          `${targetEntry.user.name} đã bị chủ phòng mời ra khỏi rạp.`
        );
        broadcastToRoom(room, { type: 'chat_message', message: sysMsg });
        return;
      }

      if (event.type === 'transfer_host') {
        if (!actorIsHost) {
          sendEvent(ws, { type: 'error', message: 'Chỉ chủ phòng hiện tại mới có thể nhường quyền.' });
          return;
        }
        if (event.targetUserId === actor.id) return;

        const targetEntry = room.users.get(event.targetUserId);
        const actorEntry = room.users.get(actor.id);
        if (!targetEntry || !actorEntry) return;

        room.hostId = targetEntry.user.id;
        actorEntry.user.isHost = false;
        actorEntry.user.permissions = { ...room.defaultPermissions };
        targetEntry.user.isHost = true;
        targetEntry.user.permissions = {
          canAddQueue: true,
          canControlPlayback: true,
          canEmote: true,
        };

        broadcastToRoom(room, {
          type: 'users_synced',
          users: Array.from(room.users.values()).map((entry) => entry.user),
          hostId: room.hostId,
        });
        broadcastToRoom(room, {
          type: 'room_settings_updated',
          settings: toPublicSettings(room),
          hostId: room.hostId,
        });
        const sysMsg = appendSystemMessage(
          room,
          `${actor.name} đã nhường quyền chủ phòng cho ${targetEntry.user.name}.`
        );
        broadcastToRoom(room, { type: 'chat_message', message: sysMsg });
        return;
      }

      if (event.type === 'playback_control') {
        if (!actorIsHost && !actor.permissions.canControlPlayback) {
          sendEvent(ws, {
            type: 'error',
            message: 'Bạn chưa được chủ phòng cấp quyền phát, tạm dừng hoặc tua video.',
          });
          return;
        }

        const safePosition = Number.isFinite(event.position) ? Math.max(0, event.position) : 0;
        const now = Date.now();
        if (event.action === 'play') {
          room.playback = { isPlaying: true, position: safePosition, updatedAt: now };
        } else if (event.action === 'pause') {
          room.playback = { isPlaying: false, position: safePosition, updatedAt: now };
        } else if (event.action === 'seek') {
          room.playback = {
            isPlaying: room.playback.isPlaying,
            position: safePosition,
            updatedAt: now,
          };
        }

        broadcastToRoom(room, {
          type: 'playback_updated',
          playback: room.playback,
          serverTime: now,
          actorName: actor.name,
        });
        return;
      }

      if (event.type === 'queue_add') {
        if (!actorIsHost && !actor.permissions.canAddQueue) {
          sendEvent(ws, {
            type: 'error',
            message: 'Bạn chưa được chủ phòng cấp quyền thêm bài vào hàng chờ.',
          });
          return;
        }

        const videoId = String(event.videoId || '').trim();
        if (!/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
          sendEvent(ws, { type: 'error', message: 'Liên kết YouTube không hợp lệ.' });
          return;
        }

        let title = event.title?.trim();
        let authorName = event.authorName?.trim() || 'YouTube';
        let thumbnailUrl =
          event.thumbnailUrl?.trim() || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

        if (!title) {
          try {
            const info = await fetchYouTubeOEmbed(videoId);
            title = info.title;
            authorName = info.authorName;
            thumbnailUrl = info.thumbnailUrl;
          } catch {
            sendEvent(ws, {
              type: 'error',
              message: 'Không tìm thấy video YouTube này hoặc video không cho phép phát nhúng.',
            });
            return;
          }
        }

        const item: QueueItem = {
          id: randomUUID(),
          videoId,
          title,
          authorName,
          thumbnailUrl,
          addedBy: actor.name,
          addedAt: Date.now(),
        };

        if (!room.currentItem) {
          room.currentItem = item;
          room.trackHearts = 0;
          const now = Date.now();
          room.playback = { isPlaying: true, position: 0, updatedAt: now };
          broadcastToRoom(room, {
            type: 'track_changed',
            currentItem: room.currentItem,
            queue: room.queue,
            trackHearts: room.trackHearts,
            playback: room.playback,
            serverTime: now,
          });
          const sysMsg = appendSystemMessage(room, `${actor.name} đã bật "${item.title}".`);
          broadcastToRoom(room, { type: 'chat_message', message: sysMsg });
        } else {
          room.queue.push(item);
          broadcastToRoom(room, { type: 'queue_updated', queue: room.queue });
          const sysMsg = appendSystemMessage(room, `${actor.name} đã thêm "${item.title}" vào hàng chờ.`);
          broadcastToRoom(room, { type: 'chat_message', message: sysMsg });
        }
        return;
      }

      if (event.type === 'queue_next') {
        if (event.reason !== 'ended' && !actorIsHost && !actor.permissions.canAddQueue) {
          sendEvent(ws, {
            type: 'error',
            message: 'Bạn chưa được chủ phòng cấp quyền chuyển bài.',
          });
          return;
        }
        if (
          event.expectedCurrentId &&
          room.currentItem &&
          room.currentItem.id !== event.expectedCurrentId
        ) {
          return;
        }
        const nextItem = room.queue.shift() || null;
        room.currentItem = nextItem;
        room.trackHearts = 0;
        const now = Date.now();
        room.playback = {
          isPlaying: Boolean(nextItem),
          position: 0,
          updatedAt: now,
        };
        broadcastToRoom(room, {
          type: 'track_changed',
          currentItem: room.currentItem,
          queue: room.queue,
          trackHearts: room.trackHearts,
          playback: room.playback,
          serverTime: now,
        });
        return;
      }

      if (event.type === 'queue_play_now') {
        if (!actorIsHost && !actor.permissions.canAddQueue) {
          sendEvent(ws, {
            type: 'error',
            message: 'Bạn chưa được chủ phòng cấp quyền chọn phát bài.',
          });
          return;
        }
        const idx = room.queue.findIndex((q) => q.id === event.itemId);
        if (idx === -1) return;
        const [picked] = room.queue.splice(idx, 1);
        room.currentItem = picked;
        room.trackHearts = 0;
        const now = Date.now();
        room.playback = { isPlaying: true, position: 0, updatedAt: now };
        broadcastToRoom(room, {
          type: 'track_changed',
          currentItem: room.currentItem,
          queue: room.queue,
          trackHearts: room.trackHearts,
          playback: room.playback,
          serverTime: now,
        });
        const sysMsg = appendSystemMessage(room, `${actor.name} chuyển sang bài "${picked.title}".`);
        broadcastToRoom(room, { type: 'chat_message', message: sysMsg });
        return;
      }

      if (event.type === 'queue_remove') {
        if (!actorIsHost && !actor.permissions.canAddQueue) {
          sendEvent(ws, {
            type: 'error',
            message: 'Bạn chưa được chủ phòng cấp quyền xóa bài khỏi hàng chờ.',
          });
          return;
        }
        const beforeLen = room.queue.length;
        room.queue = room.queue.filter((q) => q.id !== event.itemId);
        if (room.queue.length !== beforeLen) {
          broadcastToRoom(room, { type: 'queue_updated', queue: room.queue });
        }
        return;
      }

      if (event.type === 'chat_send') {
        const cleanText = String(event.text || '').trim().slice(0, 300);
        if (!cleanText) return;
        const msg: ChatMessage = {
          id: randomUUID(),
          userId: actor.id,
          userName: actor.name,
          shirtColor: actor.shirtColor,
          text: cleanText,
          timestamp: Date.now(),
        };
        room.messages.push(msg);
        if (room.messages.length > 60) {
          room.messages.shift();
        }
        broadcastToRoom(room, { type: 'chat_message', message: msg });
        return;
      }

      if (event.type === 'emote_send') {
        if (!actorIsHost && !actor.permissions.canEmote) {
          sendEvent(ws, {
            type: 'error',
            message: 'Chủ phòng đã tạm khóa quyền gửi emote của bạn.',
          });
          return;
        }
        if (!VALID_EMOTES.has(event.emote)) return;
        const now = Date.now();
        if (now - meta.lastEmoteAt < 250) return;
        meta.lastEmoteAt = now;

        broadcastToRoom(room, {
          type: 'emote_triggered',
          userId: actor.id,
          userName: actor.name,
          emote: event.emote,
          timestamp: now,
        });
        return;
      }

      if (event.type === 'heart_send') {
        if (!actorIsHost && !actor.permissions.canEmote) {
          sendEvent(ws, {
            type: 'error',
            message: 'Chủ phòng đã tạm khóa quyền thả tim của bạn.',
          });
          return;
        }
        if (!room.currentItem) return;
        room.trackHearts += 1;
        broadcastToRoom(room, {
          type: 'heart_burst',
          userId: actor.id,
          userName: actor.name,
          shirtColor: actor.shirtColor,
          totalHearts: room.trackHearts,
          timestamp: Date.now(),
        });
      }
    });

    ws.on('close', () => {
      scheduleUserRemoval(ws);
    });

    ws.on('error', () => {
      scheduleUserRemoval(ws);
    });
  });

  const heartbeatInterval = setInterval(() => {
    for (const client of wss.clients) {
      const meta = socketMetaMap.get(client);
      if (!meta) continue;
      if (meta.missedPings >= 3) {
        scheduleUserRemoval(client);
        client.terminate();
        continue;
      }
      meta.missedPings += 1;
      client.ping();
    }
  }, 25_000);

  wss.on('close', () => {
    clearInterval(heartbeatInterval);
  });

  if (IS_PROD) {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Rạp Nhạc Chung server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
