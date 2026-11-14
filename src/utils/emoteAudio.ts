import type { EmoteType } from '../types';

let sharedAudioCtx: AudioContext | null = null;
let heartComboStep = 0;

const HEART_PENTATONIC_HZ = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5];

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return null;
  if (!sharedAudioCtx) {
    sharedAudioCtx = new Ctx();
  }
  if (sharedAudioCtx.state === 'suspended') {
    sharedAudioCtx.resume().catch(() => {});
  }
  return sharedAudioCtx;
}

export function unlockEmoteAudio(): void {
  getAudioContext();
}

export function playEmoteSound(emote: EmoteType): void {
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;

  if (emote === 'dance') {
    // Punchy upbeat 3-note dance synth arpeggio + sub bounce
    const notes = [329.63, 440, 554.37];
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      const t0 = now + idx * 0.085;
      osc.frequency.setValueAtTime(freq, t0);
      osc.frequency.exponentialRampToValueAtTime(freq * 1.06, t0 + 0.09);

      gain.gain.setValueAtTime(0.001, t0);
      gain.gain.linearRampToValueAtTime(0.3, t0 + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.16);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + 0.17);
    });

    // Warm bass thump
    const bass = ctx.createOscillator();
    const bassGain = ctx.createGain();
    bass.type = 'sine';
    bass.frequency.setValueAtTime(130, now);
    bass.frequency.exponentialRampToValueAtTime(65, now + 0.18);
    bassGain.gain.setValueAtTime(0.32, now);
    bassGain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
    bass.connect(bassGain);
    bassGain.connect(ctx.destination);
    bass.start(now);
    bass.stop(now + 0.21);
    return;
  }

  if (emote === 'clap') {
    // Crisp 4-burst audience applause with palm body + high transient
    [0, 0.085, 0.17, 0.265].forEach((offset, idx) => {
      const dur = idx === 3 ? 0.11 : 0.075;
      const bufferSize = Math.floor(ctx.sampleRate * dur);
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i += 1) {
        data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.28));
      }

      const noise = ctx.createBufferSource();
      noise.buffer = buffer;

      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(idx % 2 === 0 ? 1350 : 1850, now + offset);
      filter.Q.setValueAtTime(0.95, now + offset);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.42, now + offset);
      gain.gain.exponentialRampToValueAtTime(0.001, now + offset + dur);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      noise.start(now + offset);

      // Subtle low palm pop
      const pop = ctx.createOscillator();
      const popGain = ctx.createGain();
      pop.type = 'sine';
      pop.frequency.setValueAtTime(210, now + offset);
      pop.frequency.exponentialRampToValueAtTime(95, now + offset + 0.045);
      popGain.gain.setValueAtTime(0.22, now + offset);
      popGain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.05);
      pop.connect(popGain);
      popGain.connect(ctx.destination);
      pop.start(now + offset);
      pop.stop(now + offset + 0.055);
    });
    return;
  }

  if (emote === 'whistle') {
    // Expressive cheerful whistle with slight vibrato & bright harmonic
    const osc = ctx.createOscillator();
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(1250, now);
    osc.frequency.exponentialRampToValueAtTime(2150, now + 0.13);
    osc.frequency.exponentialRampToValueAtTime(1780, now + 0.34);

    lfo.frequency.setValueAtTime(16, now);
    lfoGain.gain.setValueAtTime(35, now);
    lfo.connect(lfoGain);
    lfoGain.connect(osc.frequency);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.26, now + 0.035);
    gain.gain.setValueAtTime(0.24, now + 0.22);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.38);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    lfo.start(now);
    osc.stop(now + 0.39);
    lfo.stop(now + 0.39);
    return;
  }

  if (emote === 'boo') {
    // Full playful comedic low horn chord downward slide
    const freqs = [196, 189, 98];
    freqs.forEach((f, idx) => {
      const osc = ctx.createOscillator();
      const filter = ctx.createBiquadFilter();
      const gain = ctx.createGain();

      osc.type = idx === 2 ? 'triangle' : 'sawtooth';
      osc.frequency.setValueAtTime(f, now);
      osc.frequency.linearRampToValueAtTime(f * 0.72, now + 0.36);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(680, now);

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(idx === 2 ? 0.24 : 0.16, now + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.42);
    });
  }
}

export function playHeartPopSound(): void {
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const freq = HEART_PENTATONIC_HZ[heartComboStep % HEART_PENTATONIC_HZ.length];
  heartComboStep += 1;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(freq, now);
  osc.frequency.exponentialRampToValueAtTime(freq * 1.18, now + 0.07);

  gain.gain.setValueAtTime(0.001, now);
  gain.gain.linearRampToValueAtTime(0.22, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.13);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.14);
}
