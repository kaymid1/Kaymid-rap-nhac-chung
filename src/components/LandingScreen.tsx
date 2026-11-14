import React, { useEffect, useRef, useState } from 'react';
import {
  RefreshCw,
  ArrowRight,
  Film,
  Users,
  Lock,
  KeyRound,
  ChevronDown,
  ChevronUp,
  Shield,
} from 'lucide-react';
import {
  DEFAULT_MEMBER_PERMISSIONS,
  SHIRT_COLORS,
  THEATER_THEMES,
  type MemberPermissions,
  type RoomCreateSettings,
  type RoomLookupStatus,
  type RoomSummary,
  type TheaterThemeId,
} from '../types';
import { generateRoomCode, normalizeRoomCode } from '../utils/youtube';
import { CharacterAvatar } from './CharacterAvatar';

interface LandingScreenProps {
  initialRoomCode?: string;
  externalError?: string;
  externalRequiresPassword?: boolean;
  onClearExternalError?: () => void;
  onJoin: (params: {
    name: string;
    shirtColor: string;
    roomCode: string;
    password?: string;
    createSettings?: RoomCreateSettings;
  }) => void;
}

export const LandingScreen: React.FC<LandingScreenProps> = ({
  initialRoomCode,
  externalError,
  externalRequiresPassword = false,
  onClearExternalError,
  onJoin,
}) => {
  const [name, setName] = useState('');
  const [shirtColor, setShirtColor] = useState(SHIRT_COLORS[0].hex);
  const [roomCode, setRoomCode] = useState(initialRoomCode || generateRoomCode());
  const [joinPassword, setJoinPassword] = useState('');
  const [roomLookup, setRoomLookup] = useState<RoomLookupStatus | null>(null);

  const [showCreateOptions, setShowCreateOptions] = useState(false);
  const [createLocked, setCreateLocked] = useState(false);
  const [createPassword, setCreatePassword] = useState('');
  const [createTheme, setCreateTheme] = useState<TheaterThemeId>('cinema');
  const [createPermissions, setCreatePermissions] = useState<MemberPermissions>({
    ...DEFAULT_MEMBER_PERMISSIONS,
  });

  const [error, setError] = useState('');
  const [activeRooms, setActiveRooms] = useState<RoomSummary[]>([]);
  const passwordInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let mounted = true;
    fetch('/api/rooms')
      .then((res) => (res.ok ? res.json() : { rooms: [] }))
      .then((data: { rooms?: RoomSummary[] }) => {
        if (mounted && Array.isArray(data.rooms)) {
          setActiveRooms(data.rooms);
        }
      })
      .catch(() => {
        // Ignore transient fetch errors
      });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const cleanCode = normalizeRoomCode(roomCode);
    if (cleanCode.length < 3) {
      setRoomLookup(null);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      fetch(`/api/rooms/${encodeURIComponent(cleanCode)}/status`)
        .then((res) => (res.ok ? res.json() : null))
        .then((data: RoomLookupStatus | null) => {
          if (!cancelled && data) {
            setRoomLookup(data);
          }
        })
        .catch(() => {
          // ignore lookup failure
        });
    }, 180);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [roomCode]);

  useEffect(() => {
    if (externalError && roomLookup?.hasPassword) {
      passwordInputRef.current?.focus();
    }
  }, [externalError, roomLookup?.hasPassword]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = name.trim();
    const cleanCode = normalizeRoomCode(roomCode);

    if (!cleanName) {
      setError('Vui lòng nhập tên hiển thị của bạn.');
      return;
    }
    if (!cleanCode || cleanCode.length < 3) {
      setError('Mã phòng cần ít nhất 3 ký tự (ví dụ: MOVIE-7K2).');
      return;
    }
    if (roomLookup?.exists && roomLookup.isLocked) {
      setError('Phòng chiếu này đang bị chủ phòng khóa, không thể vào thêm.');
      return;
    }
    if (roomLookup?.exists && roomLookup.hasPassword && !joinPassword.trim()) {
      setError('Phòng chiếu này yêu cầu mật khẩu. Vui lòng nhập mật khẩu.');
      passwordInputRef.current?.focus();
      return;
    }

    setError('');
    onClearExternalError?.();

    const isExistingRoom = Boolean(roomLookup?.exists);
    onJoin({
      name: cleanName,
      shirtColor,
      roomCode: cleanCode,
      password: joinPassword.trim() || undefined,
      createSettings: isExistingRoom
        ? undefined
        : {
            isLocked: createLocked,
            password: createPassword.trim(),
            theme: createTheme,
            defaultPermissions: createPermissions,
          },
    });
  };

  const selectedShirt = SHIRT_COLORS.find((c) => c.hex === shirtColor) || SHIRT_COLORS[0];
  const displayedError = error || externalError || '';
  const showPasswordInput = Boolean(
    (roomLookup?.exists && roomLookup.hasPassword) || externalRequiresPassword
  );

  return (
    <div className="min-h-screen bg-[#0B0608] text-[#F5EFE6] relative overflow-x-hidden flex flex-col">
      {/* Decorative Side Theater Curtains */}
      <div
        aria-hidden="true"
        className="hidden xl:block fixed inset-y-0 left-0 w-24 curtain-pleats-left pointer-events-none z-10 opacity-90"
      />
      <div
        aria-hidden="true"
        className="hidden xl:block fixed inset-y-0 right-0 w-24 curtain-pleats-right pointer-events-none z-10 opacity-90"
      />

      {/* Ambient Stage Spotlight */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-[420px] rounded-full bg-[radial-gradient(ellipse_at_center,rgba(153,27,27,0.28)_0%,rgba(212,175,55,0.08)_45%,transparent_75%)] blur-2xl"
      />

      {/* Top Bar */}
      <header className="relative z-20 border-b border-[#D4AF37]/20 bg-[#0B0608]/85 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between gap-8">
          <span
            style={{ fontFamily: 'var(--font-display)' }}
            className="text-xl font-bold tracking-tight text-[#FDE68A] whitespace-nowrap shrink-0"
          >
            Rạp Nhạc Chung
          </span>
          <span className="text-sm text-[#C7B8A6] hidden sm:inline whitespace-nowrap shrink-0">
            Không cần đăng nhập · Đồng bộ thời gian thực
          </span>
        </div>
      </header>

      {/* Main Hero Lobby */}
      <main className="relative z-20 flex-1 flex items-center justify-center px-6 py-10 lg:py-16">
        <div className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-stretch">
          {/* Left Column: Theater Proposition & Active Rooms */}
          <div className="lg:col-span-6 flex flex-col justify-between gap-8 py-2">
            <div className="space-y-5">
              <p className="text-xs font-medium tracking-wider text-[#D4AF37]">
                PHÒNG CHIẾU NHẠC TRỰC TUYẾN
              </p>
              <h1
                style={{ fontFamily: 'var(--font-display)', textWrap: 'balance' }}
                className="text-4xl sm:text-5xl font-bold leading-[1.15] text-[#FBF7F0]"
              >
                Nghe nhạc YouTube cùng bạn bè trong một rạp chiếu nhỏ
              </h1>
              <p className="text-base text-[#C7B8A6] leading-relaxed max-w-xl">
                Tạo phòng bằng mã ngắn hoặc nhập mã từ bạn bè. Chọn màu áo nhân vật, bước qua cửa rạp và cùng thưởng thức danh sách phát đồng bộ từng giây.
              </p>

              <div className="pt-2 grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm text-[#E5D9C8]">
                <div className="border border-[#D4AF37]/15 bg-[#150A0E]/80 rounded-xl p-4">
                  <div className="font-semibold text-[#FDE68A] mb-1">01. Đồng bộ tức thì</div>
                  <p className="text-xs text-[#A89888] leading-relaxed">
                    Phát, tạm dừng, tua video và tự động chuyển bài theo hàng chờ chung cho cả rạp.
                  </p>
                </div>
                <div className="border border-[#D4AF37]/15 bg-[#150A0E]/80 rounded-xl p-4">
                  <div className="font-semibold text-[#FDE68A] mb-1">02. Chủ phòng toàn quyền</div>
                  <p className="text-xs text-[#A89888] leading-relaxed">
                    Đặt mật khẩu, khóa rạp, phân quyền thêm bài, phát/dừng, emote và quản lý từng khán giả.
                  </p>
                </div>
              </div>
            </div>

            {/* Active Rooms if any */}
            {activeRooms.length > 0 && (
              <div className="border-t border-[#D4AF37]/15 pt-5 space-y-3">
                <div className="flex items-center gap-2 text-xs font-medium text-[#D4AF37]">
                  <Film className="w-3.5 h-3.5" />
                  <span>Phòng đang mở hiện tại</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {activeRooms.map((rm) => (
                    <button
                      key={rm.roomCode}
                      type="button"
                      onClick={() => {
                        setRoomCode(rm.roomCode);
                        setError('');
                        onClearExternalError?.();
                      }}
                      className="text-left px-3.5 py-2.5 rounded-lg border border-[#D4AF37]/20 bg-[#170B0F] hover:border-[#D4AF37]/50 hover:bg-[#221016] transition-colors flex items-center justify-between gap-3 cursor-pointer"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 font-mono text-xs font-semibold text-[#FDE68A]">
                          <span>{rm.roomCode}</span>
                          {rm.isLocked && (
                            <span title="Phòng đang khóa">
                              <Lock className="w-3 h-3 text-rose-400" />
                            </span>
                          )}
                          {rm.hasPassword && (
                            <span title="Có mật khẩu">
                              <KeyRound className="w-3 h-3 text-[#D4AF37]" />
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-[#A89888] truncate">
                          {rm.currentTitle || 'Chưa bật bài nào'}
                        </div>
                      </div>
                      <span className="text-xs font-mono tabular-nums text-[#C7B8A6] flex items-center gap-1 shrink-0">
                        <Users className="w-3.5 h-3.5 text-[#D4AF37]" />
                        {rm.userCount}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right Column: Ticket Booth Entry Form */}
          <div className="lg:col-span-6">
            <form
              onSubmit={handleSubmit}
              className="h-full rounded-2xl border border-[#D4AF37]/30 bg-[#140A0E] p-6 sm:p-8 shadow-2xl flex flex-col justify-between gap-6"
            >
              <div className="space-y-5">
                <div className="border-b border-[#D4AF37]/15 pb-4 flex items-center justify-between gap-4">
                  <div>
                    <h2
                      style={{ fontFamily: 'var(--font-display)' }}
                      className="text-2xl font-bold text-[#FBF7F0]"
                    >
                      Vé vào rạp
                    </h2>
                    <p className="text-xs text-[#A89888] mt-1">
                      Chọn tên, màu áo và mã phòng để bắt đầu
                    </p>
                  </div>
                  <div className="flex items-center gap-2 bg-[#0B0608] border border-[#D4AF37]/20 rounded-xl px-3 py-2">
                    <CharacterAvatar shirtColor={shirtColor} view="front" size={34} />
                  </div>
                </div>

                {/* Display Name */}
                <div className="space-y-2">
                  <label htmlFor="display-name" className="block text-sm font-medium text-[#E5D9C8]">
                    Tên hiển thị
                  </label>
                  <input
                    id="display-name"
                    type="text"
                    maxLength={24}
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value);
                      if (error) setError('');
                    }}
                    placeholder="Ví dụ: Minh Anh, Quốc Bảo..."
                    className="w-full rounded-xl border border-[#D4AF37]/25 bg-[#0B0608] px-4 py-3 text-sm text-[#F5EFE6] placeholder:text-[#78685C] focus:outline-none focus:border-[#D4AF37] transition-colors"
                  />
                </div>

                {/* Character Shirt Color */}
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-[#E5D9C8]">Màu áo nhân vật</span>
                    <span className="text-xs text-[#D4AF37]">{selectedShirt.label}</span>
                  </div>
                  <div className="grid grid-cols-4 sm:grid-cols-8 gap-2.5">
                    {SHIRT_COLORS.map((color) => {
                      const active = color.hex === shirtColor;
                      return (
                        <button
                          key={color.id}
                          type="button"
                          onClick={() => setShirtColor(color.hex)}
                          title={color.label}
                          aria-label={`Chọn màu áo ${color.label}`}
                          aria-pressed={active}
                          className={`h-11 rounded-xl flex items-center justify-center border transition-transform cursor-pointer ${
                            active
                              ? 'border-[#FDE68A] scale-105 bg-[#241218] ring-2 ring-[#D4AF37]/50'
                              : 'border-white/10 bg-[#0B0608] hover:border-white/30'
                          }`}
                        >
                          <span
                            className="w-6 h-6 rounded-full border border-black/30 shadow-inner"
                            style={{ backgroundColor: color.hex }}
                          />
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Room Code */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <label htmlFor="room-code" className="block text-sm font-medium text-[#E5D9C8]">
                      Mã phòng chiếu
                    </label>
                    {roomLookup && (
                      <span
                        className={`text-[11px] font-medium ${
                          roomLookup.exists
                            ? roomLookup.isLocked
                              ? 'text-rose-300'
                              : 'text-[#FDE68A]'
                            : 'text-emerald-300'
                        }`}
                      >
                        {roomLookup.exists
                          ? roomLookup.isLocked
                            ? `Đang khóa (${roomLookup.userCount} người)`
                            : roomLookup.hasPassword
                              ? `Có mật khẩu (${roomLookup.userCount} người)`
                              : `Phòng đang mở (${roomLookup.userCount} người)`
                          : 'Phòng mới · Bạn là Chủ phòng'}
                      </span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <input
                      id="room-code"
                      type="text"
                      maxLength={16}
                      value={roomCode}
                      onChange={(e) => {
                        setRoomCode(normalizeRoomCode(e.target.value));
                        if (error) setError('');
                        onClearExternalError?.();
                      }}
                      placeholder="MOVIE-7K2"
                      className="flex-1 min-w-0 rounded-xl border border-[#D4AF37]/25 bg-[#0B0608] px-4 py-3 font-mono text-sm tracking-wider text-[#FDE68A] placeholder:text-[#78685C] focus:outline-none focus:border-[#D4AF37] transition-colors uppercase"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setRoomCode(generateRoomCode());
                        setJoinPassword('');
                        onClearExternalError?.();
                      }}
                      className="px-3.5 py-3 rounded-xl border border-[#D4AF37]/25 bg-[#1D0F14] hover:bg-[#2A151C] text-xs font-medium text-[#E5D9C8] flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-colors"
                    >
                      <RefreshCw className="w-3.5 h-3.5 text-[#D4AF37]" />
                      <span>Tạo mã mới</span>
                    </button>
                  </div>
                </div>

                {/* Join Password Field (when joining an existing passworded room) */}
                {showPasswordInput && (
                  <div className="space-y-1.5 rounded-xl border border-[#D4AF37]/30 bg-[#1B0D12] p-3.5">
                    <label
                      htmlFor="join-room-password"
                      className="flex items-center gap-1.5 text-xs font-semibold text-[#FDE68A]"
                    >
                      <KeyRound className="w-3.5 h-3.5" />
                      <span>Mật khẩu phòng</span>
                    </label>
                    <input
                      ref={passwordInputRef}
                      id="join-room-password"
                      type="password"
                      maxLength={32}
                      value={joinPassword}
                      onChange={(e) => {
                        setJoinPassword(e.target.value);
                        if (error) setError('');
                        onClearExternalError?.();
                      }}
                      placeholder="Nhập mật khẩu do chủ phòng cung cấp..."
                      className="w-full rounded-lg border border-[#D4AF37]/25 bg-[#0B0608] px-3 py-2 text-xs text-[#F5EFE6] placeholder:text-[#78685C] focus:outline-none focus:border-[#D4AF37]"
                    />
                  </div>
                )}

                {/* Creation Settings Accordion (when creating a new room) */}
                {!roomLookup?.exists && (
                  <div className="rounded-xl border border-[#D4AF37]/20 bg-[#0F070A] overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setShowCreateOptions((prev) => !prev)}
                      className="w-full px-3.5 py-2.5 flex items-center justify-between gap-2 text-xs font-medium text-[#E5D9C8] hover:bg-[#190B10] cursor-pointer transition-colors"
                    >
                      <span className="flex items-center gap-2">
                        <Shield className="w-3.5 h-3.5 text-[#D4AF37]" />
                        <span>Cài đặt phòng khi tạo (mật khẩu, quyền thành viên)</span>
                      </span>
                      {showCreateOptions ? (
                        <ChevronUp className="w-4 h-4 text-[#A89888]" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-[#A89888]" />
                      )}
                    </button>

                    {showCreateOptions && (
                      <div className="px-3.5 pb-3.5 pt-2 border-t border-[#D4AF37]/15 space-y-3">
                        <div className="space-y-1.5">
                          <div className="text-[11px] font-medium text-[#D4AF37]">
                            Không gian rạp mặc định:
                          </div>
                          <div className="grid grid-cols-2 gap-1.5">
                            {THEATER_THEMES.map((t) => {
                              const selected = createTheme === t.id;
                              return (
                                <button
                                  key={t.id}
                                  type="button"
                                  onClick={() => setCreateTheme(t.id)}
                                  className={`px-2.5 py-2 rounded-lg border text-left transition-colors cursor-pointer ${
                                    selected
                                      ? 'border-[#D4AF37] bg-[#241218] text-[#FDE68A]'
                                      : 'border-white/10 bg-[#0B0608] text-[#C7B8A6] hover:border-[#D4AF37]/35'
                                  }`}
                                >
                                  <div className="text-xs font-semibold">{t.shortLabel}</div>
                                  <div className="text-[10px] text-[#8E7D70] truncate">
                                    {t.description}
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        <div className="space-y-1.5">
                          <label
                            htmlFor="create-room-password"
                            className="block text-[11px] font-medium text-[#C7B8A6]"
                          >
                            Đặt mật khẩu vào phòng (để trống nếu mở tự do)
                          </label>
                          <input
                            id="create-room-password"
                            type="password"
                            maxLength={32}
                            value={createPassword}
                            onChange={(e) => setCreatePassword(e.target.value)}
                            placeholder="Nhập mật khẩu phòng..."
                            className="w-full rounded-lg border border-[#D4AF37]/20 bg-[#0B0608] px-3 py-2 text-xs text-[#F5EFE6] placeholder:text-[#78685C] focus:outline-none focus:border-[#D4AF37]"
                          />
                        </div>

                        <label className="flex items-center justify-between gap-2 text-xs text-[#E5D9C8] cursor-pointer">
                          <span>Khóa phòng ngay (chặn người ngoài vào)</span>
                          <input
                            type="checkbox"
                            checked={createLocked}
                            onChange={(e) => setCreateLocked(e.target.checked)}
                            className="w-4 h-4 accent-[#D4AF37] cursor-pointer"
                          />
                        </label>

                        <div className="space-y-1.5 pt-1 border-t border-white/5">
                          <div className="text-[11px] font-medium text-[#D4AF37]">
                            Quyền mặc định của khán giả mới vào:
                          </div>
                          {[
                            {
                              key: 'canAddQueue' as const,
                              label: 'Cho phép thêm / xóa bài hát',
                            },
                            {
                              key: 'canControlPlayback' as const,
                              label: 'Cho phép phát, tạm dừng & tua video',
                            },
                            {
                              key: 'canEmote' as const,
                              label: 'Cho phép gửi Emote & Thả tim',
                            },
                          ].map((perm) => (
                            <label
                              key={perm.key}
                              className="flex items-center justify-between gap-2 text-xs text-[#C7B8A6] cursor-pointer"
                            >
                              <span>{perm.label}</span>
                              <input
                                type="checkbox"
                                checked={createPermissions[perm.key]}
                                onChange={(e) =>
                                  setCreatePermissions((prev) => ({
                                    ...prev,
                                    [perm.key]: e.target.checked,
                                  }))
                                }
                                className="w-4 h-4 accent-[#D4AF37] cursor-pointer"
                              />
                            </label>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {displayedError && (
                  <div
                    role="alert"
                    className="rounded-lg border border-red-500/40 bg-red-950/50 px-3.5 py-2.5 text-xs text-red-200"
                  >
                    {displayedError}
                  </div>
                )}
              </div>

              <button
                type="submit"
                className="w-full py-3.5 px-6 rounded-xl bg-gradient-to-r from-[#991B1B] via-[#B91C1C] to-[#991B1B] hover:from-[#B91C1C] hover:to-[#DC2626] border border-[#D4AF37]/50 text-[#FBF7F0] font-semibold text-sm flex items-center justify-center gap-2 shadow-lg cursor-pointer transition-all whitespace-nowrap shrink-0"
              >
                <span>{roomLookup?.exists ? 'Vào phòng chiếu' : 'Tạo phòng & Vào rạp'}</span>
                <ArrowRight className="w-4 h-4 text-[#FDE68A]" />
              </button>
            </form>
          </div>
        </div>
      </main>
    </div>
  );
};
