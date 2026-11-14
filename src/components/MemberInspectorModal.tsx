import React, { useState } from 'react';
import {
  X,
  Crown,
  ListMusic,
  Play,
  Sparkles,
  UserX,
  ArrowRightLeft,
  Check,
  Ban,
} from 'lucide-react';
import type { MemberPermissions, TheaterUser } from '../types';
import { CharacterAvatar } from './CharacterAvatar';

interface MemberInspectorModalProps {
  user: TheaterUser;
  selfId: string | null;
  viewerIsHost: boolean;
  onClose: () => void;
  onUpdatePermissions: (targetUserId: string, permissions: Partial<MemberPermissions>) => void;
  onKickMember: (targetUserId: string) => void;
  onTransferHost: (targetUserId: string) => void;
}

const ROW_LABELS = ['A', 'B', 'C', 'D', 'E', 'F'];

function formatSeatLabel(seatIndex: number): string {
  const row = Math.floor(seatIndex / 8);
  const col = (seatIndex % 8) + 1;
  return `${ROW_LABELS[row] || `R${row + 1}`}${col}`;
}

function formatJoinTime(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export const MemberInspectorModal: React.FC<MemberInspectorModalProps> = ({
  user,
  selfId,
  viewerIsHost,
  onClose,
  onUpdatePermissions,
  onKickMember,
  onTransferHost,
}) => {
  const [confirmKick, setConfirmKick] = useState(false);
  const [confirmTransfer, setConfirmTransfer] = useState(false);

  const isSelf = user.id === selfId;
  const canModerateTarget = viewerIsHost && !isSelf && !user.isHost;

  const permissionItems: Array<{
    key: keyof MemberPermissions;
    label: string;
    desc: string;
    icon: React.ReactNode;
    enabled: boolean;
  }> = [
    {
      key: 'canAddQueue',
      label: 'Thêm & chỉnh sửa hàng chờ',
      desc: 'Dán link YouTube, chọn phát ngay hoặc xóa bài chờ',
      icon: <ListMusic className="w-4 h-4 text-[#D4AF37]" />,
      enabled: user.isHost ? true : user.permissions.canAddQueue,
    },
    {
      key: 'canControlPlayback',
      label: 'Phát, tạm dừng & tua video',
      desc: 'Điều khiển tiến độ phát chung của cả rạp',
      icon: <Play className="w-4 h-4 text-[#D4AF37]" />,
      enabled: user.isHost ? true : user.permissions.canControlPlayback,
    },
    {
      key: 'canEmote',
      label: 'Gửi Emote & Thả tim',
      desc: 'Nhảy, vỗ tay, huýt sáo, booo và thả tim trên màn hình',
      icon: <Sparkles className="w-4 h-4 text-[#D4AF37]" />,
      enabled: user.isHost ? true : user.permissions.canEmote,
    },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Thông tin khán giả ${user.name}`}
        className="w-full max-w-md rounded-2xl border border-[#D4AF37]/35 bg-[#14090D] text-[#F5EFE6] shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-[#D4AF37]/15 flex items-center justify-between gap-3 bg-[#1A0C11]">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-12 h-12 rounded-xl border border-[#D4AF37]/25 bg-[#0B0608] flex items-center justify-center shrink-0">
              <CharacterAvatar shirtColor={user.shirtColor} view="front" size={38} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3
                  style={{ fontFamily: 'var(--font-display)' }}
                  className="text-lg font-bold text-[#FBF7F0] truncate"
                >
                  {user.name}
                  {isSelf ? ' (Bạn)' : ''}
                </h3>
                {user.isHost && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#D4AF37]/20 border border-[#D4AF37]/45 text-[11px] font-semibold text-[#FDE68A] shrink-0">
                    <Crown className="w-3 h-3" />
                    Chủ phòng
                  </span>
                )}
              </div>
              <p className="text-xs text-[#A89888] font-mono tabular-nums mt-0.5">
                Ghế {formatSeatLabel(user.seatIndex)} · Vào lúc {formatJoinTime(user.joinedAt)}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng thông tin thành viên"
            className="p-2 rounded-lg text-[#A89888] hover:text-[#FBF7F0] hover:bg-[#261118] cursor-pointer transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Permissions Section */}
        <div className="p-5 space-y-3">
          <div className="text-xs font-semibold uppercase tracking-wider text-[#D4AF37]">
            {canModerateTarget ? 'Phân quyền tương tác' : 'Quyền trong rạp'}
          </div>

          <div className="space-y-2.5">
            {permissionItems.map((item) => (
              <div
                key={item.key}
                className="rounded-xl border border-[#D4AF37]/15 bg-[#0E0609] px-3.5 py-2.5 flex items-center justify-between gap-3"
              >
                <div className="flex items-start gap-2.5 min-w-0">
                  <div className="mt-0.5 shrink-0">{item.icon}</div>
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-[#F5EFE6]">{item.label}</div>
                    <div className="text-[11px] text-[#8E7D70]">{item.desc}</div>
                  </div>
                </div>

                {canModerateTarget ? (
                  <button
                    type="button"
                    role="switch"
                    aria-checked={item.enabled}
                    onClick={() =>
                      onUpdatePermissions(user.id, { [item.key]: !item.enabled })
                    }
                    className={`w-11 h-6 rounded-full p-0.5 transition-colors cursor-pointer shrink-0 ${
                      item.enabled ? 'bg-[#10B981]' : 'bg-[#361A22]'
                    }`}
                  >
                    <span
                      className={`block w-5 h-5 rounded-full bg-[#FBF7F0] shadow transition-transform ${
                        item.enabled ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                ) : (
                  <span
                    className={`inline-flex items-center gap-1 text-[11px] font-medium shrink-0 ${
                      item.enabled ? 'text-emerald-300' : 'text-rose-300'
                    }`}
                  >
                    {item.enabled ? (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        <span>Cho phép</span>
                      </>
                    ) : (
                      <>
                        <Ban className="w-3.5 h-3.5" />
                        <span>Đang khóa</span>
                      </>
                    )}
                  </span>
                )}
              </div>
            ))}
          </div>

          {/* Host Actions on Member */}
          {canModerateTarget && (
            <div className="pt-3 border-t border-[#D4AF37]/15 flex flex-col sm:flex-row gap-2.5">
              {!confirmTransfer ? (
                <button
                  type="button"
                  onClick={() => {
                    setConfirmTransfer(true);
                    setConfirmKick(false);
                  }}
                  className="flex-1 h-9 px-3 rounded-xl border border-[#D4AF37]/30 bg-[#1D0E13] hover:bg-[#2B141C] text-xs font-medium text-[#FDE68A] flex items-center justify-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap"
                >
                  <ArrowRightLeft className="w-3.5 h-3.5" />
                  <span>Nhường chủ phòng</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    onTransferHost(user.id);
                    onClose();
                  }}
                  className="flex-1 h-9 px-3 rounded-xl border border-[#D4AF37] bg-[#854D0E] hover:bg-[#A16207] text-xs font-semibold text-[#FEF9C3] flex items-center justify-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap"
                >
                  <Crown className="w-3.5 h-3.5" />
                  <span>Xác nhận nhường quyền?</span>
                </button>
              )}

              {!confirmKick ? (
                <button
                  type="button"
                  onClick={() => {
                    setConfirmKick(true);
                    setConfirmTransfer(false);
                  }}
                  className="flex-1 h-9 px-3 rounded-xl border border-red-500/35 bg-red-950/40 hover:bg-red-900/60 text-xs font-medium text-red-200 flex items-center justify-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap"
                >
                  <UserX className="w-3.5 h-3.5" />
                  <span>Mời khỏi rạp</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    onKickMember(user.id);
                    onClose();
                  }}
                  className="flex-1 h-9 px-3 rounded-xl border border-red-400 bg-red-700 hover:bg-red-600 text-xs font-semibold text-white flex items-center justify-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap"
                >
                  <UserX className="w-3.5 h-3.5" />
                  <span>Chắc chắn kick?</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
