import { useCallback, useEffect, useRef, useState } from 'react';
import { Copy, Check, LogOut, Users, Crown, Shield, Lock, KeyRound } from 'lucide-react';
import {
  DEFAULT_MEMBER_PERMISSIONS,
  type ActiveEmote,
  type AmbientPalette,
  type ChatMessage,
  type ClientEvent,
  type EmoteType,
  type HeartBurst,
  type MemberPermissions,
  type PlaybackState,
  type QueueItem,
  type RoomCreateSettings,
  type RoomSettings,
  type ServerEvent,
  type TheaterThemeId,
  type TheaterUser,
} from './types';
import { normalizeRoomCode } from './utils/youtube';
import {
  NEUTRAL_AMBIENT_PALETTE,
  computeLiveAmbientPalette,
  extractVideoAmbientTimeline,
  type AmbientTimeline,
} from './utils/ambientColors';
import {
  playEmoteSound,
  playHeartPopSound,
  unlockEmoteAudio,
} from './utils/emoteAudio';
import { LandingScreen } from './components/LandingScreen';
import { CinemaStage } from './components/CinemaStage';
import { EmoteBar } from './components/EmoteBar';
import { TheaterSeats } from './components/TheaterSeats';
import { QueuePanel } from './components/QueuePanel';
import { ChatPanel } from './components/ChatPanel';
import { MemberInspectorModal } from './components/MemberInspectorModal';
import { RoomSettingsModal } from './components/RoomSettingsModal';

interface SessionProfile {
  name: string;
  shirtColor: string;
  roomCode: string;
  password?: string;
  createSettings?: RoomCreateSettings;
}

const AMBIENT_STORAGE_KEY = 'rnc_ambient_lighting';
const EMOTE_SOUND_STORAGE_KEY = 'rnc_emote_sound';
const THEME_STORAGE_KEY = 'rnc_local_theme';
const TAB_CLIENT_ID_KEY = 'rnc_tab_client_id';
const EMOTE_DURATION_MS = 2400;

function readBoolPref(key: string, fallback: boolean): boolean {
  if (typeof window === 'undefined') return fallback;
  const raw = window.localStorage.getItem(key);
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  return fallback;
}

function readLocalThemePref(): 'room' | TheaterThemeId {
  if (typeof window === 'undefined') return 'room';
  const raw = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (raw === 'cinema' || raw === 'vinyl' || raw === 'edm' || raw === 'opera') {
    return raw;
  }
  return 'room';
}

function getTabClientId(): string {
  if (typeof window === 'undefined') return 'tab-ssr';
  try {
    const existing = window.sessionStorage.getItem(TAB_CLIENT_ID_KEY);
    if (existing) return existing;
    const created =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `tab-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    window.sessionStorage.setItem(TAB_CLIENT_ID_KEY, created);
    return created;
  } catch {
    return `tab-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }
}

