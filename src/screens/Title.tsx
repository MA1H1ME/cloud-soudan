// タイトル画面：夜の街と自社ビル。
import { go } from '../router';
import { useSave } from '../store';
import { MONO, PX } from '../components/pixel';

const STARS = [[14, 18], [64, 48], [124, 12], [174, 38], [244, 24], [40, 148], [220, 164], [94, 178], [256, 108], [10, 98]];
const BUILDINGS = [[0, 308, 40, 140], [44, 268, 36, 180], [180, 278, 40, 170], [224, 318, 44, 130]];

export function Title() {
  const company = useSave((s) => s.company);
  const start = () => {
    if (company && !confirm('セーブデータを消して、はじめからやり直しますか？')) return;
    go({ name: 'opening' });
  };
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col" style={{ background: PX.night }}>
      <div className="relative flex-1">
        <svg viewBox="0 0 268 448" className="pixel absolute inset-0 h-full w-full" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
          <rect width="268" height="448" fill={PX.night} />
          <rect y="228" width="268" height="220" fill={PX.night2} />
          {STARS.map(([x, y]) => <rect key={`${x}-${y}`} x={x} y={y} width="3" height="3" fill="#fff6c2" className={(x! + y!) % 3 ? '' : 'blink'} />)}
          {BUILDINGS.map(([x, y, w, h]) => (
            <g key={x}>
              <rect x={x} y={y} width={w} height={h} fill={PX.bld} />
              {Array.from({ length: Math.floor(h! / 18) }, (_, r) => [0, 1].map((c) => (
                <rect key={`${r}-${c}`} x={x! + 8 + c * 14} y={y! + 8 + r * 18} width="8" height="8" fill={(r + c + x!) % 3 ? PX.winOff : PX.y} />
              )))}
            </g>
          ))}
          <rect x="92" y="228" width="84" height="220" fill={PX.bld2} />
          {Array.from({ length: 11 }, (_, r) => [0, 1, 2].map((c) => <rect key={`m${r}-${c}`} x={104 + c * 22} y={282 + r * 16} width="12" height="9" fill={PX.y} />))}
          <rect x="112" y="240" width="44" height="26" fill={PX.cloud} />
          <rect x="106" y="248" width="56" height="18" fill={PX.cloud} />
        </svg>
        <div className="relative z-10 flex h-full flex-col items-center px-6 pt-20 text-center">
          <h1 className="text-4xl font-bold tracking-wide text-white">クラウド相談室</h1>
          <p className="mt-3 text-sm text-yellow-300" style={{ fontFamily: MONO }}>〜 新人SEの運用日誌 〜</p>
        </div>
      </div>
      <div className="relative z-10 space-y-3 px-10 pb-6 pt-4" style={{ background: '#16213b' }}>
        <button type="button" onClick={start} className="w-full border-2 border-white py-3 font-bold text-white active:bg-white/10" style={{ background: PX.box }}>
          ▶ はじめから
        </button>
        <button
          type="button" disabled={!company} onClick={() => go({ name: 'floor' })}
          className="w-full border border-white py-3 text-white active:bg-white/10 disabled:border-slate-500 disabled:text-slate-500"
          style={{ background: PX.box }}
        >
          つづきから{company && <span className="ml-2 text-xs text-yellow-300">（{company.name}）</span>}
        </button>
        <button type="button" onClick={() => go({ name: 'transfer' })} className="w-full py-1 text-xs text-yellow-100 underline">セーブの引き継ぎ</button>
        <p className="pt-1 text-center text-[11px] text-yellow-100/80">AWS SAA-C03 学習用・非公式</p>
      </div>
    </div>
  );
}
