import React, { useEffect, useRef, useState } from 'react';
import {
  Music,
  Sparkles,
  ThumbsDown,
  Lightbulb,
  Volume2,
  VolumeX,
  HandMetal,
  Heart,
  Ban,
  Film,
  Disc3,
  Zap,
  Crown,
  ChevronDown,
  Check,
  Users,
} from 'lucide-react';
import {
  EMOTE_OPTIONS,
  THEATER_THEMES,
  type AmbientPalette,
  type EmoteType,
  type TheaterThemeId,
} from '../types';
import { unlockEmoteAudio } from '../utils/emoteAudio';

interface EmoteBarProps {
  onTriggerEmote: (emote: EmoteType) => void;
  onTriggerHeart: () => void;
  trackHearts: number;
  hasActiveTrack: boolean;
  canEmote: boolean;
  emoteSoundEnabled: boolean;
  onToggleEmoteSound: () => void;
  ambientLightingEnabled: boolean;
  onToggleAmbientLighting: () => void;
  ambientPalette: AmbientPalette;
  roomTheme: TheaterThemeId;
  localThemePreference: 'room' | TheaterThemeId;
  effectiveTheme: TheaterThemeId;
  isSelfHost: boolean;
  onSelectLocalTheme: (pref: 'room' | TheaterThemeId) => void;
  onUpdateRoomTheme: (theme: TheaterThemeId) => void;
  disabled?: boolean;
}

function renderEmoteIcon(emote: EmoteType, className: string) {
  switch (emote) {
    case 'dance':
      return <Sparkles className={className} />;
    case 'clap':
      return <HandMetal className={className} />;
    case 'whistle':
      return <Music className={className} />;
    case 'boo':
      return <ThumbsDown className={className} />;
  }
}

export function renderThemeIcon(themeId: TheaterThemeId, className: string) {
  switch (themeId) {
    case 'cinema':
      return <Film className={className} />;
    case 'vinyl':
      return <Disc3 className={className} />;
    case 'edm':
      return <Zap className={className} />;
    case 'opera':
      return <Sparkles className={className} />;
  }
}

const BAR_THEME_CLASS: Record<TheaterThemeId, string> = {
  cinema: 'border-[#D4AF37]/25 bg-[#12080C]',
  vinyl: 'border-[#D97706]/30 bg-[#150C07]',
  edm: 'border-cyan-400/30 bg-[#0A0F1A]',
  opera: 'border-[#FDE68A]/35 bg-[#170F08]',
};

