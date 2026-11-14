export interface ShirtOption {
  id: string;
  label: string;
  hex: string;
  trimHex: string;
}

export const SHIRT_COLORS: ShirtOption[] = [
  { id: 'crimson', label: 'Đỏ Nhung', hex: '#DC2626', trimHex: '#991B1B' },
  { id: 'gold', label: 'Vàng Nghệ', hex: '#EAB308', trimHex: '#A16207' },
  { id: 'emerald', label: 'Xanh Ngọc', hex: '#10B981', trimHex: '#047857' },
  { id: 'cobalt', label: 'Xanh Biển', hex: '#3B82F6', trimHex: '#1D4ED8' },
  { id: 'violet', label: 'Tím Than', hex: '#8B5CF6', trimHex: '#5B21B6' },
  { id: 'coral', label: 'Cam San Hô', hex: '#F97316', trimHex: '#C2410C' },
  { id: 'rose', label: 'Hồng Đào', hex: '#EC4899', trimHex: '#9D174D' },
  { id: 'ivory', label: 'Trắng Kem', hex: '#E7E5E4', trimHex: '#A8A29E' },
];

export interface MemberPermissions {
  canAddQueue: boolean;
  canControlPlayback: boolean;
  canEmote: boolean;
}

export const DEFAULT_MEMBER_PERMISSIONS: MemberPermissions = {
  canAddQueue: true,
  canControlPlayback: true,
  canEmote: true,
};

export type TheaterThemeId = 'cinema' | 'vinyl' | 'edm' | 'opera';

export interface TheaterThemeOption {
  id: TheaterThemeId;
  label: string;
  shortLabel: string;
  description: string;
  accentHex: string;
}

export const THEATER_THEMES: TheaterThemeOption[] = [
  {
    id: 'cinema',
    label: 'Rạp Chiếu Phim',
    shortLabel: 'Rạp phim',
    description: 'Màn ảnh rộng, rèm nhung đỏ & hàng ghế rạp cổ điển',
    accentHex: '#DC2626',
  },
  {
    id: 'vinyl',
    label: 'Máy Phát Đĩa Than',
    shortLabel: 'Đĩa than',
    description: 'Chỉ hiện mâm đĩa xoay 12-inch gỗ ấm & góc lounge nghe nhạc',
    accentHex: '#D97706',
  },
  {
    id: 'edm',
    label: 'Sàn Nhạc EDM',
    shortLabel: 'Sàn EDM',
    description: 'Sân khấu LED, tháp loa subwoofer, tia laser & sàn nhảy',
    accentHex: '#06B6D4',
  },
  {
    id: 'opera',
    label: 'Sảnh Khiêu Vũ',
    shortLabel: 'Khiêu vũ',
    description: 'Nhân vật tự do ghép đôi & khiêu vũ free dance theo bài nhạc',
    accentHex: '#FDE68A',
  },
];

export interface RoomSettings {
  isLocked: boolean;
  hasPassword: boolean;
  theme: TheaterThemeId;
  defaultPermissions: MemberPermissions;
}

export interface RoomCreateSettings {
  isLocked: boolean;
  password: string;
  theme: TheaterThemeId;
  defaultPermissions: MemberPermissions;
}

export interface TheaterUser {
  id: string;
  name: string;
  shirtColor: string;
  seatIndex: number;
  joinedAt: number;
  isHost: boolean;
  permissions: MemberPermissions;
}

export interface QueueItem {
  id: string;
  videoId: string;
  title: string;
  authorName: string;
  thumbnailUrl: string;
  addedBy: string;
  addedAt: number;
}

export interface PlaybackState {
  isPlaying: boolean;
  position: number;
  updatedAt: number;
}

export interface ChatMessage {
  id: string;
  userId: string;
  userName: string;
  shirtColor: string;
  text: string;
  timestamp: number;
  isSystem?: boolean;
}

export interface RoomStatePayload {
  roomCode: string;
  selfId: string;
  hostId: string;
  settings: RoomSettings;
  users: TheaterUser[];
  queue: QueueItem[];
  currentItem: QueueItem | null;
  trackHearts: number;
  playback: PlaybackState;
  messages: ChatMessage[];
  serverTime: number;
}

