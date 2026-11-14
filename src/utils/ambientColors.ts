import type { AmbientPalette } from '../types';

export interface RgbTuple {
  r: number;
  g: number;
  b: number;
}

export interface AmbientKeyframe {
  left: RgbTuple;
  center: RgbTuple;
  right: RgbTuple;
  top: RgbTuple;
}

export interface AmbientTimeline {
  mode: 'storyboard' | 'thumbnails';
  intervalMs: number;
  frames: AmbientKeyframe[];
}

export const NEUTRAL_AMBIENT_PALETTE: AmbientPalette = {
  leftColor: 'rgb(28, 12, 16)',
  centerColor: 'rgb(34, 15, 20)',
  rightColor: 'rgb(28, 12, 16)',
  topColor: 'rgb(34, 15, 20)',
};

const NEUTRAL_SILVER_KEYFRAME: AmbientKeyframe = {
  left: { r: 120, g: 120, b: 124 },
  center: { r: 150, g: 150, b: 154 },
  right: { r: 120, g: 120, b: 124 },
  top: { r: 135, g: 135, b: 140 },
};

function clamp(val: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, val));
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case rn:
        h = (gn - bn) / d + (gn < bn ? 6 : 0);
        break;
      case gn:
        h = (bn - rn) / d + 2;
        break;
      case bn:
        h = (rn - gn) / d + 4;
        break;
    }
    h /= 6;
  }

  return [h, s, l];
}

function hslToRgb(h: number, s: number, l: number): RgbTuple {
  if (s <= 0.001) {
    const val = Math.round(clamp(l, 0, 1) * 255);
    return { r: val, g: val, b: val };
  }

  const hue2rgb = (p: number, q: number, t: number): number => {
    let tt = t;
    if (tt < 0) tt += 1;
    if (tt > 1) tt -= 1;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  };

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;

  return {
    r: Math.round(clamp(hue2rgb(p, q, h + 1 / 3), 0, 1) * 255),
    g: Math.round(clamp(hue2rgb(p, q, h), 0, 1) * 255),
    b: Math.round(clamp(hue2rgb(p, q, h - 1 / 3), 0, 1) * 255),
  };
}

function tuneCinemaRgb(r: number, g: number, b: number): RgbTuple {
  const [h, s, l] = rgbToHsl(r, g, b);

  // Preserve true achromatic / grayscale / black-and-white scenes (no fake orange tint)
  if (s <= 0.08) {
    const tunedS = s * 0.45;
    const tunedL = clamp(l * 0.96, 0.14, 0.8);
    return hslToRgb(h, tunedS, tunedL);
  }

  // Preserve exact video hue, gently lift saturation without clipping dark scenes
  const tunedS = Math.min(0.92, s * 1.16 + 0.03);
  const tunedL = clamp(l * 1.04, 0.16, 0.74);
  return hslToRgb(h, tunedS, tunedL);
}

function sampleImageDataRegion(
  data: Uint8ClampedArray,
  width: number,
  height: number
): AmbientKeyframe {
  const acc = {
    left: { r: 0, g: 0, b: 0, w: 0, litW: 0 },
    center: { r: 0, g: 0, b: 0, w: 0, litW: 0 },
    right: { r: 0, g: 0, b: 0, w: 0, litW: 0 },
    top: { r: 0, g: 0, b: 0, w: 0, litW: 0 },
    all: { r: 0, g: 0, b: 0, w: 0 },
  };

  const leftEdge = Math.floor(width * 0.3);
  const rightEdge = Math.ceil(width * 0.7);
  const topEdge = Math.ceil(height * 0.38);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = (y * width + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];

      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const chroma = max - min;
      const luma = (r * 0.299 + g * 0.587 + b * 0.114) / 255;

      // Ignore near-black letterbox/pillarbox margins while preserving genuinely dark scenes
      const isNearBlack = max < 14;
      const weight = isNearBlack ? 0.008 : 0.55 + luma * 0.85 + (chroma / 255) * 0.65;

      const bucket = x < leftEdge ? acc.left : x < rightEdge ? acc.center : acc.right;
      bucket.r += r * weight;
      bucket.g += g * weight;
      bucket.b += b * weight;
      bucket.w += weight;
      if (!isNearBlack) bucket.litW += weight;

      if (y < topEdge) {
        acc.top.r += r * weight;
        acc.top.g += g * weight;
        acc.top.b += b * weight;
        acc.top.w += weight;
        if (!isNearBlack) acc.top.litW += weight;
      }

      acc.all.r += r * weight;
      acc.all.g += g * weight;
      acc.all.b += b * weight;
      acc.all.w += weight;
    }
  }

  const wholeFrameFallback =
    acc.all.w > 0
      ? tuneCinemaRgb(acc.all.r / acc.all.w, acc.all.g / acc.all.w, acc.all.b / acc.all.w)
      : NEUTRAL_SILVER_KEYFRAME.center;

  const resolveZone = (z: { r: number; g: number; b: number; w: number; litW: number }) => {
    if (z.w <= 0) return wholeFrameFallback;
    // If a zone is almost purely black pillarbox, fall back gracefully to whole-frame tone
    if (z.litW <= 0.05 && acc.all.w > 0) return wholeFrameFallback;
    return tuneCinemaRgb(z.r / z.w, z.g / z.w, z.b / z.w);
  };

  return {
    left: resolveZone(acc.left),
    center: resolveZone(acc.center),
    right: resolveZone(acc.right),
    top: resolveZone(acc.top),
  };
}

