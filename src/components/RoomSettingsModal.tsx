import React, { useState } from 'react';
import {
  X,
  Lock,
  Unlock,
  KeyRound,
  Shield,
  ListMusic,
  Play,
  Sparkles,
  Users,
  Crown,
} from 'lucide-react';
import {
  THEATER_THEMES,
  type MemberPermissions,
  type RoomSettings,
  type TheaterThemeId,
  type TheaterUser,
} from '../types';

interface RoomSettingsModalProps {
  roomCode: string;
  settings: RoomSettings;
  users: TheaterUser[];
  selfId: string | null;
  onClose: () => void;
  onUpdateSettings: (payload: {
    isLocked?: boolean;
    password?: string | null;
    theme?: TheaterThemeId;
    defaultPermissions?: Partial<MemberPermissions>;
    applyToAllMembers?: boolean;
  }) => void;
  onSelectMember: (user: TheaterUser) => void;
}

export const RoomSettingsModal: React.FC<RoomSettingsModalProps> = ({
  roomCode,
  settings,
  users,
  selfId,
  onClose,
  onUpdateSettings,
  onSelectMember,
}) => {
  const [isLocked, setIsLocked] = useState(settings.isLocked);
  const [passwordInput, setPasswordInput] = useState('');
  const [clearPassword, setClearPassword] = useState(false);
  const [roomTheme, setRoomTheme] = useState<TheaterThemeId>(settings.theme);
  const [defaultPerms, setDefaultPerms] = useState<MemberPermissions>({
    ...settings.defaultPermissions,
  });
  const [applyToAll, setApplyToAll] = useState(false);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const payload: {
      isLocked: boolean;
      password?: string | null;
      theme: TheaterThemeId;
      defaultPermissions: MemberPermissions;
      applyToAllMembers: boolean;
    } = {
      isLocked,
      theme: roomTheme,
      defaultPermissions: defaultPerms,
      applyToAllMembers: applyToAll,
    };

    if (clearPassword) {
      payload.password = null;
    } else if (passwordInput.trim().length > 0) {
      payload.password = passwordInput.trim();
    }

    onUpdateSettings(payload);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Cài đặt phòng chiếu"
        className="w-full max-w-lg rounded-2xl border border-[#D4AF37]/35 bg-[#14090D] text-[#F5EFE6] shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-[#D4AF37]/15 flex items-center justify-between gap-3 bg-[#1A0C11]">
          <div className="flex items-center gap-2.5">
            <Shield className="w-5 h-5 text-[#D4AF37]" />
            <div>
              <h3
                style={{ fontFamily: 'var(--font-display)' }}
                className="text-lg font-bold text-[#FDE68A]"
              >
                Cài đặt phòng {roomCode}
              </h3>
              <p className="text-xs text-[#A89888]">
                Quản lý khóa phòng, mật khẩu và quyền khán giả
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng cài đặt phòng"
            className="p-2 rounded-lg text-[#A89888] hover:text-[#FBF7F0] hover:bg-[#261118] cursor-pointer transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSave} className="p-5 space-y-5 overflow-y-auto">
          {/* Room Lock Toggle */}
          <div className="rounded-xl border border-[#D4AF37]/20 bg-[#0E0609] p-3.5 flex items-center justify-between gap-4">
            <div className="flex items-start gap-2.5">
              {isLocked ? (
                <Lock className="w-4 h-4 text-rose-400 mt-0.5 shrink-0" />
              ) : (
                <Unlock className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
              )}
              <div>
                <div className="text-xs font-semibold text-[#F5EFE6]">
                  Khóa cửa rạp (chặn người mới)
                </div>
                <div className="text-[11px] text-[#8E7D70] mt-0.5">
                  Khi bật, người ngoài có mã phòng cũng không thể tham gia thêm.
                </div>
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={isLocked}
              onClick={() => setIsLocked((prev) => !prev)}
              className={`w-11 h-6 rounded-full p-0.5 transition-colors cursor-pointer shrink-0 ${
                isLocked ? 'bg-rose-600' : 'bg-[#361A22]'
              }`}
            >
              <span
                className={`block w-5 h-5 rounded-full bg-[#FBF7F0] shadow transition-transform ${
                  isLocked ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* Room Password */}
          <div className="rounded-xl border border-[#D4AF37]/20 bg-[#0E0609] p-3.5 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <label
                htmlFor="room-settings-pw"
                className="flex items-center gap-2 text-xs font-semibold text-[#F5EFE6]"
              >
                <KeyRound className="w-4 h-4 text-[#D4AF37]" />
                <span>Mật khẩu vào phòng</span>
              </label>
              <span className="text-[11px] text-[#A89888]">
                {clearPassword
                  ? 'Sẽ gỡ mật khẩu'
                  : settings.hasPassword
                    ? 'Đang bật mật khẩu'
                    : 'Chưa đặt mật khẩu'}
              </span>
            </div>

            <div className="flex gap-2">
              <input
                id="room-settings-pw"
                type="password"
                maxLength={32}
                value={passwordInput}
                onChange={(e) => {
                  setPasswordInput(e.target.value);
                  if (clearPassword) setClearPassword(false);
                }}
                placeholder={
                  settings.hasPassword
                    ? 'Nhập mật khẩu mới để đổi...'
                    : 'Nhập mật khẩu nếu muốn khóa bằng mã...'
                }
                className="flex-1 min-w-0 rounded-xl border border-[#D4AF37]/25 bg-[#160A0E] px-3 py-2 text-xs text-[#F5EFE6] placeholder:text-[#78685C] focus:outline-none focus:border-[#D4AF37]"
              />
              {settings.hasPassword && !clearPassword && (
                <button
                  type="button"
                  onClick={() => {
                    setClearPassword(true);
                    setPasswordInput('');
                  }}
                  className="px-3 py-2 rounded-xl border border-red-500/30 bg-red-950/40 hover:bg-red-900/50 text-xs font-medium text-red-200 cursor-pointer whitespace-nowrap shrink-0"
                >
                  Gỡ mật khẩu
                </button>
              )}
            </div>
          </div>

          {/* Room Theme */}
          <div className="space-y-2">
            <div className="text-xs font-semibold uppercase tracking-wider text-[#D4AF37]">
              Không gian mặc định cho cả phòng
            </div>
            <div className="grid grid-cols-2 gap-2">
              {THEATER_THEMES.map((t) => {
                const active = roomTheme === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setRoomTheme(t.id)}
                    className={`rounded-xl border p-3 text-left transition-colors cursor-pointer ${
                      active
                        ? 'border-[#D4AF37] bg-[#241117] text-[#FDE68A]'
                        : 'border-[#D4AF37]/15 bg-[#0E0609] text-[#C7B8A6] hover:border-[#D4AF37]/40'
                    }`}
                  >
                    <div className="text-xs font-semibold">{t.label}</div>
                    <div className="text-[11px] text-[#8E7D70] mt-0.5 line-clamp-2">
                      {t.description}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Default Permissions */}
          <div className="space-y-2.5">
            <div className="text-xs font-semibold uppercase tracking-wider text-[#D4AF37]">
              Quyền mặc định cho khán giả
            </div>

            <div className="space-y-2">
              {[
                {
                  key: 'canAddQueue' as const,
                  label: 'Cho phép thêm & quản lý bài hát',
                  icon: <ListMusic className="w-4 h-4 text-[#D4AF37]" />,
                },
                {
                  key: 'canControlPlayback' as const,
                  label: 'Cho phép phát, tạm dừng & tua video',
                  icon: <Play className="w-4 h-4 text-[#D4AF37]" />,
                },
                {
                  key: 'canEmote' as const,
                  label: 'Cho phép gửi Emote & Thả tim',
                  icon: <Sparkles className="w-4 h-4 text-[#D4AF37]" />,
                },
              ].map((item) => (
                <label
                  key={item.key}
                  className="rounded-xl border border-[#D4AF37]/15 bg-[#0E0609] px-3.5 py-2.5 flex items-center justify-between gap-3 cursor-pointer"
                >
                  <span className="flex items-center gap-2.5 text-xs text-[#F5EFE6]">
                    {item.icon}
                    <span>{item.label}</span>
                  </span>
                  <input
                    type="checkbox"
                    checked={defaultPerms[item.key]}
                    onChange={(e) =>
                      setDefaultPerms((prev) => ({ ...prev, [item.key]: e.target.checked }))
                    }
                    className="w-4 h-4 accent-[#D4AF37] cursor-pointer"
                  />
                </label>
              ))}
            </div>

            <label className="flex items-center gap-2 text-xs text-[#C7B8A6] pt-1 cursor-pointer">
              <input
                type="checkbox"
                checked={applyToAll}
                onChange={(e) => setApplyToAll(e.target.checked)}
                className="w-4 h-4 accent-[#D4AF37] cursor-pointer"
              />
              <span>Áp dụng ngay cài đặt quyền trên cho tất cả khán giả hiện tại</span>
            </label>
          </div>

          {/* Quick Member List */}
          <div className="space-y-2 pt-2 border-t border-[#D4AF37]/15">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-[#D4AF37]">
              <Users className="w-3.5 h-3.5" />
              <span>Thành viên đang ngồi ({users.length})</span>
            </div>
            <div className="max-h-36 overflow-y-auto space-y-1.5 pr-1">
              {users.map((u) => (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => {
                    onClose();
                    onSelectMember(u);
                  }}
                  className="w-full rounded-lg border border-white/5 bg-[#0E0609] hover:border-[#D4AF37]/35 px-3 py-2 flex items-center justify-between gap-2 text-left cursor-pointer transition-colors"
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: u.shirtColor }}
                    />
                    <span className="text-xs font-medium text-[#F5EFE6] truncate">
                      {u.name}
                      {u.id === selfId ? ' (Bạn)' : ''}
                    </span>
                  </span>
                  {u.isHost ? (
                    <span className="inline-flex items-center gap-1 text-[11px] text-[#FDE68A] shrink-0">
                      <Crown className="w-3 h-3" />
                      Chủ phòng
                    </span>
                  ) : (
                    <span className="text-[11px] text-[#8E7D70] shrink-0">Chỉnh quyền / Kick →</span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Footer Submit */}
          <div className="flex justify-end gap-2 pt-2 border-t border-[#D4AF37]/15">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-white/10 bg-[#180B10] hover:bg-[#241017] text-xs font-medium text-[#C7B8A6] cursor-pointer"
            >
              Hủy
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-xl bg-gradient-to-r from-[#991B1B] to-[#B91C1C] hover:from-[#B91C1C] hover:to-[#DC2626] border border-[#D4AF37]/60 text-xs font-semibold text-[#FBF7F0] cursor-pointer"
            >
              Lưu cài đặt
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