export interface RoomSummary {
  roomCode: string;
  userCount: number;
  currentTitle: string | null;
  isLocked: boolean;
  hasPassword: boolean;
}

export interface RoomLookupStatus {
  exists: boolean;
  roomCode: string;
  userCount: number;
  isLocked: boolean;
  hasPassword: boolean;
  hostName: string | null;
}

export type EmoteType = 'dance' | 'clap' | 'whistle' | 'boo';

export interface EmoteOption {
  id: EmoteType;
  label: string;
  bubbleText: string;
  hotkey: string;
  accentHex: string;
}

export const EMOTE_OPTIONS: EmoteOption[] = [
  { id: 'dance', label: 'Nhảy', bubbleText: 'Nhảy!', hotkey: '1', accentHex: '#FDE68A' },
  { id: 'clap', label: 'Vỗ tay', bubbleText: 'Vỗ tay!', hotkey: '2', accentHex: '#34D399' },
  { id: 'whistle', label: 'Huýt sáo', bubbleText: 'Huýt sáo!', hotkey: '3', accentHex: '#60A5FA' },
  { id: 'boo', label: 'Booo', bubbleText: 'Booo!', hotkey: '4', accentHex: '#F87171' },
];

export interface ActiveEmote {
  userId: string;
  emote: EmoteType;
  triggeredAt: number;
  expiresAt: number;
}

export interface HeartBurst {
  id: string;
  userId: string;
  userName: string;
  shirtColor: string;
  timestamp: number;
}

export interface AmbientPalette {
  leftColor: string;
  centerColor: string;
  rightColor: string;
  topColor: string;
}

export type ServerEvent =
  | { type: 'room_state'; payload: RoomStatePayload }
  | { type: 'user_joined'; user: TheaterUser }
  | { type: 'user_updated'; user: TheaterUser }
  | { type: 'users_synced'; users: TheaterUser[]; hostId: string }
  | { type: 'user_left'; userId: string }
  | { type: 'room_settings_updated'; settings: RoomSettings; hostId: string }
  | { type: 'playback_updated'; playback: PlaybackState; serverTime: number; actorName?: string }
  | { type: 'queue_updated'; queue: QueueItem[] }
  | {
      type: 'track_changed';
      currentItem: QueueItem | null;
      queue: QueueItem[];
      trackHearts: number;
      playback: PlaybackState;
      serverTime: number;
    }
  | { type: 'chat_message'; message: ChatMessage }
  | {
      type: 'emote_triggered';
      userId: string;
      userName: string;
      emote: EmoteType;
      timestamp: number;
    }
  | {
      type: 'heart_burst';
      userId: string;
      userName: string;
      shirtColor: string;
      totalHearts: number;
      timestamp: number;
    }
  | {
      type: 'join_rejected';
      reason: 'locked' | 'password_required' | 'wrong_password';
      message: string;
    }
  | { type: 'kicked'; message: string }
  | { type: 'pong'; serverTime: number }
  | { type: 'error'; message: string };

export type ClientEvent =
  | {
      type: 'join_room';
      roomCode: string;
      clientId?: string;
      password?: string;
      createSettings?: Partial<RoomCreateSettings>;
      user: { name: string; shirtColor: string };
    }
  | { type: 'leave_room' }
  | { type: 'ping' }
  | { type: 'playback_control'; action: 'play' | 'pause' | 'seek'; position: number }
  | {
      type: 'queue_add';
      videoId: string;
      title?: string;
      authorName?: string;
      thumbnailUrl?: string;
    }
  | { type: 'queue_next'; expectedCurrentId?: string; reason?: 'ended' | 'skip' }
  | { type: 'queue_play_now'; itemId: string }
  | { type: 'queue_remove'; itemId: string }
  | { type: 'chat_send'; text: string }
  | { type: 'emote_send'; emote: EmoteType }
  | { type: 'heart_send' }
  | {
      type: 'room_settings_update';
      isLocked?: boolean;
      password?: string | null;
      theme?: TheaterThemeId;
      defaultPermissions?: Partial<MemberPermissions>;
      applyToAllMembers?: boolean;
    }
  | {
      type: 'member_permissions_update';
      targetUserId: string;
      permissions: Partial<MemberPermissions>;
    }
  | { type: 'kick_member'; targetUserId: string }
  | { type: 'transfer_host'; targetUserId: string };
