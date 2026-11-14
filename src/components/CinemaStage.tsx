import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import {
  Play,
  Pause,
  SkipForward,
  Volume2,
  VolumeX,
  Film,
  Sparkles,
  Heart,
  Lock,
  Disc3,
} from 'lucide-react';
import type {
  AmbientPalette,
  HeartBurst,
  PlaybackState,
  QueueItem,
  TheaterThemeId,
} from '../types';
import { formatTimeSeconds } from '../utils/youtube';

interface YTPlayer {
  loadVideoById: (options: { videoId: string; startSeconds?: number }) => void;
  cueVideoById: (options: { videoId: string; startSeconds?: number }) => void;
  playVideo: () => void;
  pauseVideo: () => void;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  getPlayerState: () => number;
  setVolume: (volume: number) => void;
  mute: () => void;
  unMute: () => void;
  isMuted: () => boolean;
  destroy: () => void;
}

interface YTNamespace {
  Player: new (
    element: HTMLElement | string,
    options: {
      width?: string | number;
      height?: string | number;
      videoId?: string;
      playerVars?: Record<string, number | string>;
      events?: {
        onReady?: (event: { target: YTPlayer }) => void;
        onStateChange?: (event: { target: YTPlayer; data: number }) => void;
      };
    }
  ) => YTPlayer;
  PlayerState: {
    UNSTARTED: number;
    ENDED: number;
    PLAYING: number;
    PAUSED: number;
    BUFFERING: number;
    CUED: number;
  };
}

declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let ytApiPromise: Promise<YTNamespace> | null = null;

function loadYouTubeIframeAPI(): Promise<YTNamespace> {
  if (typeof window !== 'undefined' && window.YT && window.YT.Player) {
    return Promise.resolve(window.YT);
  }
  if (ytApiPromise) return ytApiPromise;

  ytApiPromise = new Promise((resolve) => {
    const previousCallback = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      if (previousCallback) previousCallback();
      if (window.YT) resolve(window.YT);
    };

    const existingScript = document.querySelector(
      'script[src="https://www.youtube.com/iframe_api"]'
    );
    if (!existingScript) {
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      tag.async = true;
      document.head.appendChild(tag);
    }
  });

  return ytApiPromise;
}

interface CinemaStageProps {
  hasJoinedCinema: boolean;
  onJoinCinema: () => void;
  currentItem: QueueItem | null;
  trackHearts: number;
  heartBursts: HeartBurst[];
  playback: PlaybackState;
  clockOffsetMs: number;
  onPlaybackControl: (action: 'play' | 'pause' | 'seek', position: number) => void;
  onTrackEnded: (expectedCurrentId: string) => void;
  onNextTrack: () => void;
  onDurationChange: (durationSec: number) => void;
  queueLength: number;
  canControlPlayback: boolean;
  canAddQueue: boolean;
  ambientLightingEnabled: boolean;
  ambientPalette: AmbientPalette;
  theme?: TheaterThemeId;
}