export const EmoteBar: React.FC<EmoteBarProps> = ({
  onTriggerEmote,
  onTriggerHeart,
  trackHearts,
  hasActiveTrack,
  canEmote,
  emoteSoundEnabled,
  onToggleEmoteSound,
  ambientLightingEnabled,
  onToggleAmbientLighting,
  ambientPalette,
  roomTheme,
  localThemePreference,
  effectiveTheme,
  isSelfHost,
  onSelectLocalTheme,
  onUpdateRoomTheme,
  disabled = false,
}) => {
  const [heartPulse, setHeartPulse] = useState(false);
  const [themeMenuOpen, setThemeMenuOpen] = useState(false);
  const themeMenuRef = useRef<HTMLDivElement | null>(null);

  const handleEmoteClick = (emote: EmoteType) => {
    if (disabled || !canEmote) return;
    unlockEmoteAudio();
    onTriggerEmote(emote);
  };

  const handleHeartClick = () => {
    if (disabled || !canEmote || !hasActiveTrack) return;
    unlockEmoteAudio();
    setHeartPulse(true);
    window.setTimeout(() => setHeartPulse(false), 150);
    onTriggerHeart();
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && themeMenuOpen) {
        setThemeMenuOpen(false);
        return;
      }
      if (disabled || !canEmote) return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if ((e.key === '5' || e.key.toLowerCase() === 'h') && hasActiveTrack) {
        e.preventDefault();
        unlockEmoteAudio();
        setHeartPulse(true);
        window.setTimeout(() => setHeartPulse(false), 150);
        onTriggerHeart();
        return;
      }

      const matched = EMOTE_OPTIONS.find((opt) => opt.hotkey === e.key);
      if (matched) {
        e.preventDefault();
        unlockEmoteAudio();
        onTriggerEmote(matched.id);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onTriggerEmote, onTriggerHeart, hasActiveTrack, canEmote, disabled, themeMenuOpen]);

  useEffect(() => {
    if (!themeMenuOpen) return;
    const handleOutsideClick = (e: MouseEvent) => {
      if (themeMenuRef.current && !themeMenuRef.current.contains(e.target as Node)) {
        setThemeMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [themeMenuOpen]);

  const activeThemeMeta =
    THEATER_THEMES.find((t) => t.id === effectiveTheme) || THEATER_THEMES[0];
  const roomThemeMeta =
    THEATER_THEMES.find((t) => t.id === roomTheme) || THEATER_THEMES[0];

  return (
    <div
      aria-label="Thanh tương tác emote, thả tim, không gian và ánh sáng rạp"
      className={`rounded-xl border px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2.5 shadow-lg transition-colors duration-300 ${BAR_THEME_CLASS[effectiveTheme]}`}
    >
      {/* Emote & Heart Quick Buttons */}
      <div className="flex flex-wrap items-center gap-2">
        {EMOTE_OPTIONS.map((opt) => (
          <button
            key={opt.id}
            type="button"
            disabled={disabled || !canEmote}
            onClick={() => handleEmoteClick(opt.id)}
            title={
              !canEmote
                ? 'Chủ phòng đã tạm khóa quyền gửi emote của bạn'
                : `Gửi emote ${opt.label} (Phím ${opt.hotkey})`
            }
            className="h-9 px-3 rounded-lg border border-[#D4AF37]/20 bg-[#1B0C11] hover:bg-[#2B131C] hover:border-[#D4AF37]/50 active:scale-95 text-xs font-medium text-[#F5EFE6] flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap shrink-0"
          >
            <span style={{ color: opt.accentHex }}>
              {renderEmoteIcon(opt.id, 'w-3.5 h-3.5')}
            </span>
            <span>{opt.label}</span>
            <span className="hidden md:inline font-mono text-[10px] text-[#7D6C5F] ml-0.5">
              {opt.hotkey}
            </span>
          </button>
        ))}

        {/* Spam Heart Button for Current Track */}
        <button
          type="button"
          disabled={disabled || !canEmote || !hasActiveTrack}
          onClick={handleHeartClick}
          title={
            !canEmote
              ? 'Chủ phòng đã tạm khóa quyền thả tim của bạn'
              : 'Thả tim bài đang phát — bấm liên tục để tăng độ yêu thích (Phím H hoặc 5)'
          }
          className={`h-9 px-3.5 rounded-lg border text-xs font-semibold flex items-center gap-1.5 transition-transform cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap shrink-0 ${
            heartPulse ? 'scale-110' : 'scale-100 active:scale-95'
          } ${
            hasActiveTrack && canEmote
              ? 'border-rose-400/50 bg-[#35101B] hover:bg-[#4A1525] text-rose-100 shadow-[0_0_16px_rgba(244,63,94,0.22)]'
              : 'border-white/10 bg-[#160A0E] text-[#8E7D70]'
          }`}
        >
          <Heart
            className={`w-3.5 h-3.5 text-rose-400 ${hasActiveTrack && canEmote ? 'fill-rose-500' : ''}`}
          />
          <span>Thả tim</span>
          <span className="font-mono tabular-nums text-[11px] text-rose-200 ml-0.5">
            {trackHearts}
          </span>
        </button>

        {!canEmote && (
          <span className="inline-flex items-center gap-1 text-[11px] text-rose-300 pl-1">
            <Ban className="w-3 h-3" />
            <span>Đã khóa emote</span>
          </span>
        )}
      </div>

      {/* Sound, Theme Switcher & Video Lighting Toggles */}
      <div className="flex flex-wrap items-center gap-2 shrink-0">
        {/* Theme Popover Switcher */}
        <div className="relative" ref={themeMenuRef}>
          <button
            type="button"
            onClick={() => setThemeMenuOpen((prev) => !prev)}
            aria-expanded={themeMenuOpen}
            aria-haspopup="menu"
            title="Chọn giao diện không gian rạp cho riêng bạn hoặc cả phòng"
            className="h-9 px-3 rounded-lg border border-[#D4AF37]/30 bg-[#1B0C11] hover:bg-[#2A131A] text-xs font-medium text-[#FDE68A] flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <span style={{ color: activeThemeMeta.accentHex }}>
              {renderThemeIcon(effectiveTheme, 'w-3.5 h-3.5')}
            </span>
            <span>Không gian: {activeThemeMeta.shortLabel}</span>
            {localThemePreference !== 'room' && (
              <span className="text-[10px] text-[#B8A798] hidden sm:inline">(Riêng)</span>
            )}
            <ChevronDown
              className={`w-3.5 h-3.5 text-[#C7B8A6] transition-transform ${
                themeMenuOpen ? 'rotate-180' : ''
              }`}
            />
          </button>

          {themeMenuOpen && (
            <div
              role="menu"
              aria-label="Chọn không gian rạp"
              className="absolute right-0 bottom-11 sm:bottom-auto sm:top-11 z-40 w-72 rounded-xl border border-[#D4AF37]/35 bg-[#12080C]/98 backdrop-blur-md shadow-2xl p-3 space-y-3"
            >
              <div>
                <div className="text-[11px] font-semibold text-[#D4AF37] uppercase tracking-wider px-1 mb-1.5">
                  Trên máy của bạn
                </div>
                <div className="space-y-1">
                  <button
                    type="button"
                    onClick={() => {
                      onSelectLocalTheme('room');
                      setThemeMenuOpen(false);
                    }}
                    className={`w-full px-2.5 py-2 rounded-lg text-left text-xs flex items-center justify-between gap-2 transition-colors cursor-pointer ${
                      localThemePreference === 'room'
                        ? 'bg-[#29131B] border border-[#D4AF37]/45 text-[#FDE68A]'
                        : 'hover:bg-[#1E0E14] text-[#E5D9C8] border border-transparent'
                    }`}
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      <Users className="w-3.5 h-3.5 text-[#D4AF37] shrink-0" />
                      <span className="truncate">
                        Theo chủ phòng ({roomThemeMeta.shortLabel})
                      </span>
                    </span>
                    {localThemePreference === 'room' && (
                      <Check className="w-3.5 h-3.5 text-[#FDE68A] shrink-0" />
                    )}
                  </button>

                  {THEATER_THEMES.map((t) => {
                    const isSelected = localThemePreference === t.id;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => {
                          onSelectLocalTheme(t.id);
                          setThemeMenuOpen(false);
                        }}
                        className={`w-full px-2.5 py-2 rounded-lg text-left text-xs flex items-center justify-between gap-2 transition-colors cursor-pointer ${
                          isSelected
                            ? 'bg-[#29131B] border border-[#D4AF37]/45 text-[#FDE68A]'
                            : 'hover:bg-[#1E0E14] text-[#E5D9C8] border border-transparent'
                        }`}
                      >
                        <span className="flex items-center gap-2 min-w-0">
                          <span style={{ color: t.accentHex }} className="shrink-0">
                            {renderThemeIcon(t.id, 'w-3.5 h-3.5')}
                          </span>
                          <span className="truncate">{t.label}</span>
                        </span>
                        {isSelected && <Check className="w-3.5 h-3.5 text-[#FDE68A] shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              {isSelfHost && (
                <div className="pt-2.5 border-t border-[#D4AF37]/20">
                  <div className="text-[11px] font-semibold text-[#FDE68A] uppercase tracking-wider px-1 mb-1.5 flex items-center gap-1.5">
                    <Crown className="w-3 h-3" />
                    <span>Đổi cho cả phòng</span>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {THEATER_THEMES.map((t) => {
                      const isRoomActive = roomTheme === t.id;
                      return (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => {
                            onUpdateRoomTheme(t.id);
                            setThemeMenuOpen(false);
                          }}
                          className={`px-2.5 py-1.5 rounded-lg border text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer ${
                            isRoomActive
                              ? 'border-[#D4AF37]/60 bg-[#321720] text-[#FDE68A]'
                              : 'border-white/10 bg-[#180B10] hover:bg-[#241118] text-[#C7B8A6]'
                          }`}
                        >
                          <span style={{ color: t.accentHex }} className="shrink-0">
                            {renderThemeIcon(t.id, 'w-3 h-3')}
                          </span>
                          <span className="truncate">{t.shortLabel}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={() => {
            unlockEmoteAudio();
            onToggleEmoteSound();
          }}
          aria-pressed={emoteSoundEnabled}
          title={emoteSoundEnabled ? 'Tắt âm thanh emote' : 'Bật âm thanh emote'}
          className={`h-9 px-3 rounded-lg border text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
            emoteSoundEnabled
              ? 'border-[#D4AF37]/30 bg-[#1B0C11] text-[#E5D9C8] hover:bg-[#28121A]'
              : 'border-white/10 bg-[#0D0609] text-[#8E7D70] hover:text-[#C7B8A6]'
          }`}
        >
          {emoteSoundEnabled ? (
            <Volume2 className="w-3.5 h-3.5 text-[#D4AF37]" />
          ) : (
            <VolumeX className="w-3.5 h-3.5" />
          )}
          <span className="hidden sm:inline">Âm emote</span>
        </button>

        <button
          type="button"
          onClick={onToggleAmbientLighting}
          aria-pressed={ambientLightingEnabled}
          title="Bật hoặc tắt ánh sáng rạp theo khung hình video"
          className={`h-9 px-3 rounded-lg border text-xs font-medium flex items-center gap-2 transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
            ambientLightingEnabled
              ? 'border-[#D4AF37]/45 bg-[#241016] text-[#FDE68A] hover:bg-[#31151E]'
              : 'border-white/10 bg-[#0D0609] text-[#8E7D70] hover:text-[#C7B8A6]'
          }`}
        >
          <Lightbulb
            className={`w-3.5 h-3.5 ${ambientLightingEnabled ? 'text-[#FDE68A]' : 'text-[#8E7D70]'}`}
          />
          <span>{ambientLightingEnabled ? 'Ánh sáng: Bật' : 'Ánh sáng: Tắt'}</span>
          {ambientLightingEnabled && (
            <span
              aria-hidden="true"
              className="w-3 h-3 rounded-full border border-white/25 shrink-0 transition-colors duration-300"
              style={{
                background: `linear-gradient(135deg, ${ambientPalette.leftColor}, ${ambientPalette.centerColor}, ${ambientPalette.rightColor})`,
              }}
            />
          )}
        </button>
      </div>
    </div>
  );
};