function loadImage(src: string, timeoutMs = 4500): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    const timer = window.setTimeout(() => resolve(null), timeoutMs);

    img.onload = () => {
      window.clearTimeout(timer);
      resolve(img);
    };
    img.onerror = () => {
      window.clearTimeout(timer);
      resolve(null);
    };
    img.src = src;
  });
}

interface StoryboardMetaResponse {
  available: boolean;
  frameWidth?: number;
  frameHeight?: number;
  frameCount?: number;
  cols?: number;
  rows?: number;
  intervalMs?: number;
  sheetCount?: number;
}

async function extractFromStoryboard(videoId: string): Promise<AmbientTimeline | null> {
  try {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 4000);
    const resp = await fetch(`/api/storyboard?videoId=${encodeURIComponent(videoId)}`, {
      signal: controller.signal,
    });
    window.clearTimeout(timer);
    if (!resp.ok) return null;

    const meta = (await resp.json()) as StoryboardMetaResponse;
    if (
      !meta.available ||
      !meta.frameWidth ||
      !meta.frameHeight ||
      !meta.frameCount ||
      !meta.cols ||
      !meta.rows ||
      !meta.sheetCount
    ) {
      return null;
    }

    const sheetIndices = Array.from({ length: meta.sheetCount }, (_, idx) => idx);
    const sheets = await Promise.all(
      sheetIndices.map((idx) =>
        loadImage(`/api/storyboard-sheet?videoId=${encodeURIComponent(videoId)}&sheet=${idx}`, 5000)
      )
    );

    if (!sheets[0]) return null;

    const sampleW = 32;
    const sampleH = 18;
    const canvas = document.createElement('canvas');
    canvas.width = sampleW;
    canvas.height = sampleH;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;

    const perSheet = meta.cols * meta.rows;
    const frames: AmbientKeyframe[] = [];

    for (let i = 0; i < meta.frameCount; i += 1) {
      const sheetIdx = Math.floor(i / perSheet);
      const sheetImg = sheets[sheetIdx];
      if (!sheetImg) break;

      const localIdx = i % perSheet;
      const row = Math.floor(localIdx / meta.cols);
      const col = localIdx % meta.cols;

      const sx = col * meta.frameWidth + 1;
      const sy = row * meta.frameHeight + 1;
      const sw = Math.max(1, meta.frameWidth - 2);
      const sh = Math.max(1, meta.frameHeight - 2);

      // Stop if cell falls outside actual loaded sprite image bounds
      if (sx + sw > sheetImg.naturalWidth || sy + sh > sheetImg.naturalHeight) {
        break;
      }

      ctx.clearRect(0, 0, sampleW, sampleH);
      ctx.drawImage(sheetImg, sx, sy, sw, sh, 0, 0, sampleW, sampleH);
      const { data } = ctx.getImageData(0, 0, sampleW, sampleH);
      frames.push(sampleImageDataRegion(data, sampleW, sampleH));
    }

    if (frames.length === 0) return null;

    return {
      mode: 'storyboard',
      intervalMs: meta.intervalMs ?? 2000,
      frames,
    };
  } catch {
    return null;
  }
}

async function sampleThumbnailFrame(
  videoId: string,
  frameIndex: number
): Promise<AmbientKeyframe | null> {
  const img = await loadImage(
    `/api/thumbnail?videoId=${encodeURIComponent(videoId)}&frame=${frameIndex}`,
    4000
  );
  if (!img || img.naturalWidth === 0 || img.naturalHeight === 0) return null;

  try {
    const sampleW = 48;
    const sampleH = 27;
    const canvas = document.createElement('canvas');
    canvas.width = sampleW;
    canvas.height = sampleH;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;

    // 4:3 YouTube thumbnails (480x360) contain 12.5% top/bottom black letterbox bars
    const isFourByThree = img.naturalWidth / img.naturalHeight < 1.5;
    const sx = Math.round(img.naturalWidth * 0.02);
    const sw = Math.max(1, Math.round(img.naturalWidth * 0.96));
    const sy = isFourByThree ? Math.round(img.naturalHeight * 0.13) : 0;
    const sh = isFourByThree
      ? Math.max(1, Math.round(img.naturalHeight * 0.74))
      : img.naturalHeight;

    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sampleW, sampleH);
    const { data } = ctx.getImageData(0, 0, sampleW, sampleH);
    return sampleImageDataRegion(data, sampleW, sampleH);
  } catch {
    return null;
  }
}