export const CinemaStage: React.FC<CinemaStageProps> = ({
  hasJoinedCinema,
  onJoinCinema,
  currentItem,
  trackHearts,
  heartBursts,
  playback,
  clockOffsetMs,
  onPlaybackControl,
  onTrackEnded,
  onNextTrack,
  onDurationChange,
  queueLength,
  canControlPlayback,
  canAddQueue,
  ambientLightingEnabled,
  ambientPalette,
  theme = 'cinema',
}) => {
  const playerHostRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<YTPlayer | null>(null);
  const playerReadyRef = useRef(false);

  const currentItemRef = useRef<QueueItem | null>(currentItem);
  const playbackRef = useRef<PlaybackState>(playback);
  const clockOffsetRef = useRef<number>(clockOffsetMs);
  const canControlPlaybackRef = useRef<boolean>(canControlPlayback);
  const loadedVideoIdRef = useRef<string | null>(null);
  const loadedTrackUniqueIdRef = useRef<string | null>(null);
  const ignoreYtEventsUntilRef = useRef<number>(0);

  const [displayTime, setDisplayTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(80);
  const [isMuted, setIsMuted] = useState(false);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [scrubValue, setScrubValue] = useState(0);
  const [vinylArtFailed, setVinylArtFailed] = useState(false);

  useEffect(() => {
    setVinylArtFailed(false);
  }, [currentItem?.videoId]);

  currentItemRef.current = currentItem;
  playbackRef.current = playback;
  clockOffsetRef.current = clockOffsetMs;
  canControlPlaybackRef.current = canControlPlayback;

  const computeTargetPosition = useCallback(
    (pb: PlaybackState, offsetMs: number): number => {
      if (!pb.isPlaying) return Math.max(0, pb.position);
      const estimatedServerNow = Date.now() + offsetMs;
      const elapsedSec = Math.max(0, (estimatedServerNow - pb.updatedAt) / 1000);
      return Math.max(0, pb.position + elapsedSec);
    },
    []
  );

  const applySyncToPlayer = useCallback(
    (forceReload = false) => {
      const player = playerRef.current;
      const item = currentItemRef.current;
      const pb = playbackRef.current;
      if (!player || !playerReadyRef.current || !item) return;

      const targetPos = computeTargetPosition(pb, clockOffsetRef.current);
      ignoreYtEventsUntilRef.current = Date.now() + 1400;

      const trackChanged =
        forceReload || loadedTrackUniqueIdRef.current !== item.id || loadedVideoIdRef.current !== item.videoId;

      if (trackChanged) {
        loadedVideoIdRef.current = item.videoId;
        loadedTrackUniqueIdRef.current = item.id;
        if (pb.isPlaying) {
          player.loadVideoById({ videoId: item.videoId, startSeconds: Math.floor(targetPos) });
          player.playVideo();
        } else {
          player.cueVideoById({ videoId: item.videoId, startSeconds: Math.floor(targetPos) });
        }
        setDisplayTime(targetPos);
        return;
      }

      const currentPlayerTime = player.getCurrentTime?.() ?? 0;
      if (Math.abs(currentPlayerTime - targetPos) > 1.0) {
        player.seekTo(targetPos, true);
      }

      const state = player.getPlayerState?.();
      if (pb.isPlaying) {
        if (state !== 1 && state !== 3) {
          player.playVideo();
        }
      } else {
        if (state === 1 || state === 3) {
          player.pauseVideo();
        }
      }
    },
    [computeTargetPosition]
  );

  const hasActiveTrack = Boolean(currentItem);

  // Initialize YouTube Player once user clicks "Vào rạp chiếu" and a track is available
  useEffect(() => {
    if (!hasJoinedCinema || !hasActiveTrack) return;
    let cancelled = false;

    loadYouTubeIframeAPI().then((YT) => {
      if (cancelled || !playerHostRef.current || playerRef.current) return;

      const initialItem = currentItemRef.current;
      if (!initialItem) return;

      const startSeconds = Math.floor(
        computeTargetPosition(playbackRef.current, clockOffsetRef.current)
      );

      const playerDiv = document.createElement('div');
      playerDiv.className = 'w-full h-full';
      playerHostRef.current.innerHTML = '';
      playerHostRef.current.appendChild(playerDiv);

      const player = new YT.Player(playerDiv, {
        width: '100%',
        height: '100%',
        videoId: initialItem.videoId,
        playerVars: {
          autoplay: playbackRef.current.isPlaying ? 1 : 0,
          controls: 1,
          rel: 0,
          modestbranding: 1,
          playsinline: 1,
          start: startSeconds,
        },
        events: {
          onReady: (ev) => {
            if (cancelled) return;
            playerRef.current = ev.target;
            playerReadyRef.current = true;
            ev.target.setVolume(volume);
            if (isMuted) {
              ev.target.mute();
            } else {
              ev.target.unMute();
            }
            if (currentItemRef.current) {
              applySyncToPlayer(true);
            }
          },
          onStateChange: (ev) => {
            if (cancelled) return;
            const state = ev.data;
            const activeItem = currentItemRef.current;

            if (state === 0 && activeItem) {
              // Video ended
              onTrackEnded(activeItem.id);
              return;
            }

            if (Date.now() < ignoreYtEventsUntilRef.current) {
              return;
            }

            if (!activeItem || !canControlPlaybackRef.current) return;

            if (state === 1 && !playbackRef.current.isPlaying) {
              onPlaybackControl('play', ev.target.getCurrentTime());
            } else if (state === 2 && playbackRef.current.isPlaying) {
              onPlaybackControl('pause', ev.target.getCurrentTime());
            }
          },
        },
      });

      playerRef.current = player;
    });

    return () => {
      cancelled = true;
    };
  }, [hasJoinedCinema, hasActiveTrack]);

  // Cleanup player only on unmount
  useEffect(() => {
    return () => {
      if (playerRef.current) {
        try {
          playerRef.current.destroy();
        } catch {
          // ignore
        }
        playerRef.current = null;
        playerReadyRef.current = false;
      }
    };
  }, []);

  // Re-sync whenever track or playback state updates from server
  useEffect(() => {
    if (!hasJoinedCinema) return;
    if (!currentItem) {
      loadedVideoIdRef.current = null;
      loadedTrackUniqueIdRef.current = null;
      if (playerRef.current && playerReadyRef.current) {
        ignoreYtEventsUntilRef.current = Date.now() + 800;
        playerRef.current.pauseVideo();
      }
      setDisplayTime(0);
      setDuration(0);
      return;
    }
    applySyncToPlayer(false);
  }, [hasJoinedCinema, currentItem?.id, playback.isPlaying, playback.position, playback.updatedAt, applySyncToPlayer]);

  // Periodic drift monitor (> 1.0s) & progress ticker
  useEffect(() => {
    const interval = setInterval(() => {
      const item = currentItemRef.current;
      const pb = playbackRef.current;
      if (!item) {
        setDisplayTime(0);
        return;
      }

      const targetPos = computeTargetPosition(pb, clockOffsetRef.current);
      if (!isScrubbing) {
        setDisplayTime(targetPos);
      }

      const player = playerRef.current;
      if (!hasJoinedCinema || !player || !playerReadyRef.current) return;

      const ytDuration = player.getDuration?.() ?? 0;
      if (ytDuration > 0) {
        setDuration(ytDuration);
        onDurationChange(ytDuration);
      }

      if (Date.now() < ignoreYtEventsUntilRef.current) return;

      const ytTime = player.getCurrentTime?.() ?? 0;
      const state = player.getPlayerState?.();

      if (pb.isPlaying && state === 1 && Math.abs(ytTime - targetPos) > 1.0) {
        ignoreYtEventsUntilRef.current = Date.now() + 1100;
        player.seekTo(targetPos, true);
      } else if (!pb.isPlaying && Math.abs(ytTime - targetPos) > 1.2) {
        ignoreYtEventsUntilRef.current = Date.now() + 1100;
        player.seekTo(targetPos, true);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [hasJoinedCinema, computeTargetPosition, isScrubbing]);

  const handleTogglePlay = () => {
    if (!currentItem || !hasJoinedCinema || !canControlPlayback) return;
    const player = playerRef.current;
    const currentPos =
      player && playerReadyRef.current
        ? player.getCurrentTime()
        : computeTargetPosition(playback, clockOffsetMs);
    onPlaybackControl(playback.isPlaying ? 'pause' : 'play', currentPos);
  };

  const handleSeekCommit = (newTime: number) => {
    setIsScrubbing(false);
    if (!currentItem || !hasJoinedCinema || !canControlPlayback) return;
    setDisplayTime(newTime);
    if (playerRef.current && playerReadyRef.current) {
      ignoreYtEventsUntilRef.current = Date.now() + 1200;
      playerRef.current.seekTo(newTime, true);
    }
    onPlaybackControl('seek', newTime);
  };

  const handleVolumeChange = (nextVol: number) => {
    setVolume(nextVol);
    if (nextVol > 0 && isMuted) {
      setIsMuted(false);
      playerRef.current?.unMute();
    }
    playerRef.current?.setVolume(nextVol);
  };

  const handleToggleMute = () => {
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    if (playerRef.current && playerReadyRef.current) {
      if (nextMuted) playerRef.current.mute();
      else playerRef.current.unMute();
    }
  };

  const shownTime = isScrubbing ? scrubValue : displayTime;
  const maxDuration = duration > 0 ? duration : Math.max(shownTime + 30, 180);

  const showDynamicGlow = ambientLightingEnabled && hasJoinedCinema && Boolean(currentItem);
  const isStagePlaying = hasJoinedCinema && Boolean(currentItem) && playback.isPlaying;

  const frameSurfaceClass =
    theme === 'vinyl'
      ? 'bg-[#120A05]'
      : theme === 'edm'
        ? 'bg-[#050812]'
        : theme === 'opera'
          ? 'bg-[#100409]'
          : 'bg-[#070305]';

  const frameBorderDefault =
    theme === 'edm'
      ? 'rgba(34, 211, 238, 0.35)'
      : theme === 'vinyl'
        ? 'rgba(217, 119, 6, 0.38)'
        : theme === 'opera'
          ? 'rgba(253, 230, 138, 0.48)'
          : 'rgba(212, 175, 55, 0.28)';

  const controlStripClass =
    theme === 'vinyl'
      ? 'bg-[#160C06] border-[#D97706]/25'
      : theme === 'edm'
        ? 'bg-[#080D19] border-cyan-400/20'
        : theme === 'opera'
          ? 'bg-[#16060D] border-[#FDE68A]/25'
          : 'bg-[#12080B] border-[#D4AF37]/20';

  const gateSubtitle =
    theme === 'vinyl'
      ? 'Sẵn sàng xoay đĩa & thưởng nhạc'
      : theme === 'edm'
        ? 'Sẵn sàng lên nhạc quẩy sàn EDM'
        : theme === 'opera'
          ? 'Sẵn sàng bước vào sảnh khiêu vũ'
          : 'Sẵn sàng bước vào rạp chiếu';

  const gateButtonLabel =
    theme === 'vinyl'
      ? 'Ngồi vào góc đĩa than'
      : theme === 'edm'
        ? 'Bước lên sàn EDM'
        : theme === 'opera'
          ? 'Bước vào sảnh khiêu vũ'
          : 'Vào rạp chiếu';

  return (
    <section aria-label="Sân khấu phát nhạc" className="w-full relative">
      {/* Wide Theater Wall Scatter Halo */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -inset-4 sm:-inset-7 rounded-3xl blur-3xl transition-opacity duration-500"
        style={{
          opacity: showDynamicGlow ? (playback.isPlaying ? 0.62 : 0.25) : 0,
          background: `radial-gradient(circle at 16% 45%, ${ambientPalette.leftColor} 0%, transparent 56%), radial-gradient(circle at 50% 22%, ${ambientPalette.topColor} 0%, transparent 56%), radial-gradient(circle at 50% 62%, ${ambientPalette.centerColor} 0%, transparent 60%), radial-gradient(circle at 84% 45%, ${ambientPalette.rightColor} 0%, transparent 56%)`,
        }}
      />

      {/* Crisp Tight Screen-Bezel Ambilight Aura */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -inset-1 rounded-2xl blur-md transition-opacity duration-500"
        style={{
          opacity: showDynamicGlow ? (playback.isPlaying ? 0.85 : 0.35) : 0,
          background: `linear-gradient(90deg, ${ambientPalette.leftColor} 0%, ${ambientPalette.centerColor} 50%, ${ambientPalette.rightColor} 100%)`,
        }}
      />

      {/* Stage Frame */}
      <div
        className={`relative rounded-2xl overflow-hidden border transition-shadow duration-300 ${frameSurfaceClass}`}
        style={{
          borderColor: showDynamicGlow ? 'rgba(253, 230, 138, 0.55)' : frameBorderDefault,
          boxShadow: showDynamicGlow
            ? `0 24px 70px rgba(0,0,0,0.92), 0 0 56px -6px ${ambientPalette.centerColor}`
            : '0 24px 60px rgba(0,0,0,0.85)',
        }}
      >
        {/* Theme-Specific Top Proscenium Header / Valance */}
        {theme === 'cinema' && (
          <div
            aria-hidden="true"
            className="h-5 sm:h-6 w-full curtain-valance border-b-2 border-[#D4AF37]/45 relative z-20 overflow-hidden"
          >
            <div
              className="absolute inset-0 bg-[#080305]/65 transition-opacity duration-500"
              style={{ opacity: showDynamicGlow ? 1 : 0 }}
            />
            <div
              className="absolute inset-0 transition-opacity duration-500"
              style={{
                opacity: showDynamicGlow ? 0.68 : 0,
                background: `linear-gradient(180deg, transparent 0%, ${ambientPalette.topColor} 100%)`,
                boxShadow: showDynamicGlow ? `inset 0 -2px 10px ${ambientPalette.topColor}` : 'none',
              }}
            />
          </div>
        )}

        {theme === 'vinyl' && (
          <div className="h-9 px-4 w-full bg-gradient-to-r from-[#2D180C] via-[#402312] to-[#2B170C] border-b border-[#D97706]/40 relative z-20 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-[11px] font-mono tracking-wider text-[#FDE68A]/90">
              <span
                className={`w-2 h-2 rounded-full transition-colors ${
                  isStagePlaying
                    ? 'bg-emerald-400 shadow-[0_0_8px_#34d399]'
                    : 'bg-amber-500/50'
                }`}
              />
              <span>MÁY ĐĨA THAN · 33⅓ RPM</span>
            </div>
            <span className="text-[10px] font-mono tracking-wider text-[#D97706]/90 uppercase">
              Chỉ nghe âm thanh
            </span>
          </div>
        )}

        {theme === 'edm' && (
          <div
            aria-hidden="true"
            className="h-8 px-4 w-full bg-[#070B16] border-b border-cyan-400/35 relative z-20 flex items-center justify-between overflow-hidden"
          >
            {/* Steel Truss Crossbars */}
            <div
              className="absolute inset-0 opacity-25"
              style={{
                backgroundImage:
                  'repeating-linear-gradient(60deg, transparent, transparent 14px, rgba(34,211,238,0.4) 14px, rgba(34,211,238,0.4) 16px)',
              }}
            />
            {/* Top Laser Emitters */}
            <div className="relative z-10 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_10px_#22d3ee]" />
              <span className="text-[10px] font-mono tracking-widest text-cyan-200 uppercase">
                EDM MAIN STAGE
              </span>
            </div>
            {/* Animated EQ Visualizer Bars */}
            <div className="relative z-10 flex items-end gap-1 h-4">
              {[0, 0.12, 0.25, 0.08, 0.3, 0.18, 0.05, 0.22].map((delay, i) => (
                <span
                  key={i}
                  className="w-1 h-full rounded-t-sm animate-edm-eq"
                  style={{
                    animationDelay: `${delay}s`,
                    animationPlayState: isStagePlaying ? 'running' : 'paused',
                    backgroundColor: showDynamicGlow
                      ? i % 3 === 0
                        ? ambientPalette.leftColor
                        : i % 3 === 1
                          ? ambientPalette.centerColor
                          : ambientPalette.rightColor
                      : i % 2 === 0
                        ? '#22D3EE'
                        : '#E879F9',
                  }}
                />
              ))}
            </div>
          </div>
        )}

        {theme === 'opera' && (
          <div
            aria-hidden="true"
            className="h-9 px-4 w-full bg-gradient-to-b from-[#2B190C] via-[#1E1008] to-[#130905] border-b-2 border-[#FDE68A]/55 relative z-20 flex items-center justify-center overflow-hidden"
          >
            <div
              className="absolute inset-0 transition-opacity duration-500"
              style={{
                opacity: showDynamicGlow ? 0.55 : 0.2,
                background: `radial-gradient(ellipse at 50% 0%, ${
                  showDynamicGlow ? ambientPalette.topColor : '#FDE68A'
                } 0%, transparent 72%)`,
              }}
            />
            <div className="relative z-10 flex items-center gap-3 text-[11px] tracking-[0.18em] uppercase text-[#FDE68A] font-semibold">
              <span className="w-8 h-[1px] bg-gradient-to-r from-transparent to-[#FDE68A]/80" />
              <Sparkles className="w-3.5 h-3.5 text-[#FDE68A]" />
              <span style={{ fontFamily: 'var(--font-display)' }}>SẢNH KHIÊU VŨ · FREE DANCE</span>
              <Sparkles className="w-3.5 h-3.5 text-[#FDE68A]" />
              <span className="w-8 h-[1px] bg-gradient-to-l from-transparent to-[#FDE68A]/80" />
            </div>
          </div>
        )}

        {/* Stage Body: Side Decor + Persistent YouTube Player Container */}
        <div
          className={`relative flex items-stretch ${
            theme === 'vinyl' ? 'bg-[#130A05]' : 'flex-row bg-[#050203]'
          }`}
        >
          {/* EDM Sweeping Laser Beams Overlay */}
          {theme === 'edm' && (
            <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-20 overflow-hidden">
              <div
                className="animate-edm-laser-left absolute -top-4 left-[14%] w-16 h-[130%] blur-md transition-opacity duration-300"
                style={{
                  opacity: isStagePlaying ? (showDynamicGlow ? 0.42 : 0.28) : 0,
                  background: `linear-gradient(180deg, ${
                    showDynamicGlow ? ambientPalette.leftColor : '#22D3EE'
                  } 0%, transparent 85%)`,
                }}
              />
              <div
                className="animate-edm-laser-right absolute -top-4 right-[14%] w-16 h-[130%] blur-md transition-opacity duration-300"
                style={{
                  opacity: isStagePlaying ? (showDynamicGlow ? 0.42 : 0.28) : 0,
                  background: `linear-gradient(180deg, ${
                    showDynamicGlow ? ambientPalette.rightColor : '#E879F9'
                  } 0%, transparent 85%)`,
                }}
              />
            </div>
          )}

          {/* LEFT WING PER THEME */}
          {theme === 'cinema' && (
            <div
              aria-hidden="true"
              className="hidden sm:block w-8 md:w-12 shrink-0 curtain-pleats-left z-10 border-r border-[#D4AF37]/20 relative overflow-hidden"
            >
              <div
                className="absolute inset-0 bg-[#080305]/70 transition-opacity duration-500"
                style={{ opacity: showDynamicGlow ? 1 : 0 }}
              />
              <div
                className="absolute inset-0 transition-opacity duration-500"
                style={{
                  opacity: showDynamicGlow ? 0.78 : 0,
                  background: `linear-gradient(90deg, transparent 0%, ${ambientPalette.leftColor} 96%)`,
                }}
              />
              <div
                className="absolute inset-y-0 right-0 w-[2px] transition-opacity duration-500"
                style={{
                  opacity: showDynamicGlow ? 0.85 : 0,
                  backgroundColor: ambientPalette.leftColor,
                  boxShadow: `0 0 14px 2px ${ambientPalette.leftColor}`,
                }}
              />
            </div>
          )}

          {theme === 'edm' && (
            <div
              aria-hidden="true"
              className="hidden sm:flex flex-col items-center justify-around py-3 px-2 w-14 md:w-20 shrink-0 bg-[#080C17] border-r border-cyan-400/25 z-10 relative overflow-hidden"
            >
              {[0, 1].map((idx) => (
                <div
                  key={idx}
                  className="animate-edm-thump w-10 h-10 md:w-12 md:h-12 rounded-full border-2 bg-[#0F172A] flex items-center justify-center shadow-inner"
                  style={{
                    animationPlayState: isStagePlaying ? 'running' : 'paused',
                    animationDelay: `${idx * 0.14}s`,
                    borderColor: showDynamicGlow ? ambientPalette.leftColor : '#22D3EE',
                    boxShadow: showDynamicGlow
                      ? `0 0 14px ${ambientPalette.leftColor}`
                      : '0 0 10px rgba(34,211,238,0.35)',
                  }}
                >
                  <div className="w-4 h-4 md:w-5 md:h-5 rounded-full bg-[#1E293B] border border-white/20" />
                </div>
              ))}
            </div>
          )}

          {theme === 'opera' && (
            <div
              aria-hidden="true"
              className="hidden sm:flex flex-col items-center justify-around py-4 w-10 md:w-14 shrink-0 z-10 border-r border-[#FDE68A]/35 relative overflow-hidden bg-gradient-to-b from-[#2A190C] via-[#1B0F07] to-[#2A190C]"
            >
              <div
                className="absolute inset-0 transition-opacity duration-500"
                style={{
                  opacity: showDynamicGlow ? 0.55 : 0.18,
                  background: `linear-gradient(90deg, transparent 0%, ${
                    showDynamicGlow ? ambientPalette.leftColor : '#FDE68A'
                  } 100%)`,
                }}
              />
              {[0, 1, 2].map((lamp) => (
                <span
                  key={lamp}
                  className="relative z-10 w-2.5 h-2.5 rounded-full bg-[#FDE68A] shadow-[0_0_12px_rgba(253,230,138,0.85)]"
                />
              ))}
              <div className="absolute inset-y-0 right-0 w-[2px] bg-gradient-to-b from-[#FDE68A]/70 via-[#B45309]/50 to-[#FDE68A]/70" />
            </div>
          )}

          {/* MAIN PERSISTENT 16:9 VIDEO SCREEN — NEVER UNMOUNTS ACROSS THEMES */}
          <div className="relative flex-1 min-w-[220px] aspect-video bg-black overflow-hidden">
            {/* Ambient Projection Screen Rim Glow */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 z-10"
              style={{
                boxShadow: showDynamicGlow
                  ? `inset 0 0 36px rgba(0,0,0,0.68), inset 24px 0 40px -18px ${ambientPalette.leftColor}, inset -24px 0 40px -18px ${ambientPalette.rightColor}, inset 0 18px 32px -18px ${ambientPalette.topColor}`
                  : 'inset 0 0 50px rgba(0,0,0,0.75)',
              }}
            />

            {/* Floating Heart Stream along Right Edge of Screen */}
            {hasJoinedCinema && currentItem && (
              <div
                aria-hidden="true"
                className="pointer-events-none absolute right-4 bottom-6 top-6 w-20 z-30 overflow-hidden"
              >
                {heartBursts.slice(-16).map((hb, idx) => (
                  <motion.div
                    key={hb.id}
                    initial={{ opacity: 0.95, y: 0, x: (idx % 5) * 8 - 16, scale: 0.75 }}
                    animate={{
                      opacity: 0,
                      y: -210,
                      x: ((idx % 5) - 2) * 14,
                      scale: 1.25,
                    }}
                    transition={{ duration: 1.5, ease: 'easeOut' }}
                    className="absolute bottom-2 right-2 flex items-center gap-1"
                  >
                    <Heart className="w-5 h-5 text-rose-400 fill-rose-500 drop-shadow-[0_2px_8px_rgba(244,63,94,0.7)]" />
                  </motion.div>
                ))}
              </div>
            )}

            {/* YouTube IFrame Mount — stays alive behind opaque turntable deck in vinyl mode */}
            <div
              ref={playerHostRef}
              className={`w-full h-full ${hasJoinedCinema && currentItem ? 'block' : 'hidden'}`}
            />

            {/* VINYL-ONLY FULL-STAGE TURNTABLE COVER (hides MV video completely, audio keeps playing) */}
            {theme === 'vinyl' && hasJoinedCinema && (
              <div className="absolute inset-0 z-20 bg-[radial-gradient(circle_at_50%_42%,#2E190B_0%,#150B05_68%,#0A0502_100%)] flex flex-col sm:flex-row items-center justify-center gap-5 sm:gap-10 px-6 py-5 overflow-hidden">
                {/* Warm Turntable Ambient Lamp Glow */}
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 transition-opacity duration-500"
                  style={{
                    opacity: showDynamicGlow ? 0.5 : 0.2,
                    background: `radial-gradient(circle at 38% 50%, ${
                      showDynamicGlow ? ambientPalette.centerColor : '#F59E0B'
                    } 0%, transparent 66%)`,
                  }}
                />

                {/* Walnut Turntable Plinth + 12-Inch Spinning Record + Tonearm */}
                <div className="relative z-10 p-3 sm:p-4 rounded-2xl border border-[#D97706]/35 bg-gradient-to-br from-[#2B170B] via-[#1C0F07] to-[#110804] shadow-[0_20px_50px_rgba(0,0,0,0.85)] flex items-center justify-center shrink-0">
                  {/* Metallic Corner Feet / Screws */}
                  <span className="absolute top-2 left-2 w-1.5 h-1.5 rounded-full bg-[#D97706]/50" />
                  <span className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full bg-[#D97706]/50" />
                  <span className="absolute bottom-2 left-2 w-1.5 h-1.5 rounded-full bg-[#D97706]/50" />
                  <span className="absolute bottom-2 right-2 w-1.5 h-1.5 rounded-full bg-[#D97706]/50" />

                  <div
                    className="animate-vinyl-spin relative w-36 h-36 sm:w-52 sm:h-52 md:w-60 md:h-60 rounded-full border-2 border-[#3F2E21] shadow-[0_14px_34px_rgba(0,0,0,0.9)] flex items-center justify-center"
                    style={{
                      animationPlayState: isStagePlaying ? 'running' : 'paused',
                      background:
                        'repeating-radial-gradient(circle at center, #09090b 0px, #09090b 2px, #1c1917 3px, #121113 5px)',
                    }}
                  >
                    {/* Subtle Specular Groove Sheen */}
                    <div
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-1 rounded-full opacity-30"
                      style={{
                        background:
                          'conic-gradient(from 35deg, transparent 0deg, rgba(255,255,255,0.45) 35deg, transparent 90deg, transparent 190deg, rgba(255,255,255,0.35) 225deg, transparent 270deg)',
                      }}
                    />

                    {/* Center Record Label */}
                    <div className="relative w-16 h-16 sm:w-24 sm:h-24 rounded-full border-2 border-[#D97706]/75 bg-[#2A1508] overflow-hidden flex items-center justify-center shadow-inner">
                      {currentItem?.thumbnailUrl && !vinylArtFailed ? (
                        <img
                          src={currentItem.thumbnailUrl}
                          alt={currentItem.title}
                          referrerPolicy="no-referrer"
                          onError={() => setVinylArtFailed(true)}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <Disc3 className="w-8 h-8 text-[#FDE68A]/80" />
                      )}
                      {/* Center Brass Spindle Hole */}
                      <div className="absolute w-3.5 h-3.5 rounded-full bg-[#120A05] border border-[#FDE68A]/85 shadow" />
                    </div>
                  </div>

                  {/* Pivoted Metallic Tonearm */}
                  <div
                    aria-hidden="true"
                    className={`pointer-events-none absolute top-2 right-2 w-20 h-28 origin-[82%_14%] transition-transform duration-700 ease-out ${
                      isStagePlaying ? 'rotate-[20deg]' : 'rotate-[-8deg]'
                    }`}
                  >
                    <div className="absolute top-1 right-1 w-6 h-6 rounded-full bg-gradient-to-br from-[#FDE68A] to-[#92400E] border border-black/60 shadow-md" />
                    <div className="absolute top-4 right-3.5 w-1.5 h-20 bg-gradient-to-b from-[#E7E5E4] via-[#A8A29E] to-[#78716C] rounded-full rotate-[14deg] origin-top shadow" />
                    <div className="absolute bottom-2 left-5 w-3.5 h-5 bg-[#27272A] border border-[#FDE68A]/50 rounded-sm rotate-[24deg] shadow" />
                  </div>
                </div>

                {/* Track Info & Analog Playback Readout */}
                <div className="relative z-10 text-center sm:text-left max-w-xs space-y-2">
                  <div className="text-[11px] font-mono uppercase tracking-widest text-[#D97706]">
                    {currentItem
                      ? isStagePlaying
                        ? 'Kim đang đọc rãnh đĩa'
                        : 'Đang tạm dừng'
                      : 'Chờ đặt đĩa lên mâm'}
                  </div>
                  <h2
                    style={{ fontFamily: 'var(--font-display)' }}
                    className="text-lg sm:text-2xl font-bold text-[#FDE68A] line-clamp-2"
                  >
                    {currentItem ? currentItem.title : 'Chưa có đĩa nhạc nào'}
                  </h2>
                  {currentItem && (
                    <p className="text-xs text-[#C7B8A6]">
                      {currentItem.authorName ? `${currentItem.authorName} · ` : ''}
                      Thêm bởi {currentItem.addedBy}
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Empty / Intermission Screen when joined but no video */}
            {hasJoinedCinema && !currentItem && (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6 bg-[radial-gradient(circle_at_center,#1F0D12_0%,#090406_75%)]">
                <Film className="w-10 h-10 text-[#D4AF37]/75 mb-3" />
                <h2
                  style={{ fontFamily: 'var(--font-display)' }}
                  className="text-xl sm:text-2xl font-semibold text-[#FDE68A]"
                >
                  Màn ảnh đang chờ phát nhạc
                </h2>
                <p className="text-sm text-[#B8A798] mt-1.5 max-w-md">
                  Dán một đường dẫn YouTube vào mục Danh sách chờ bên cạnh để bắt đầu chiếu cho cả rạp.
                </p>
              </div>
            )}

            {/* Mandatory Autoplay Unblock Gate Overlay */}
            {!hasJoinedCinema && (
              <div className="absolute inset-0 z-20 flex flex-col items-center justify-center text-center px-6 bg-[radial-gradient(circle_at_center,rgba(38,12,18,0.92)_0%,rgba(9,4,6,0.97)_80%)] backdrop-blur-sm">
                <div className="max-w-md space-y-4">
                  <div className="inline-flex items-center gap-2 text-xs font-medium text-[#D4AF37] tracking-wide">
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>TRÌNH DUYỆT YÊU CẦU TƯƠNG TÁC ĐỂ BẬT ÂM THANH</span>
                  </div>
                  <h2
                    style={{ fontFamily: 'var(--font-display)', textWrap: 'balance' }}
                    className="text-2xl sm:text-3xl font-bold text-[#FBF7F0]"
                  >
                    {currentItem ? `Đang chiếu: ${currentItem.title}` : gateSubtitle}
                  </h2>
                  <p className="text-sm text-[#C7B8A6] leading-relaxed">
                    Nhấn nút bên dưới để mở âm thanh và tự động đồng bộ đúng giây phát hiện tại của cả phòng.
                  </p>
                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={onJoinCinema}
                      className="px-7 py-3.5 rounded-xl bg-gradient-to-r from-[#991B1B] via-[#B91C1C] to-[#991B1B] hover:from-[#B91C1C] hover:to-[#DC2626] border border-[#D4AF37]/70 text-[#FBF7F0] font-semibold text-sm shadow-[0_0_28px_rgba(212,175,55,0.28)] cursor-pointer transition-all whitespace-nowrap shrink-0"
                    >
                      {gateButtonLabel}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* RIGHT WING PER THEME */}
          {theme === 'cinema' && (
            <div
              aria-hidden="true"
              className="hidden sm:block w-8 md:w-12 shrink-0 curtain-pleats-right z-10 border-l border-[#D4AF37]/20 relative overflow-hidden"
            >
              <div
                className="absolute inset-0 bg-[#080305]/70 transition-opacity duration-500"
                style={{ opacity: showDynamicGlow ? 1 : 0 }}
              />
              <div
                className="absolute inset-0 transition-opacity duration-500"
                style={{
                  opacity: showDynamicGlow ? 0.78 : 0,
                  background: `linear-gradient(270deg, transparent 0%, ${ambientPalette.rightColor} 96%)`,
                }}
              />
              <div
                className="absolute inset-y-0 left-0 w-[2px] transition-opacity duration-500"
                style={{
                  opacity: showDynamicGlow ? 0.85 : 0,
                  backgroundColor: ambientPalette.rightColor,
                  boxShadow: `0 0 14px 2px ${ambientPalette.rightColor}`,
                }}
              />
            </div>
          )}

          {theme === 'edm' && (
            <div
              aria-hidden="true"
              className="hidden sm:flex flex-col items-center justify-around py-3 px-2 w-14 md:w-20 shrink-0 bg-[#080C17] border-l border-cyan-400/25 z-10 relative overflow-hidden"
            >
              {[0, 1].map((idx) => (
                <div
                  key={idx}
                  className="animate-edm-thump w-10 h-10 md:w-12 md:h-12 rounded-full border-2 bg-[#0F172A] flex items-center justify-center shadow-inner"
                  style={{
                    animationPlayState: isStagePlaying ? 'running' : 'paused',
                    animationDelay: `${idx * 0.14 + 0.08}s`,
                    borderColor: showDynamicGlow ? ambientPalette.rightColor : '#E879F9',
                    boxShadow: showDynamicGlow
                      ? `0 0 14px ${ambientPalette.rightColor}`
                      : '0 0 10px rgba(232,121,249,0.35)',
                  }}
                >
                  <div className="w-4 h-4 md:w-5 md:h-5 rounded-full bg-[#1E293B] border border-white/20" />
                </div>
              ))}
            </div>
          )}

          {theme === 'opera' && (
            <div
              aria-hidden="true"
              className="hidden sm:flex flex-col items-center justify-around py-4 w-10 md:w-14 shrink-0 z-10 border-l border-[#FDE68A]/35 relative overflow-hidden bg-gradient-to-b from-[#2A190C] via-[#1B0F07] to-[#2A190C]"
            >
              <div
                className="absolute inset-0 transition-opacity duration-500"
                style={{
                  opacity: showDynamicGlow ? 0.55 : 0.18,
                  background: `linear-gradient(270deg, transparent 0%, ${
                    showDynamicGlow ? ambientPalette.rightColor : '#FDE68A'
                  } 100%)`,
                }}
              />
              {[0, 1, 2].map((lamp) => (
                <span
                  key={lamp}
                  className="relative z-10 w-2.5 h-2.5 rounded-full bg-[#FDE68A] shadow-[0_0_12px_rgba(253,230,138,0.85)]"
                />
              ))}
              <div className="absolute inset-y-0 left-0 w-[2px] bg-gradient-to-b from-[#FDE68A]/70 via-[#B45309]/50 to-[#FDE68A]/70" />
            </div>
          )}
        </div>

        {/* Synchronized Stage Control Strip */}
        <div className={`border-t px-4 py-3 flex flex-col gap-2.5 transition-colors duration-300 ${controlStripClass}`}>
          {/* Progress Scrubber */}
          <div className="flex items-center gap-3">
            <span className="text-xs font-mono tabular-nums text-[#C7B8A6] w-11 text-right shrink-0">
              {formatTimeSeconds(shownTime)}
            </span>
            <input
              type="range"
              aria-label="Thanh tua thời gian video"
              min={0}
              max={maxDuration}
              step={1}
              disabled={!hasJoinedCinema || !currentItem || !canControlPlayback}
              title={
                !canControlPlayback
                  ? 'Chủ phòng đã giới hạn quyền tua video'
                  : 'Kéo để tua thời gian phát cho cả rạp'
              }
              value={Math.min(shownTime, maxDuration)}
              onChange={(e) => {
                if (!canControlPlayback) return;
                setIsScrubbing(true);
                setScrubValue(Number(e.target.value));
              }}
              onMouseUp={(e) => handleSeekCommit(Number((e.target as HTMLInputElement).value))}
              onTouchEnd={(e) => handleSeekCommit(Number((e.target as HTMLInputElement).value))}
              className="flex-1 h-1.5 accent-[#D4AF37] bg-[#2D171E] rounded-lg cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            />
            <span className="text-xs font-mono tabular-nums text-[#8E7D70] w-11 shrink-0">
              {duration > 0 ? formatTimeSeconds(duration) : '--:--'}
            </span>
          </div>

          {/* Buttons + Track Info */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <button
                type="button"
                onClick={handleTogglePlay}
                disabled={!hasJoinedCinema || !currentItem || !canControlPlayback}
                title={
                  !canControlPlayback
                    ? 'Chủ phòng đã giới hạn quyền phát/tạm dừng của bạn'
                    : playback.isPlaying
                      ? 'Tạm dừng'
                      : 'Phát tiếp'
                }
                aria-label={playback.isPlaying ? 'Tạm dừng' : 'Phát tiếp'}
                className="h-9 px-3.5 rounded-lg bg-[#231016] hover:bg-[#341620] border border-[#D4AF37]/30 text-[#FDE68A] text-xs font-medium flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors whitespace-nowrap shrink-0"
              >
                {!canControlPlayback ? (
                  <>
                    <Lock className="w-3.5 h-3.5 text-[#A89888]" />
                    <span>{playback.isPlaying ? 'Đang phát' : 'Tạm dừng'}</span>
                  </>
                ) : playback.isPlaying ? (
                  <>
                    <Pause className="w-3.5 h-3.5" />
                    <span>Tạm dừng</span>
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5" />
                    <span>Phát</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={onNextTrack}
                disabled={!hasJoinedCinema || !canAddQueue || (!currentItem && queueLength === 0)}
                title={
                  !canAddQueue
                    ? 'Chủ phòng đã giới hạn quyền chuyển bài của bạn'
                    : 'Chuyển bài tiếp theo'
                }
                aria-label="Chuyển bài tiếp theo"
                className="h-9 px-3 rounded-lg bg-[#1A0C10] hover:bg-[#2A131A] border border-[#D4AF37]/20 text-[#E5D9C8] text-xs font-medium flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors whitespace-nowrap shrink-0"
              >
                <SkipForward className="w-3.5 h-3.5 text-[#D4AF37]" />
                <span className="hidden sm:inline">Bài tiếp</span>
              </button>

              <div className="min-w-0 pl-2 flex items-center gap-2.5">
                {currentItem ? (
                  <>
                    <div className="truncate text-xs text-[#F5EFE6] font-medium">
                      {currentItem.title}
                      <span className="text-[#8E7D70] font-normal"> · Thêm bởi {currentItem.addedBy}</span>
                    </div>
                    {trackHearts > 0 && (
                      <span className="inline-flex items-center gap-1 text-xs font-mono tabular-nums text-rose-300 shrink-0">
                        <Heart className="w-3 h-3 fill-rose-500 text-rose-400" />
                        {trackHearts}
                      </span>
                    )}
                  </>
                ) : (
                  <div className="text-xs text-[#8E7D70] truncate">
                    Chưa có bài nào đang chiếu
                  </div>
                )}
              </div>
            </div>

            {/* Volume Control (local) */}
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleToggleMute}
                aria-label={isMuted ? 'Bật tiếng' : 'Tắt tiếng'}
                className="p-2 rounded-lg text-[#C7B8A6] hover:text-[#FDE68A] hover:bg-[#231016] transition-colors cursor-pointer"
              >
                {isMuted || volume === 0 ? (
                  <VolumeX className="w-4 h-4" />
                ) : (
                  <Volume2 className="w-4 h-4" />
                )}
              </button>
              <input
                type="range"
                aria-label="Âm lượng"
                min={0}
                max={100}
                value={isMuted ? 0 : volume}
                onChange={(e) => handleVolumeChange(Number(e.target.value))}
                className="w-20 h-1.5 accent-[#D4AF37] bg-[#2D171E] rounded-lg cursor-pointer"
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