export default function App() {
  const initialUrlCode = (() => {
    if (typeof window === 'undefined') return '';
    const params = new URLSearchParams(window.location.search);
    return normalizeRoomCode(params.get('room') || '');
  })();

  const [tabClientId] = useState<string>(() => getTabClientId());
  const [session, setSession] = useState<SessionProfile | null>(null);
  const [hasJoinedCinema, setHasJoinedCinema] = useState(false);

  const [landingError, setLandingError] = useState('');
  const [landingRequiresPassword, setLandingRequiresPassword] = useState(false);

  const [selfId, setSelfId] = useState<string | null>(null);
  const [hostId, setHostId] = useState<string>('');
  const [roomSettings, setRoomSettings] = useState<RoomSettings>({
    isLocked: false,
    hasPassword: false,
    theme: 'cinema',
    defaultPermissions: { ...DEFAULT_MEMBER_PERMISSIONS },
  });
  const [users, setUsers] = useState<TheaterUser[]>([]);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [currentItem, setCurrentItem] = useState<QueueItem | null>(null);
  const [trackHearts, setTrackHearts] = useState(0);
  const [heartBursts, setHeartBursts] = useState<HeartBurst[]>([]);
  const [playback, setPlayback] = useState<PlaybackState>({
    isPlaying: false,
    position: 0,
    updatedAt: Date.now(),
  });
  const [videoDurationSec, setVideoDurationSec] = useState(180);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [activeEmotes, setActiveEmotes] = useState<Record<string, ActiveEmote>>({});
  const [ambientTimeline, setAmbientTimeline] = useState<AmbientTimeline | null>(null);
  const [ambientPalette, setAmbientPalette] = useState<AmbientPalette>(NEUTRAL_AMBIENT_PALETTE);

  const [inspectedUserId, setInspectedUserId] = useState<string | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const [ambientLightingEnabled, setAmbientLightingEnabled] = useState<boolean>(() =>
    readBoolPref(AMBIENT_STORAGE_KEY, true)
  );
  const [emoteSoundEnabled, setEmoteSoundEnabled] = useState<boolean>(() =>
    readBoolPref(EMOTE_SOUND_STORAGE_KEY, true)
  );
  const [localThemePreference, setLocalThemePreference] = useState<'room' | TheaterThemeId>(() =>
    readLocalThemePref()
  );

  const [clockOffsetMs, setClockOffsetMs] = useState(0);
  const [wsStatus, setWsStatus] = useState<'connecting' | 'connected' | 'reconnecting'>('connecting');
  const [errorBanner, setErrorBanner] = useState('');
  const [copiedCode, setCopiedCode] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const sessionRef = useRef<SessionProfile | null>(null);
  const emoteSoundRef = useRef<boolean>(emoteSoundEnabled);
  const emoteTimersRef = useRef<Map<string, number>>(new Map());
  const playbackRef = useRef<PlaybackState>(playback);
  const clockOffsetRef = useRef<number>(clockOffsetMs);
  const durationRef = useRef<number>(videoDurationSec);

  sessionRef.current = session;
  emoteSoundRef.current = emoteSoundEnabled;
  playbackRef.current = playback;
  clockOffsetRef.current = clockOffsetMs;
  durationRef.current = videoDurationSec;

  const sendEvent = useCallback((event: ClientEvent) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(event));
    }
  }, []);

  const resetRoomClientState = useCallback(() => {
    setHasJoinedCinema(false);
    setSelfId(null);
    setHostId('');
    setRoomSettings({
      isLocked: false,
      hasPassword: false,
      theme: 'cinema',
      defaultPermissions: { ...DEFAULT_MEMBER_PERMISSIONS },
    });
    setUsers([]);
    setQueue([]);
    setCurrentItem(null);
    setTrackHearts(0);
    setHeartBursts([]);
    setMessages([]);
    setActiveEmotes({});
    setInspectedUserId(null);
    setIsSettingsOpen(false);
    setAmbientTimeline(null);
    setAmbientPalette(NEUTRAL_AMBIENT_PALETTE);
  }, []);

  // Extract storyboard/frame timeline whenever current track changes
  useEffect(() => {
    setVideoDurationSec(180);
    if (!currentItem?.videoId) {
      setAmbientTimeline(null);
      setAmbientPalette(NEUTRAL_AMBIENT_PALETTE);
      return;
    }

    let cancelled = false;
    extractVideoAmbientTimeline(currentItem.videoId).then((timeline) => {
      if (!cancelled) {
        setAmbientTimeline(timeline);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [currentItem?.videoId]);

  // Continuously update Ambilight frame colors along the video's playback timeline
  useEffect(() => {
    if (
      !ambientLightingEnabled ||
      !hasJoinedCinema ||
      !currentItem ||
      !ambientTimeline ||
      ambientTimeline.frames.length === 0
    ) {
      setAmbientPalette(NEUTRAL_AMBIENT_PALETTE);
      return;
    }

    const updateFrameColors = () => {
      const pb = playbackRef.current;
      const estimatedPos = pb.isPlaying
        ? pb.position + Math.max(0, (Date.now() + clockOffsetRef.current - pb.updatedAt) / 1000)
        : pb.position;
      setAmbientPalette(
        computeLiveAmbientPalette(
          ambientTimeline,
          estimatedPos,
          durationRef.current,
          pb.isPlaying
        )
      );
    };

    updateFrameColors();
    if (!playback.isPlaying) return;

    const timer = window.setInterval(updateFrameColors, 120);
    return () => window.clearInterval(timer);
  }, [
    ambientLightingEnabled,
    hasJoinedCinema,
    currentItem?.id,
    ambientTimeline,
    videoDurationSec,
    playback.isPlaying,
    playback.position,
    playback.updatedAt,
  ]);

  useEffect(() => {
    if (!session) return;

    let intentionallyClosed = false;

    const connect = () => {
      if (intentionallyClosed) return;
      if (reconnectTimerRef.current !== null) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }

      const existing = wsRef.current;
      if (existing && (existing.readyState === WebSocket.OPEN || existing.readyState === WebSocket.CONNECTING)) {
        return;
      }

      setWsStatus((prev) => (prev === 'connected' ? 'connected' : 'connecting'));
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setWsStatus('connected');
        setErrorBanner('');
        const active = sessionRef.current;
        if (active) {
          ws.send(
            JSON.stringify({
              type: 'join_room',
              roomCode: active.roomCode,
              clientId: tabClientId,
              password: active.password,
              createSettings: active.createSettings,
              user: { name: active.name, shirtColor: active.shirtColor },
            } satisfies ClientEvent)
          );
        }
      };

      ws.onmessage = (ev) => {
        let data: ServerEvent;
        try {
          data = JSON.parse(ev.data) as ServerEvent;
        } catch {
          return;
        }

        switch (data.type) {
          case 'pong': {
            setClockOffsetMs(data.serverTime - Date.now());
            break;
          }
          case 'room_state': {
            const p = data.payload;
            setSelfId(p.selfId);
            setHostId(p.hostId);
            setRoomSettings(p.settings);
            setUsers(p.users);
            setQueue(p.queue);
            setCurrentItem(p.currentItem);
            setTrackHearts(p.trackHearts ?? 0);
            setPlayback(p.playback);
            setMessages(p.messages);
            setClockOffsetMs(p.serverTime - Date.now());
            setLandingError('');
            setLandingRequiresPassword(false);
            break;
          }
          case 'room_settings_updated': {
            setRoomSettings(data.settings);
            setHostId(data.hostId);
            break;
          }
          case 'user_joined': {
            setUsers((prev) => {
              if (prev.some((u) => u.id === data.user.id)) return prev;
              return [...prev, data.user];
            });
            break;
          }
          case 'user_updated': {
            setUsers((prev) =>
              prev.map((u) => (u.id === data.user.id ? data.user : u))
            );
            break;
          }
          case 'users_synced': {
            setUsers(data.users);
            setHostId(data.hostId);
            break;
          }
          case 'user_left': {
            setUsers((prev) => prev.filter((u) => u.id !== data.userId));
            setInspectedUserId((prev) => (prev === data.userId ? null : prev));
            setActiveEmotes((prev) => {
              if (!(data.userId in prev)) return prev;
              const copy = { ...prev };
              delete copy[data.userId];
              return copy;
            });
            break;
          }
          case 'join_rejected': {
            intentionallyClosed = true;
            setLandingError(data.message);
            setLandingRequiresPassword(
              data.reason === 'password_required' || data.reason === 'wrong_password'
            );
            setSession(null);
            resetRoomClientState();
            ws.close();
            break;
          }
          case 'kicked': {
            intentionallyClosed = true;
            setLandingError(data.message);
            setLandingRequiresPassword(false);
            setSession(null);
            resetRoomClientState();
            ws.close();
            break;
          }
          case 'playback_updated': {
            setPlayback(data.playback);
            setClockOffsetMs(data.serverTime - Date.now());
            break;
          }
          case 'queue_updated': {
            setQueue(data.queue);
            break;
          }
          case 'track_changed': {
            setCurrentItem(data.currentItem);
            setQueue(data.queue);
            setTrackHearts(data.trackHearts ?? 0);
            setHeartBursts([]);
            setPlayback(data.playback);
            setClockOffsetMs(data.serverTime - Date.now());
            break;
          }
          case 'chat_message': {
            setMessages((prev) => {
              if (prev.some((m) => m.id === data.message.id)) return prev;
              const next = [...prev, data.message];
              return next.length > 60 ? next.slice(next.length - 60) : next;
            });
            break;
          }
          case 'emote_triggered': {
            const existingTimer = emoteTimersRef.current.get(data.userId);
            if (existingTimer !== undefined) {
              window.clearTimeout(existingTimer);
            }

            const now = Date.now();
            setActiveEmotes((prev) => ({
              ...prev,
              [data.userId]: {
                userId: data.userId,
                emote: data.emote,
                triggeredAt: data.timestamp || now,
                expiresAt: now + EMOTE_DURATION_MS,
              },
            }));

            if (emoteSoundRef.current) {
              playEmoteSound(data.emote);
            }

            const timerId = window.setTimeout(() => {
              emoteTimersRef.current.delete(data.userId);
              setActiveEmotes((prev) => {
                const current = prev[data.userId];
                if (!current || current.expiresAt > Date.now() + 50) return prev;
                const copy = { ...prev };
                delete copy[data.userId];
                return copy;
              });
            }, EMOTE_DURATION_MS + 40);

            emoteTimersRef.current.set(data.userId, timerId);
            break;
          }
          case 'heart_burst': {
            setTrackHearts(data.totalHearts);
            const burstId = `${data.userId}-${data.timestamp}-${Math.random().toString(36).slice(2, 7)}`;
            const burst: HeartBurst = {
              id: burstId,
              userId: data.userId,
              userName: data.userName,
              shirtColor: data.shirtColor,
              timestamp: data.timestamp,
            };
            setHeartBursts((prev) => [...prev.slice(-24), burst]);
            if (emoteSoundRef.current) {
              playHeartPopSound();
            }
            window.setTimeout(() => {
              setHeartBursts((prev) => prev.filter((item) => item.id !== burstId));
            }, 1600);
            break;
          }
          case 'error': {
            setErrorBanner(data.message);
            setTimeout(() => setErrorBanner(''), 4500);
            break;
          }
        }
      };

      ws.onclose = () => {
        if (wsRef.current === ws) {
          wsRef.current = null;
        }
        if (intentionallyClosed) return;
        setWsStatus('reconnecting');
        reconnectTimerRef.current = window.setTimeout(connect, 900);
      };

      ws.onerror = () => {
        ws.close();
      };
    };

    connect();

    // Keep WebSocket alive across idle proxies and reconnect immediately on tab refocus
    const keepaliveInterval = window.setInterval(() => {
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'ping' } satisfies ClientEvent));
      } else if (!ws || ws.readyState === WebSocket.CLOSED) {
        connect();
      }
    }, 18_000);

    const handleVisibilityOrFocus = () => {
      if (document.visibilityState === 'hidden') return;
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'ping' } satisfies ClientEvent));
      } else if (!ws || ws.readyState === WebSocket.CLOSED) {
        connect();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityOrFocus);
    window.addEventListener('focus', handleVisibilityOrFocus);

    return () => {
      intentionallyClosed = true;
      window.clearInterval(keepaliveInterval);
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
      window.removeEventListener('focus', handleVisibilityOrFocus);
      if (reconnectTimerRef.current !== null) {
        clearTimeout(reconnectTimerRef.current);
      }
      for (const timerId of emoteTimersRef.current.values()) {
        clearTimeout(timerId);
      }
      emoteTimersRef.current.clear();
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [session?.roomCode, session?.name, session?.shirtColor, session?.password, tabClientId, resetRoomClientState]);

  const handleJoinRoom = (profile: SessionProfile) => {
    setLandingError('');
    setLandingRequiresPassword(false);
    resetRoomClientState();
    setSession(profile);
    const url = new URL(window.location.href);
    url.searchParams.set('room', profile.roomCode);
    window.history.replaceState({}, '', url.toString());
  };

  const handleLeaveRoom = () => {
    sendEvent({ type: 'leave_room' });
    setSession(null);
    resetRoomClientState();
    const url = new URL(window.location.href);
    url.searchParams.delete('room');
    window.history.replaceState({}, '', url.toString());
  };

  const handleCopyInvite = () => {
    if (!session) return;
    const shareUrl = `${window.location.origin}?room=${encodeURIComponent(session.roomCode)}`;
    navigator.clipboard?.writeText(shareUrl).catch(() => {});
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleToggleAmbientLighting = () => {
    setAmbientLightingEnabled((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(AMBIENT_STORAGE_KEY, String(next));
      } catch {
        // ignore storage errors
      }
      return next;
    });
  };

  const handleToggleEmoteSound = () => {
    setEmoteSoundEnabled((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(EMOTE_SOUND_STORAGE_KEY, String(next));
      } catch {
        // ignore storage errors
      }
      return next;
    });
  };

  const handleTriggerEmote = useCallback(
    (emote: EmoteType) => {
      sendEvent({ type: 'emote_send', emote });
    },
    [sendEvent]
  );

  const handleTriggerHeart = useCallback(() => {
    sendEvent({ type: 'heart_send' });
  }, [sendEvent]);

  const handleSelectLocalTheme = (pref: 'room' | TheaterThemeId) => {
    setLocalThemePreference(pref);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, pref);
    } catch {
      // ignore storage errors
    }
  };

  const handleUpdateRoomTheme = (theme: TheaterThemeId) => {
    handleSelectLocalTheme('room');
    sendEvent({ type: 'room_settings_update', theme });
  };

  if (!session) {
    return (
      <LandingScreen
        initialRoomCode={initialUrlCode || undefined}
        externalError={landingError}
        externalRequiresPassword={landingRequiresPassword}
        onClearExternalError={() => {
          setLandingError('');
          setLandingRequiresPassword(false);
        }}
        onJoin={handleJoinRoom}
      />
    );
  }

  const selfUser = users.find((u) => u.id === selfId) || null;
  const isSelfHost = Boolean(selfId && (hostId === selfId || selfUser?.isHost));
  const canAddQueue = isSelfHost || (selfUser ? selfUser.permissions.canAddQueue : true);
  const canControlPlayback =
    isSelfHost || (selfUser ? selfUser.permissions.canControlPlayback : true);
  const canEmote = isSelfHost || (selfUser ? selfUser.permissions.canEmote : true);

  const inspectedUser = inspectedUserId
    ? users.find((u) => u.id === inspectedUserId) || null
    : null;

  const effectiveTheme: TheaterThemeId =
    localThemePreference === 'room' ? roomSettings.theme : localThemePreference;

  const shellBgClass =
    effectiveTheme === 'vinyl'
      ? 'bg-[#0D0806]'
      : effectiveTheme === 'edm'
        ? 'bg-[#060810]'
        : effectiveTheme === 'opera'
          ? 'bg-[#0C0704]'
          : 'bg-[#0B0608]';

  const headerThemeClass =
    effectiveTheme === 'vinyl'
      ? 'border-[#D97706]/25 bg-[#120B07]/95'
      : effectiveTheme === 'edm'
        ? 'border-cyan-400/25 bg-[#080C18]/95'
        : effectiveTheme === 'opera'
          ? 'border-[#FDE68A]/30 bg-[#150E08]/95'
          : 'border-[#D4AF37]/20 bg-[#11070B]/95';

  const showRoomAmbientWash =
    ambientLightingEnabled &&
    hasJoinedCinema &&
    Boolean(currentItem) &&
    Boolean(ambientTimeline && ambientTimeline.frames.length > 0);

  return (
    <div
      className={`min-h-screen text-[#F5EFE6] flex flex-col relative overflow-x-hidden transition-colors duration-500 ${shellBgClass}`}
    >
      {/* Subtle Theater Room Ambient Wall Wash (Active only while watching video & lighting enabled) */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 transition-opacity duration-500"
        style={{
          opacity: showRoomAmbientWash ? (playback.isPlaying ? 0.42 : 0.18) : 0,
          background: `radial-gradient(ellipse 58% 44% at 26% 20%, ${ambientPalette.leftColor} 0%, transparent 72%), radial-gradient(ellipse 56% 44% at 54% 20%, ${ambientPalette.rightColor} 0%, transparent 74%)`,
        }}
      />

      {/* Top Theater Navigation Bar */}
      <header className={`border-b backdrop-blur-sm sticky top-0 z-30 transition-colors duration-300 ${headerThemeClass}`}>
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-3 sm:gap-6">
          <span
            style={{ fontFamily: 'var(--font-display)' }}
            className="text-lg sm:text-xl font-bold tracking-tight text-[#FDE68A] whitespace-nowrap shrink-0"
          >
            Rạp Nhạc Chung
          </span>

          <div className="flex items-center gap-2.5 sm:gap-4 text-xs text-[#C7B8A6] min-w-0">
            <span className="font-mono font-semibold text-[#FDE68A] tracking-wider whitespace-nowrap shrink-0">
              {session.roomCode}
            </span>
            {roomSettings.isLocked && (
              <span
                title="Phòng đang khóa không nhận thêm khách mới"
                className="inline-flex items-center gap-1 text-rose-300 whitespace-nowrap shrink-0"
              >
                <Lock className="w-3.5 h-3.5" />
                <span className="hidden md:inline">Đang khóa</span>
              </span>
            )}
            {roomSettings.hasPassword && (
              <span
                title="Phòng có đặt mật khẩu"
                className="inline-flex items-center gap-1 text-[#FDE68A] whitespace-nowrap shrink-0"
              >
                <KeyRound className="w-3.5 h-3.5" />
              </span>
            )}
            <span aria-hidden="true" className="text-[#D4AF37]/40 hidden sm:inline">
              ·
            </span>
            <span className="hidden sm:inline-flex items-center gap-1.5 font-mono tabular-nums whitespace-nowrap shrink-0">
              <Users className="w-3.5 h-3.5 text-[#D4AF37]" />
              {users.length} người
            </span>
            {isSelfHost && (
              <span className="hidden md:inline-flex items-center gap-1 text-[#FDE68A] font-medium whitespace-nowrap shrink-0">
                <Crown className="w-3.5 h-3.5" />
                Chủ phòng
              </span>
            )}
            {wsStatus !== 'connected' && (
              <span className="text-amber-300 whitespace-nowrap shrink-0">
                {wsStatus === 'connecting' ? 'Đang kết nối...' : 'Đang kết nối lại...'}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {isSelfHost && (
              <button
                type="button"
                onClick={() => setIsSettingsOpen(true)}
                className="px-3 py-2 rounded-lg border border-[#D4AF37]/40 bg-[#221016] hover:bg-[#321720] text-xs font-medium text-[#FDE68A] flex items-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap shrink-0"
              >
                <Shield className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Cài đặt</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleCopyInvite}
              className="px-3 py-2 rounded-lg border border-[#D4AF37]/30 bg-[#1B0C11] hover:bg-[#2A131A] text-xs font-medium text-[#FDE68A] flex items-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap shrink-0"
            >
              {copiedCode ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Đã sao chép link</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Mời bạn bè</span>
                  <span className="sm:hidden">Mời</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleLeaveRoom}
              className="px-3 py-2 rounded-lg border border-white/10 bg-[#160A0E] hover:bg-[#2A1219] text-xs font-medium text-[#C7B8A6] hover:text-[#F5EFE6] flex items-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap shrink-0"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Rời rạp</span>
            </button>
          </div>
        </div>
      </header>

      {errorBanner && (
        <div
          role="alert"
          className="relative z-20 max-w-[1440px] w-full mx-auto px-4 sm:px-6 pt-3"
        >
          <div className="rounded-xl border border-red-500/40 bg-red-950/70 px-4 py-2.5 text-xs text-red-100">
            {errorBanner}
          </div>
        </div>
      )}

      {/* Main Theater Auditorium Layout */}
      <main className="relative z-10 flex-1 max-w-[1440px] w-full mx-auto px-4 sm:px-6 py-5 grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Left / Primary Focal Stage: Big Screen + Emote & Heart Bar + Seat Rows */}
        <div className="lg:col-span-8 flex flex-col gap-4">
          <CinemaStage
            hasJoinedCinema={hasJoinedCinema}
            onJoinCinema={() => {
              unlockEmoteAudio();
              setHasJoinedCinema(true);
            }}
            currentItem={currentItem}
            trackHearts={trackHearts}
            heartBursts={heartBursts}
            playback={playback}
            clockOffsetMs={clockOffsetMs}
            onPlaybackControl={(action, position) =>
              sendEvent({ type: 'playback_control', action, position })
            }
            onTrackEnded={(expectedCurrentId) =>
              sendEvent({ type: 'queue_next', expectedCurrentId, reason: 'ended' })
            }
            onNextTrack={() =>
              sendEvent({ type: 'queue_next', expectedCurrentId: currentItem?.id, reason: 'skip' })
            }
            onDurationChange={(dur) => setVideoDurationSec(dur)}
            queueLength={queue.length}
            canControlPlayback={canControlPlayback}
            canAddQueue={canAddQueue}
            ambientLightingEnabled={ambientLightingEnabled}
            ambientPalette={ambientPalette}
            theme={effectiveTheme}
          />

          <EmoteBar
            onTriggerEmote={handleTriggerEmote}
            onTriggerHeart={handleTriggerHeart}
            trackHearts={trackHearts}
            hasActiveTrack={Boolean(currentItem)}
            canEmote={canEmote}
            emoteSoundEnabled={emoteSoundEnabled}
            onToggleEmoteSound={handleToggleEmoteSound}
            ambientLightingEnabled={ambientLightingEnabled}
            onToggleAmbientLighting={handleToggleAmbientLighting}
            ambientPalette={ambientPalette}
            roomTheme={roomSettings.theme}
            localThemePreference={localThemePreference}
            effectiveTheme={effectiveTheme}
            isSelfHost={isSelfHost}
            onSelectLocalTheme={handleSelectLocalTheme}
            onUpdateRoomTheme={handleUpdateRoomTheme}
            disabled={wsStatus !== 'connected'}
          />

          <TheaterSeats
            users={users}
            selfId={selfId}
            isPlaying={playback.isPlaying && Boolean(currentItem)}
            activeEmotes={activeEmotes}
            heartBursts={heartBursts}
            ambientLightingEnabled={ambientLightingEnabled && hasJoinedCinema && Boolean(currentItem)}
            ambientPalette={ambientPalette}
            theme={effectiveTheme}
            danceSeed={currentItem?.videoId || currentItem?.id || ''}
            onSelectUser={(user) => setInspectedUserId(user.id)}
          />
        </div>

        {/* Right Column: Shared Queue + Live Chat */}
        <aside className="lg:col-span-4 flex flex-col gap-5 lg:sticky lg:top-[76px]">
          <QueuePanel
            currentItem={currentItem}
            queue={queue}
            canAddQueue={canAddQueue}
            onAddTrack={(track) =>
              sendEvent({
                type: 'queue_add',
                videoId: track.videoId,
                title: track.title,
                authorName: track.authorName,
                thumbnailUrl: track.thumbnailUrl,
              })
            }
            onPlayNow={(itemId) => sendEvent({ type: 'queue_play_now', itemId })}
            onRemoveTrack={(itemId) => sendEvent({ type: 'queue_remove', itemId })}
          />

          <ChatPanel
            messages={messages}
            selfId={selfId}
            onSendMessage={(text) => sendEvent({ type: 'chat_send', text })}
          />
        </aside>
      </main>

      {/* Member Info & Host Permissions Modal */}
      {inspectedUser && (
        <MemberInspectorModal
          user={inspectedUser}
          selfId={selfId}
          viewerIsHost={isSelfHost}
          onClose={() => setInspectedUserId(null)}
          onUpdatePermissions={(targetUserId: string, permissions: Partial<MemberPermissions>) =>
            sendEvent({ type: 'member_permissions_update', targetUserId, permissions })
          }
          onKickMember={(targetUserId: string) =>
            sendEvent({ type: 'kick_member', targetUserId })
          }
          onTransferHost={(targetUserId: string) =>
            sendEvent({ type: 'transfer_host', targetUserId })
          }
        />
      )}

      {/* Room Security & Default Permissions Modal (Host Only) */}
      {isSettingsOpen && isSelfHost && (
        <RoomSettingsModal
          roomCode={session.roomCode}
          settings={roomSettings}
          users={users}
          selfId={selfId}
          onClose={() => setIsSettingsOpen(false)}
          onUpdateSettings={(payload) =>
            sendEvent({ type: 'room_settings_update', ...payload })
          }
          onSelectMember={(user) => setInspectedUserId(user.id)}
        />
      )}
    </div>
  );
}
