import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { DoorOpen, Sparkles, HandMetal, Music, ThumbsDown, Heart, Crown } from 'lucide-react';
import {
  EMOTE_OPTIONS,
  type ActiveEmote,
  type AmbientPalette,
  type EmoteType,
  type HeartBurst,
  type TheaterThemeId,
  type TheaterUser,
} from '../types';
import { CharacterAvatar } from './CharacterAvatar';

interface TheaterSeatsProps {
  users: TheaterUser[];
  selfId: string | null;
  isPlaying: boolean;
  activeEmotes: Record<string, ActiveEmote>;
  heartBursts: HeartBurst[];
  ambientLightingEnabled: boolean;
  ambientPalette: AmbientPalette;
  theme?: TheaterThemeId;
  danceSeed?: string;
  onSelectUser: (user: TheaterUser) => void;
}

function hashString(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const BALLROOM_STYLES = [
  { label: 'Vũ điệu Free Dance', intervalMs: 3200 },
  { label: 'Vũ điệu Waltz', intervalMs: 3800 },
  { label: 'Vũ điệu Swing', intervalMs: 2600 },
  { label: 'Vũ điệu Tango', intervalMs: 3000 },
];

const DANCE_ANCHORS: Array<{ x: number; y: number }> = [
  { x: 50, y: 48 },
  { x: 28, y: 36 },
  { x: 72, y: 36 },
  { x: 30, y: 68 },
  { x: 70, y: 68 },
  { x: 50, y: 28 },
  { x: 50, y: 74 },
  { x: 20, y: 54 },
  { x: 80, y: 54 },
];

function getEmoteBadgeMeta(emote: EmoteType) {
  return EMOTE_OPTIONS.find((e) => e.id === emote) || EMOTE_OPTIONS[0];
}

function renderBubbleIcon(emote: EmoteType) {
  switch (emote) {
    case 'dance':
      return <Sparkles className="w-3 h-3" />;
    case 'clap':
      return <HandMetal className="w-3 h-3" />;
    case 'whistle':
      return <Music className="w-3 h-3" />;
    case 'boo':
      return <ThumbsDown className="w-3 h-3" />;
  }
}

interface SeatCoord {
  index: number;
  row: number;
  col: number;
  xPct: number;
  yPct: number;
  label: string;
}

const SEATS_PER_ROW = 8;
const BASE_ROWS = 3;
const ROW_LABELS = ['A', 'B', 'C', 'D', 'E', 'F'];

// X percentages leaving a clear center aisle at 50%
const SEAT_X_PCT = [15, 23.5, 32, 40.5, 59.5, 68, 76.5, 85];
const ROW_Y_PCT = [26, 51, 76, 88];
const DOOR_POS = { x: 5.5, y: 84 };

function getSeatCoord(seatIndex: number, totalRows: number): SeatCoord {
  const row = Math.floor(seatIndex / SEATS_PER_ROW);
  const col = seatIndex % SEATS_PER_ROW;
  const xPct = SEAT_X_PCT[col] ?? 50;
  const yPct =
    row < ROW_Y_PCT.length
      ? ROW_Y_PCT[row]
      : 22 + ((row + 1) / (totalRows + 1)) * 68;
  const rowLetter = ROW_LABELS[row] || `R${row + 1}`;
  return {
    index: seatIndex,
    row,
    col,
    xPct,
    yPct,
    label: `${rowLetter}${col + 1}`,
  };
}

export const TheaterSeats: React.FC<TheaterSeatsProps> = ({
  users,
  selfId,
  isPlaying,
  activeEmotes,
  heartBursts,
  ambientLightingEnabled,
  ambientPalette,
  theme = 'cinema',
  danceSeed = '',
  onSelectUser,
}) => {
  // Track which users are currently walking in from the door vs seated
  const [walkingIds, setWalkingIds] = useState<Set<string>>(new Set());
  const [leavingUsers, setLeavingUsers] = useState<TheaterUser[]>([]);
  const [dancePhase, setDancePhase] = useState(0);

  const trackHash = useMemo(() => hashString(danceSeed || 'default-track'), [danceSeed]);
  const ballroomStyle = BALLROOM_STYLES[trackHash % BALLROOM_STYLES.length];

  useEffect(() => {
    setDancePhase(0);
  }, [danceSeed]);

  useEffect(() => {
    if (theme !== 'opera' || !isPlaying) return;
    const timer = window.setInterval(() => {
      setDancePhase((prev) => prev + 1);
    }, ballroomStyle.intervalMs);
    return () => window.clearInterval(timer);
  }, [theme, isPlaying, ballroomStyle.intervalMs]);

  const seenIdsRef = useRef<Set<string>>(new Set());
  const prevUsersMapRef = useRef<Map<string, TheaterUser>>(new Map());
  const initializedRef = useRef(false);

  useEffect(() => {
    const currentIds = new Set(users.map((u) => u.id));

    if (!initializedRef.current && users.length > 0) {
      initializedRef.current = true;
      // Users who were already here sit immediately; self walks in from the door!
      const nextWalking = new Set<string>();
      for (const u of users) {
        seenIdsRef.current.add(u.id);
        prevUsersMapRef.current.set(u.id, u);
        if (u.id === selfId) {
          nextWalking.add(u.id);
        }
      }
      if (nextWalking.size > 0) {
        setWalkingIds((prev) => new Set([...prev, ...nextWalking]));
        setTimeout(() => {
          setWalkingIds((prev) => {
            const copy = new Set(prev);
            for (const id of nextWalking) copy.delete(id);
            return copy;
          });
        }, 2150);
      }
      return;
    }

    // Detect newly arrived users
    const newlyJoined: string[] = [];
    for (const u of users) {
      if (!seenIdsRef.current.has(u.id)) {
        seenIdsRef.current.add(u.id);
        newlyJoined.push(u.id);
      }
    }

    if (newlyJoined.length > 0) {
      setWalkingIds((prev) => new Set([...prev, ...newlyJoined]));
      setTimeout(() => {
        setWalkingIds((prev) => {
          const copy = new Set(prev);
          for (const id of newlyJoined) copy.delete(id);
          return copy;
        });
      }, 2150);
    }

    // Detect leaving users for smooth walk-out animation
    const departed: TheaterUser[] = [];
    for (const [id, prevUser] of prevUsersMapRef.current.entries()) {
      if (!currentIds.has(id)) {
        departed.push(prevUser);
        seenIdsRef.current.delete(id);
      }
    }

    if (departed.length > 0) {
      setLeavingUsers((prev) => [...prev, ...departed]);
      setTimeout(() => {
        const departedIds = new Set(departed.map((d) => d.id));
        setLeavingUsers((prev) => prev.filter((u) => !departedIds.has(u.id)));
      }, 1250);
    }

    const nextMap = new Map<string, TheaterUser>();
    for (const u of users) nextMap.set(u.id, u);
    prevUsersMapRef.current = nextMap;
  }, [users, selfId]);

  const maxSeatIdx = users.reduce((max, u) => Math.max(max, u.seatIndex), 0);
  const totalRows = Math.max(BASE_ROWS, Math.floor(maxSeatIdx / SEATS_PER_ROW) + 1);
  const totalSeats = totalRows * SEATS_PER_ROW;

  const seats = useMemo(() => {
    const arr: SeatCoord[] = [];
    for (let i = 0; i < totalSeats; i += 1) {
      arr.push(getSeatCoord(i, totalRows));
    }
    return arr;
  }, [totalSeats, totalRows]);

  const userBySeat = useMemo(() => {
    const map = new Map<number, TheaterUser>();
    for (const u of users) {
      map.set(u.seatIndex, u);
    }
    return map;
  }, [users]);

  const ballroomChoreo = useMemo(() => {
    const activeDancers = users.filter((u) => !walkingIds.has(u.id));
    if (theme !== 'opera' || activeDancers.length === 0) {
      return {
        positions: new Map<string, { xPct: number; yPct: number; danceMode: 'solo' | 'partner-left' | 'partner-right' }>(),
        couples: [] as Array<{ id: string; xPct: number; yPct: number }>,
      };
    }

    const partnerCycle = Math.floor(dancePhase / 2);
    const ordered = [...activeDancers].sort((a, b) => {
      const ha = hashString(`${a.id}-${danceSeed}-${partnerCycle}`);
      const hb = hashString(`${b.id}-${danceSeed}-${partnerCycle}`);
      return ha - hb;
    });

    const positions = new Map<
      string,
      { xPct: number; yPct: number; danceMode: 'solo' | 'partner-left' | 'partner-right' }
    >();
    const couples: Array<{ id: string; xPct: number; yPct: number }> = [];

    const pairCount = Math.floor(ordered.length / 2);
    for (let p = 0; p < pairCount; p += 1) {
      const leftUser = ordered[p * 2];
      const rightUser = ordered[p * 2 + 1];
      const anchor = DANCE_ANCHORS[(p + dancePhase + (trackHash % 5)) % DANCE_ANCHORS.length];
      const wobbleX = (((trackHash + dancePhase + p * 3) % 5) - 2) * 1.8;
      const wobbleY = (((trackHash + dancePhase * 2 + p) % 5) - 2) * 1.6;
      const cx = Math.min(82, Math.max(18, anchor.x + wobbleX));
      const cy = Math.min(78, Math.max(26, anchor.y + wobbleY));

      positions.set(leftUser.id, {
        xPct: Math.max(12, cx - 3.8),
        yPct: cy,
        danceMode: 'partner-left',
      });
      positions.set(rightUser.id, {
        xPct: Math.min(88, cx + 3.8),
        yPct: cy,
        danceMode: 'partner-right',
      });
      couples.push({ id: `${leftUser.id}-${rightUser.id}`, xPct: cx, yPct: cy });
    }

    if (ordered.length % 2 === 1) {
      const soloUser = ordered[ordered.length - 1];
      const anchor =
        DANCE_ANCHORS[(pairCount + dancePhase * 2 + (trackHash % 3)) % DANCE_ANCHORS.length];
      const sx = Math.min(84, Math.max(16, anchor.x + (((dancePhase + trackHash) % 3) - 1) * 4));
      const sy = Math.min(78, Math.max(26, anchor.y + (((dancePhase * 2 + trackHash) % 3) - 1) * 3));
      positions.set(soloUser.id, { xPct: sx, yPct: sy, danceMode: 'solo' });
    }

    return { positions, couples };
  }, [theme, users, walkingIds, dancePhase, danceSeed, trackHash]);

  const sectionClass =
    theme === 'vinyl'
      ? 'border-[#D97706]/30 bg-[linear-gradient(180deg,#1A1009_0%,#110905_65%,#090503_100%)]'
      : theme === 'edm'
        ? 'border-cyan-400/30 bg-[linear-gradient(180deg,#080D1B_0%,#050812_65%,#03050B_100%)]'
        : theme === 'opera'
          ? 'border-[#FDE68A]/35 bg-[linear-gradient(180deg,#1F1209_0%,#140B05_65%,#0A0503_100%)]'
          : 'border-[#D4AF37]/25 bg-[linear-gradient(180deg,#16090D_0%,#0E0508_65%,#080305_100%)]';

  const canvasSurfaceClass =
    theme === 'vinyl'
      ? 'border-[#D97706]/20 bg-[radial-gradient(ellipse_at_50%_0%,rgba(217,119,6,0.09)_0%,rgba(13,7,4,0.98)_72%)]'
      : theme === 'edm'
        ? 'border-cyan-400/20 bg-[radial-gradient(ellipse_at_50%_0%,rgba(34,211,238,0.09)_0%,rgba(4,7,16,0.98)_74%)]'
        : theme === 'opera'
          ? 'border-[#FDE68A]/25 bg-[radial-gradient(circle_at_50%_50%,rgba(253,230,138,0.12)_0%,rgba(32,18,9,0.95)_48%,rgba(11,6,3,0.99)_82%)]'
          : 'border-[#D4AF37]/15 bg-[radial-gradient(ellipse_at_50%_0%,rgba(212,175,55,0.06)_0%,rgba(10,4,6,0.98)_70%)]';

  const headingTitle =
    theme === 'vinyl'
      ? 'Góc Lounge Đĩa Than'
      : theme === 'edm'
        ? 'Sàn Nhảy EDM'
        : theme === 'opera'
          ? 'Sảnh Khiêu Vũ'
          : 'Khán phòng rạp';

  const doorLabel =
    theme === 'vinyl'
      ? 'Cửa lounge'
      : theme === 'edm'
        ? 'Cửa sàn'
        : theme === 'opera'
          ? 'Cửa sảnh'
          : 'Cửa rạp';

  return (
    <section
      aria-label="Khu vực khán giả"
      className={`relative rounded-2xl border overflow-hidden p-4 sm:p-5 shadow-xl transition-colors duration-300 ${sectionClass}`}
    >
      {/* Subtle Header */}
      <div className="flex items-center justify-between gap-4 mb-3">
        <div className="flex items-center gap-2">
          <h3
            style={{ fontFamily: 'var(--font-display)' }}
            className="text-base font-semibold text-[#FDE68A]"
          >
            {headingTitle}
          </h3>
          <span className="text-xs text-[#A89888] font-mono tabular-nums">
            · {users.length} khán giả{' '}
            {theme === 'edm'
              ? 'đang quẩy'
              : theme === 'opera'
                ? isPlaying
                  ? `đang ${ballroomStyle.label.toLowerCase()}`
                  : 'chờ lên sàn'
                : 'đang ngồi'}
          </span>
        </div>
        <span className="text-xs text-[#8E7D70] hidden sm:inline">
          Bấm vào nhân vật để xem thông tin & phân quyền
        </span>
      </div>

      {/* Auditorium / Dance Floor Canvas */}
      <div
        className={`relative w-full h-[270px] sm:h-[310px] rounded-xl border overflow-hidden transition-colors duration-300 ${canvasSurfaceClass}`}
      >
        {/* Theme-Specific Floor Textures */}
        {theme === 'vinyl' && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 opacity-20"
            style={{
              backgroundImage:
                'repeating-linear-gradient(0deg, transparent, transparent 22px, rgba(217,119,6,0.22) 22px, rgba(217,119,6,0.22) 23px)',
            }}
          />
        )}

        {theme === 'edm' && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 opacity-20"
            style={{
              backgroundImage:
                'linear-gradient(to right, rgba(34,211,238,0.25) 1px, transparent 1px), linear-gradient(to bottom, rgba(232,121,249,0.2) 1px, transparent 1px)',
              backgroundSize: '36px 36px',
            }}
          />
        )}

        {theme === 'opera' && (
          <>
            {/* Parquet Ballroom Floor Pattern & Golden Center Dance Circle */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 opacity-15"
              style={{
                backgroundImage:
                  'repeating-linear-gradient(45deg, rgba(253,230,138,0.16) 0px, rgba(253,230,138,0.16) 1px, transparent 1px, transparent 28px), repeating-linear-gradient(-45deg, rgba(217,119,6,0.14) 0px, rgba(217,119,6,0.14) 1px, transparent 1px, transparent 28px)',
              }}
            />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-56 h-40 sm:w-80 sm:h-52 rounded-full border border-[#FDE68A]/25 shadow-[inset_0_0_50px_rgba(253,230,138,0.08)]"
            />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-32 h-24 sm:w-44 sm:h-28 rounded-full border border-dashed border-[#FDE68A]/20"
            />
          </>
        )}

        {/* Realistic Trapezoidal Screen Light Cone spilling across audience */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 transition-opacity duration-500"
          style={{
            opacity: ambientLightingEnabled ? (isPlaying ? 0.56 : 0.26) : 0,
            clipPath:
              theme === 'opera'
                ? 'ellipse(55% 65% at 50% 50%)'
                : 'polygon(14% 0%, 86% 0%, 100% 100%, 0% 100%)',
            background: `radial-gradient(ellipse 44% 72% at 22% 0%, ${ambientPalette.leftColor} 0%, transparent 72%), radial-gradient(ellipse 56% 85% at 50% 0%, ${ambientPalette.centerColor} 0%, transparent 76%), radial-gradient(ellipse 44% 72% at 78% 0%, ${ambientPalette.rightColor} 0%, transparent 72%)`,
          }}
        />

        {/* Center Aisle (Cinema, Vinyl, EDM only — Ballroom is an open dance floor) */}
        {theme !== 'opera' && (
          <div
            aria-hidden="true"
            className={`absolute top-0 bottom-0 left-1/2 -translate-x-1/2 w-12 sm:w-14 border-x ${
              theme === 'vinyl'
                ? 'bg-gradient-to-b from-[#78350F]/35 via-[#92400E]/45 to-[#451A03]/60 border-[#D97706]/25'
                : theme === 'edm'
                  ? 'bg-gradient-to-b from-cyan-500/10 via-fuchsia-500/15 to-cyan-500/10 border-cyan-400/20'
                  : 'bg-gradient-to-b from-[#5B1016]/45 via-[#7F1D1D]/55 to-[#450A0A]/70 border-[#D4AF37]/20'
            }`}
          />
        )}

        {/* Back Side Walkway */}
        <div
          aria-hidden="true"
          className={`absolute bottom-2 left-3 right-3 h-7 rounded-lg border ${
            theme === 'edm'
              ? 'bg-[#091224]/70 border-cyan-400/15'
              : theme === 'vinyl' || theme === 'opera'
                ? 'bg-[#1D1008]/70 border-[#D97706]/15'
                : 'bg-[#1A0B10]/60 border-[#D4AF37]/10'
          }`}
        />

        {/* Entrance Door on Bottom-Left */}
        <div
          style={{ left: `${DOOR_POS.x}%`, top: `${DOOR_POS.y}%` }}
          className="absolute -translate-x-1/2 -translate-y-1/2 z-10 flex flex-col items-center"
        >
          <div
            className={`w-10 h-12 rounded-t-lg border-2 flex items-center justify-center ${
              theme === 'edm'
                ? 'border-cyan-400/60 bg-gradient-to-b from-[#0F1E36] to-[#070E1A] shadow-[0_0_16px_rgba(34,211,238,0.28)]'
                : 'border-[#D4AF37]/50 bg-gradient-to-b from-[#3A1910] to-[#1D0B07] shadow-[0_0_16px_rgba(251,191,36,0.22)]'
            }`}
          >
            <DoorOpen className={`w-5 h-5 ${theme === 'edm' ? 'text-cyan-200' : 'text-[#FDE68A]'}`} />
          </div>
          <span
            className={`mt-0.5 text-[10px] font-medium whitespace-nowrap ${
              theme === 'edm' ? 'text-cyan-300' : 'text-[#D4AF37]'
            }`}
          >
            {doorLabel}
          </span>
        </div>

        {/* FREE DANCE BALLROOM FLOOR (theme === 'opera') */}
        {theme === 'opera' && (
          <>
            {/* Couple Hand-Hold Golden Sparkle Links */}
            {isPlaying &&
              ballroomChoreo.couples.map((c) => (
                <motion.div
                  key={c.id}
                  animate={{ left: `${c.xPct}%`, top: `${c.yPct}%` }}
                  transition={{ duration: 1.85, ease: 'easeInOut' }}
                  aria-hidden="true"
                  className="absolute -translate-x-1/2 -translate-y-1/2 z-10 pointer-events-none"
                >
                  <div className="w-8 h-3 rounded-full bg-[#FDE68A]/20 blur-[4px]" />
                  <Sparkles className="w-3 h-3 text-[#FDE68A]/80 mx-auto -mt-2 animate-pulse" />
                </motion.div>
              ))}

            {/* Free-Dancing Characters */}
            {users
              .filter((u) => !walkingIds.has(u.id))
              .map((occupant) => {
                const pos = ballroomChoreo.positions.get(occupant.id) || {
                  xPct: 50,
                  yPct: 50,
                  danceMode: 'solo' as const,
                };
                const isSelf = occupant.id === selfId;
                const occupantEmote = activeEmotes[occupant.id];
                const emoteMeta = occupantEmote ? getEmoteBadgeMeta(occupantEmote.emote) : null;
                const dancerHearts = heartBursts
                  .filter((hb) => hb.userId === occupant.id)
                  .slice(-5);

                return (
                  <motion.div
                    key={occupant.id}
                    initial={{ left: `${pos.xPct}%`, top: `${pos.yPct}%`, opacity: 0, scale: 0.9 }}
                    animate={{ left: `${pos.xPct}%`, top: `${pos.yPct}%`, opacity: 1, scale: 1 }}
                    transition={{ duration: 1.85, ease: 'easeInOut' }}
                    onClick={() => onSelectUser(occupant)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onSelectUser(occupant);
                      }
                    }}
                    role="button"
                    tabIndex={0}
                    title={`${occupant.name}${occupant.isHost ? ' (Chủ phòng)' : ''} — Bấm để xem chi tiết`}
                    className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center select-none cursor-pointer group hover:scale-105 transition-transform focus:outline-none z-20"
                  >
                    {/* Rising Hearts */}
                    {dancerHearts.map((hb, hIdx) => (
                      <motion.div
                        key={hb.id}
                        initial={{ opacity: 0.95, y: -12, x: ((hIdx % 3) - 1) * 7, scale: 0.7 }}
                        animate={{ opacity: 0, y: -44, x: ((hIdx % 3) - 1) * 12, scale: 1.15 }}
                        transition={{ duration: 1.1, ease: 'easeOut' }}
                        className="absolute -top-4 z-40 pointer-events-none"
                      >
                        <Heart className="w-3.5 h-3.5 text-rose-400 fill-rose-500 drop-shadow" />
                      </motion.div>
                    ))}

                    {/* Floating Emote Reaction Bubble */}
                    <AnimatePresence>
                      {occupantEmote && emoteMeta && (
                        <motion.div
                          key={`${occupant.id}-${occupantEmote.triggeredAt}`}
                          initial={{ opacity: 0, y: 8, scale: 0.8 }}
                          animate={{ opacity: 1, y: -6, scale: 1 }}
                          exit={{ opacity: 0, y: -16, scale: 0.9 }}
                          transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                          style={{
                            borderColor: `${emoteMeta.accentHex}66`,
                            color: emoteMeta.accentHex,
                          }}
                          className="absolute -top-7 z-40 px-2 py-0.5 rounded-lg bg-[#16080D]/95 border shadow-lg flex items-center gap-1 text-[10px] font-semibold whitespace-nowrap pointer-events-none"
                        >
                          {renderBubbleIcon(occupantEmote.emote)}
                          <span>{emoteMeta.bubbleText}</span>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {/* Warm Spotlight Glow Under Dancer */}
                    <div
                      aria-hidden="true"
                      className="pointer-events-none absolute bottom-3 w-9 h-3 rounded-full blur-[3px]"
                      style={{
                        backgroundColor: ambientLightingEnabled
                          ? ambientPalette.centerColor
                          : 'rgba(253, 230, 138, 0.45)',
                        opacity: isPlaying ? 0.65 : 0.28,
                      }}
                    />

                    <div
                      style={{
                        filter: ambientLightingEnabled
                          ? `drop-shadow(0 -2px 6px ${ambientPalette.centerColor})`
                          : undefined,
                      }}
                      className="pointer-events-none"
                    >
                      <CharacterAvatar
                        shirtColor={occupant.shirtColor}
                        view="front"
                        pose="standing"
                        isVibing={isPlaying}
                        activeEmote={occupantEmote?.emote ?? null}
                        danceMode={isPlaying ? pos.danceMode : 'none'}
                        size={38}
                      />
                    </div>

                    {/* Dancer Nameplate */}
                    <div
                      className={`mt-0.5 px-1.5 py-0.5 rounded text-[10px] leading-none max-w-[84px] flex items-center gap-1 justify-center ${
                        isSelf
                          ? 'text-[#FDE68A] font-semibold bg-[#241016]/95 border border-[#D4AF37]/45'
                          : occupant.isHost
                            ? 'text-[#FDE68A] font-medium bg-[#1D0C12]/90 border border-[#D4AF37]/30'
                            : 'text-[#E5D9C8] bg-[#12070A]/85 group-hover:border group-hover:border-[#D4AF37]/30'
                      }`}
                      title={occupant.name}
                    >
                      {occupant.isHost && (
                        <Crown className="w-2.5 h-2.5 text-[#FDE68A] shrink-0" />
                      )}
                      <span className="truncate">
                        {isSelf ? `${occupant.name} (Bạn)` : occupant.name}
                      </span>
                    </div>
                  </motion.div>
                );
              })}
          </>
        )}

        {/* Seats / Dance Floor Spots (Cinema, Vinyl, EDM) */}
        {theme !== 'opera' && seats.map((seat) => {
          const occupant = userBySeat.get(seat.index);
          const isWalkingIn = occupant ? walkingIds.has(occupant.id) : false;
          const isSelf = occupant?.id === selfId;
          const occupantEmote = occupant ? activeEmotes[occupant.id] : undefined;
          const emoteMeta = occupantEmote ? getEmoteBadgeMeta(occupantEmote.emote) : null;
          const seatHearts = occupant
            ? heartBursts.filter((hb) => hb.userId === occupant.id).slice(-5)
            : [];

          const seatRimColor =
            seat.col < 3
              ? ambientPalette.leftColor
              : seat.col > 4
                ? ambientPalette.rightColor
                : ambientPalette.centerColor;
          const rowRimIntensity = seat.row === 0 ? 0.72 : seat.row === 1 ? 0.45 : 0.25;

          const isClickable = Boolean(occupant && !isWalkingIn);
          const isEdmRaving = theme === 'edm' && isPlaying && !occupantEmote;

          const seatStyleClass =
            theme === 'vinyl'
              ? isSelf
                ? 'bg-gradient-to-b from-[#92400E] to-[#451A03] border-[#FDE68A]/75'
                : occupant
                  ? 'bg-gradient-to-b from-[#78350F] to-[#3B1604] border-[#D97706]/40'
                  : 'bg-gradient-to-b from-[#451A03]/80 to-[#240D02]/85 border-[#D97706]/15'
              : isSelf
                ? 'bg-gradient-to-b from-[#991B1B] to-[#5B0E0E] border-[#FDE68A]/70'
                : occupant
                  ? 'bg-gradient-to-b from-[#7F1D1D] to-[#450A0A] border-[#D4AF37]/30'
                  : 'bg-gradient-to-b from-[#541313]/75 to-[#2D0808]/85 border-[#D4AF37]/15';

          return (
            <div
              key={seat.index}
              style={{ left: `${seat.xPct}%`, top: `${seat.yPct}%` }}
              onClick={() => {
                if (occupant && !isWalkingIn) onSelectUser(occupant);
              }}
              onKeyDown={(e) => {
                if (occupant && !isWalkingIn && (e.key === 'Enter' || e.key === ' ')) {
                  e.preventDefault();
                  onSelectUser(occupant);
                }
              }}
              role={isClickable ? 'button' : undefined}
              tabIndex={isClickable ? 0 : undefined}
              title={
                occupant && !isWalkingIn
                  ? `${occupant.name}${occupant.isHost ? ' (Chủ phòng)' : ''} — Bấm để xem chi tiết`
                  : undefined
              }
              className={`absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center select-none ${
                isClickable ? 'cursor-pointer group hover:scale-105 transition-transform focus:outline-none' : ''
              }`}
            >
              {/* Rising Hearts from Seat */}
              {occupant && !isWalkingIn && seatHearts.map((hb, hIdx) => (
                <motion.div
                  key={hb.id}
                  initial={{ opacity: 0.95, y: -12, x: ((hIdx % 3) - 1) * 7, scale: 0.7 }}
                  animate={{ opacity: 0, y: -44, x: ((hIdx % 3) - 1) * 12, scale: 1.15 }}
                  transition={{ duration: 1.1, ease: 'easeOut' }}
                  className="absolute -top-4 z-40 pointer-events-none"
                >
                  <Heart className="w-3.5 h-3.5 text-rose-400 fill-rose-500 drop-shadow" />
                </motion.div>
              ))}

              {/* Floating Emote Reaction Bubble */}
              <AnimatePresence>
                {occupant && !isWalkingIn && occupantEmote && emoteMeta && (
                  <motion.div
                    key={`${occupant.id}-${occupantEmote.triggeredAt}`}
                    initial={{ opacity: 0, y: 8, scale: 0.8 }}
                    animate={{ opacity: 1, y: -6, scale: 1 }}
                    exit={{ opacity: 0, y: -16, scale: 0.9 }}
                    transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                    style={{ borderColor: `${emoteMeta.accentHex}66`, color: emoteMeta.accentHex }}
                    className="absolute -top-7 z-40 px-2 py-0.5 rounded-lg bg-[#16080D]/95 border shadow-lg flex items-center gap-1 text-[10px] font-semibold whitespace-nowrap pointer-events-none"
                  >
                    {renderBubbleIcon(occupantEmote.emote)}
                    <span>{emoteMeta.bubbleText}</span>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Seated / Dancing Character */}
              {occupant && !isWalkingIn && (
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25 }}
                  style={{
                    filter: ambientLightingEnabled
                      ? `drop-shadow(0 -2px 5px ${seatRimColor})`
                      : undefined,
                  }}
                  className={`relative z-10 pointer-events-none ${
                    theme === 'edm' ? '-mb-2' : '-mb-6'
                  }`}
                >
                  <div className={isEdmRaving ? 'animate-edm-rave' : ''}>
                    <CharacterAvatar
                      shirtColor={occupant.shirtColor}
                      view="back"
                      pose="seated"
                      isVibing={isPlaying}
                      activeEmote={occupantEmote?.emote ?? null}
                      size={38}
                    />
                  </div>
                </motion.div>
              )}

              {/* Theme Seat Backrest OR EDM Glowing LED Floor Pad */}
              {theme === 'edm' ? (
                <div
                  style={{
                    borderColor: ambientLightingEnabled
                      ? seatRimColor
                      : occupant
                        ? seat.col % 2 === 0
                          ? '#22D3EE'
                          : '#E879F9'
                        : 'rgba(34,211,238,0.22)',
                    boxShadow: occupant
                      ? `0 0 14px ${
                          ambientLightingEnabled
                            ? seatRimColor
                            : seat.col % 2 === 0
                              ? 'rgba(34,211,238,0.55)'
                              : 'rgba(232,121,249,0.55)'
                        }`
                      : undefined,
                  }}
                  className={`relative z-20 w-10 sm:w-12 h-3.5 rounded-full border flex items-center justify-center transition-colors ${
                    occupant ? 'bg-[#0F172A]/90' : 'bg-[#080E1E]/60'
                  }`}
                >
                  <span className="text-[8px] font-mono text-cyan-200/65 leading-none">
                    {seat.label}
                  </span>
                </div>
              ) : (
                <div
                  style={
                    ambientLightingEnabled
                      ? {
                          boxShadow: `0 -3px 12px -2px ${seatRimColor}, 0 4px 10px rgba(0,0,0,0.6)`,
                          borderTopColor: seatRimColor,
                          opacity: 0.92 + rowRimIntensity * 0.08,
                        }
                      : undefined
                  }
                  className={`relative z-20 w-9 sm:w-11 h-7 sm:h-8 rounded-t-xl rounded-b-sm border transition-colors flex flex-col items-center justify-end pb-1 shadow-md ${seatStyleClass}`}
                >
                  {/* Seat stitch accent */}
                  <div className="w-5/6 h-[1px] bg-[#D4AF37]/25 mb-1" />
                  <span className="text-[9px] font-mono text-[#E5D9C8]/45 leading-none">
                    {seat.label}
                  </span>
                </div>
              )}

              {/* Occupant Nameplate */}
              {occupant && !isWalkingIn && (
                <div
                  className={`mt-1 px-1.5 py-0.5 rounded text-[10px] leading-none max-w-[84px] flex items-center gap-1 justify-center ${
                    isSelf
                      ? 'text-[#FDE68A] font-semibold bg-[#241016]/95 border border-[#D4AF37]/45'
                      : occupant.isHost
                        ? 'text-[#FDE68A] font-medium bg-[#1D0C12]/90 border border-[#D4AF37]/30'
                        : 'text-[#E5D9C8] bg-[#12070A]/85 group-hover:border group-hover:border-[#D4AF37]/30'
                  }`}
                  title={occupant.name}
                >
                  {occupant.isHost && <Crown className="w-2.5 h-2.5 text-[#FDE68A] shrink-0" />}
                  <span className="truncate">
                    {isSelf ? `${occupant.name} (Bạn)` : occupant.name}
                  </span>
                </div>
              )}
            </div>
          );
        })}

        {/* Walking-In Characters Layer (from Door -> Aisle -> Seat) */}
        {users
          .filter((u) => walkingIds.has(u.id))
          .map((u) => {
            const seat = getSeatCoord(u.seatIndex, totalRows);
            return (
              <motion.div
                key={`walk-in-${u.id}`}
                initial={{ left: `${DOOR_POS.x}%`, top: `${DOOR_POS.y}%`, opacity: 0.4 }}
                animate={{
                  left: [
                    `${DOOR_POS.x}%`,
                    '50%',
                    '50%',
                    `${seat.xPct}%`,
                    `${seat.xPct}%`,
                  ],
                  top: [
                    `${DOOR_POS.y}%`,
                    `${DOOR_POS.y}%`,
                    `${seat.yPct + 7}%`,
                    `${seat.yPct + 7}%`,
                    `${seat.yPct - 4}%`,
                  ],
                  opacity: [0.6, 1, 1, 1, 1],
                }}
                transition={{
                  duration: 2.1,
                  times: [0, 0.3, 0.65, 0.9, 1],
                  ease: 'easeInOut',
                }}
                className="absolute -translate-x-1/2 -translate-y-1/2 z-30 flex flex-col items-center pointer-events-none"
              >
                <CharacterAvatar
                  shirtColor={u.shirtColor}
                  view="back"
                  pose="walking"
                  size={40}
                />
                <span className="mt-0.5 px-1.5 py-0.5 rounded bg-[#14090D]/90 text-[10px] text-[#FDE68A] whitespace-nowrap">
                  {u.name}
                </span>
              </motion.div>
            );
          })}

        {/* Walking-Out Characters Layer (Seat -> Aisle -> Door) */}
        {leavingUsers.map((u) => {
          const seat = getSeatCoord(u.seatIndex, totalRows);
          return (
            <motion.div
              key={`walk-out-${u.id}`}
              initial={{ left: `${seat.xPct}%`, top: `${seat.yPct}%`, opacity: 1 }}
              animate={{
                left: [`${seat.xPct}%`, '50%', '50%', `${DOOR_POS.x}%`],
                top: [`${seat.yPct}%`, `${seat.yPct + 6}%`, `${DOOR_POS.y}%`, `${DOOR_POS.y}%`],
                opacity: [1, 1, 0.85, 0],
              }}
              transition={{ duration: 1.2, ease: 'easeIn' }}
              className="absolute -translate-x-1/2 -translate-y-1/2 z-30 flex flex-col items-center pointer-events-none"
            >
              <CharacterAvatar
                shirtColor={u.shirtColor}
                view="back"
                pose="walking"
                size={38}
              />
            </motion.div>
          );
        })}
      </div>
    </section>
  );
};
