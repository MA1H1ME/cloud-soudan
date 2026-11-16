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
