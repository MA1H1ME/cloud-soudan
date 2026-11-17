// 効果音。音源ファイルは使わず、Web Audio で短い電子音を鳴らす（ファミコン風の矩形波）。
// 設定で消せる。ブラウザが音を止めているとき（タップ前など）は何もしない。
type Note = [freq: number, start: number, dur: number];

let ctx: AudioContext | null = null;
let enabled = true;

export function setSoundEnabled(on: boolean) {
  enabled = on;
}

function play(notes: Note[], type: OscillatorType = 'square', volume = 0.05) {
  if (!enabled || typeof window === 'undefined') return;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    const t0 = ctx.currentTime;
    for (const [freq, start, dur] of notes) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(volume, t0 + start);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + start + dur);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t0 + start);
      osc.stop(t0 + start + dur + 0.02);
    }
  } catch {
    // 音が鳴らせない環境では黙って続ける
  }
}

export const sfx = {
  mail: () => play([[1318, 0, 0.08], [1760, 0.09, 0.12]]),
  coin: () => play([[988, 0, 0.07], [1319, 0.07, 0.18]]),
  alarm: () => play([[880, 0, 0.12], [660, 0.14, 0.12], [880, 0.28, 0.12], [660, 0.42, 0.12]], 'square', 0.04),
  good: () => play([[784, 0, 0.08], [988, 0.08, 0.08], [1319, 0.16, 0.2]]),
  bad: () => play([[392, 0, 0.15], [311, 0.16, 0.25]], 'triangle', 0.08),
  stamp: () => play([[140, 0, 0.12]], 'triangle', 0.2),
  fanfare: () => play([[523, 0, 0.1], [659, 0.1, 0.1], [784, 0.2, 0.1], [1047, 0.3, 0.35]]),
  click: () => play([[1200, 0, 0.03]], 'square', 0.02),
};

// ---- BGM：短い繰り返しの曲を、Web Audio の矩形波と三角波で鳴らす。音源ファイルは使わない ----
// 通常は明るい曲、障害の対応中は速くて短調の曲に切り替える。ブラウザが音を止めているとき（タップ前）は、タップ後に鳴り出す。
type Song = { bpm: number; base: number; melody: (number | null)[]; bass: number[]; melodyVol: number };
const HZ = (base: number, semis: number) => base * 2 ** (semis / 12);

const SONGS: Record<'calm' | 'alert', Song> = {
  // ハ長調。16ステップ（8分音符）を4小節ぶん、低音は小節ごとに C・A・F・G
  calm: {
    bpm: 96, base: 261.63, melodyVol: 0.018,
    melody: [0, 4, 7, 4, 9, 7, 4, 7, 5, 9, 12, 9, 7, 4, 2, 4, 0, null, 4, 7, 12, 9, 7, null, 5, 7, 9, 12, 14, 12, 9, 7],
    bass: [-24, -27, -31, -29],
  },
  // イ短調。速めで落ち着かない
  alert: {
    bpm: 140, base: 440, melodyVol: 0.02,
    melody: [0, 3, 7, 3, 12, 10, 7, 3, 0, 3, 7, 10, 12, 10, 7, 3, 0, 0, 3, 3, 7, 7, 10, 10, 12, 10, 7, 3, 7, 3, 0, null],
    bass: [-24, -24, -28, -29],
  },
};

let bgmMode: 'off' | 'calm' | 'alert' = 'off';
let bgmEnabled = true;
let bgmTimer: ReturnType<typeof setInterval> | null = null;
let bgmStep = 0;
let bgmNext = 0;
let unlockBound = false;

function bgmTone(c: AudioContext, freq: number, at: number, dur: number, type: OscillatorType, vol: number) {
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(vol, at);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  osc.connect(gain).connect(c.destination);
  osc.start(at);
  osc.stop(at + dur + 0.02);
}

function bgmTick() {
  if (!ctx || bgmMode === 'off' || !bgmEnabled) return;
  const song = SONGS[bgmMode];
  const stepDur = 60 / song.bpm / 2;
  if (ctx.state !== 'running') return;
  if (bgmNext < ctx.currentTime) bgmNext = ctx.currentTime + 0.05;
  while (bgmNext < ctx.currentTime + 0.25) {
    const i = bgmStep % song.melody.length;
    const m = song.melody[i];
    if (m !== null && m !== undefined) bgmTone(ctx, HZ(song.base, m), bgmNext, stepDur * 0.9, 'square', song.melodyVol);
    if (i % 4 === 0) bgmTone(ctx, HZ(song.base, song.bass[(i / 4) % song.bass.length]!), bgmNext, stepDur * 3.6, 'triangle', 0.04);
    bgmNext += stepDur;
    bgmStep++;
  }
}

function bgmUnlock() {
  if (unlockBound || typeof window === 'undefined') return;
  unlockBound = true;
  const resume = () => {
    try { ctx ??= new AudioContext(); if (ctx.state === 'suspended') void ctx.resume(); } catch { /* 鳴らせない環境では何もしない */ }
  };
  window.addEventListener('pointerdown', resume, { passive: true });
  window.addEventListener('keydown', resume);
}

export const bgm = {
  /** 曲を切り替える。'off' で止める。設定がオフのときは鳴らさない */
  set(mode: 'off' | 'calm' | 'alert') {
    if (mode !== bgmMode) { bgmStep = 0; bgmNext = 0; }
    bgmMode = mode;
    if (typeof window === 'undefined') return;
    if (mode === 'off' || !bgmEnabled) {
      if (bgmTimer) { clearInterval(bgmTimer); bgmTimer = null; }
      return;
    }
    bgmUnlock();
    try { ctx ??= new AudioContext(); } catch { return; }
    if (!bgmTimer) bgmTimer = setInterval(bgmTick, 60);
  },
  setEnabled(on: boolean) {
    bgmEnabled = on;
    this.set(on ? (bgmMode === 'off' ? 'calm' : bgmMode) : 'off');
    if (!on) bgmMode = 'off';
  },
};