export async function extractVideoAmbientTimeline(videoId: string): Promise<AmbientTimeline> {
  if (!videoId || typeof document === 'undefined') {
    return { mode: 'thumbnails', intervalMs: 0, frames: [NEUTRAL_SILVER_KEYFRAME] };
  }

  // Prefer true timestamped YouTube storyboard sprite frames whenever available
  const storyboard = await extractFromStoryboard(videoId);
  if (storyboard && storyboard.frames.length > 0) {
    return storyboard;
  }

  // Fallback: YouTube's 4 real snapshots (0=cover/start, 1=25%, 2=50%, 3=75%)
  const thumbResults = await Promise.all([
    sampleThumbnailFrame(videoId, 0),
    sampleThumbnailFrame(videoId, 1),
    sampleThumbnailFrame(videoId, 2),
    sampleThumbnailFrame(videoId, 3),
  ]);

  const validFrames = thumbResults.filter((f): f is AmbientKeyframe => f !== null);
  return {
    mode: 'thumbnails',
    intervalMs: 0,
    frames: validFrames.length > 0 ? validFrames : [NEUTRAL_SILVER_KEYFRAME],
  };
}

function lerpChannel(a: number, b: number, t: number): number {
  return Math.round(a + (b - a) * t);
}

function lerpRgb(a: RgbTuple, b: RgbTuple, t: number): RgbTuple {
  return {
    r: lerpChannel(a.r, b.r, t),
    g: lerpChannel(a.g, b.g, t),
    b: lerpChannel(a.b, b.b, t),
  };
}

function toCss(c: RgbTuple): string {
  return `rgb(${c.r}, ${c.g}, ${c.b})`;
}

export function computeLiveAmbientPalette(
  timeline: AmbientTimeline | null,
  currentTimeSec: number,
  durationSec: number,
  isPlaying: boolean
): AmbientPalette {
  if (!timeline || timeline.frames.length === 0) {
    return NEUTRAL_AMBIENT_PALETTE;
  }

  const frames = timeline.frames;
  let idxA = 0;
  let idxB = 0;
  let rawT = 0;

  if (frames.length > 1) {
    if (timeline.mode === 'storyboard') {
      const pos =
        timeline.intervalMs > 0
          ? Math.max(0, (currentTimeSec * 1000) / timeline.intervalMs)
          : (durationSec > 0 ? clamp(currentTimeSec / durationSec, 0, 1) : 0) *
            (frames.length - 1);
      idxA = clamp(Math.floor(pos), 0, frames.length - 1);
      idxB = clamp(idxA + 1, 0, frames.length - 1);
      rawT = clamp(pos - Math.floor(pos), 0, 1);
    } else {
      // Map video progress faithfully to [hqdefault (0%), hq1 (25%), hq2 (50%), hq3 (75%+)]
      const safeDuration = durationSec > 0 ? durationSec : 180;
      const progress = clamp(currentTimeSec / safeDuration, 0, 1);
      const scaled = (progress / 0.85) * (frames.length - 1);
      const clampedScaled = clamp(scaled, 0, frames.length - 1);
      idxA = clamp(Math.floor(clampedScaled), 0, frames.length - 1);
      idxB = clamp(idxA + 1, 0, frames.length - 1);
      rawT = clamp(clampedScaled - Math.floor(clampedScaled), 0, 1);
    }
  }

  // Smooth ease-in-out curve between adjacent keyframes
  const blend = rawT * rawT * (3 - 2 * rawT);

  const frameA = frames[idxA];
  const frameB = frames[idxB];

  // Dim subtly when paused rather than adding fake flicker
  const brightness = isPlaying ? 1 : 0.72;
  const scaleBrightness = (c: RgbTuple): RgbTuple => ({
    r: Math.min(255, Math.round(c.r * brightness)),
    g: Math.min(255, Math.round(c.g * brightness)),
    b: Math.min(255, Math.round(c.b * brightness)),
  });

  const leftBase = lerpRgb(frameA.left, frameB.left, blend);
  const centerBase = lerpRgb(frameA.center, frameB.center, blend);
  const rightBase = lerpRgb(frameA.right, frameB.right, blend);
  const topBase = lerpRgb(frameA.top, frameB.top, blend);

  return {
    leftColor: toCss(scaleBrightness(leftBase)),
    centerColor: toCss(scaleBrightness(centerBase)),
    rightColor: toCss(scaleBrightness(rightBase)),
    topColor: toCss(scaleBrightness(topBase)),
  };
}
