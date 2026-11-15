// 5軸のレーダーチャート。自分の提案を塗り、最適案を点線で重ねる。仕様書「7. レーダーチャート」
import { PILLARS, PILLAR_LABELS, type Pillar, type PillarScores } from '../content/schema';

const SIZE = 280;
const C = SIZE / 2;
const R = 92;

function point(i: number, value: number): [number, number] {
  const angle = -Math.PI / 2 + (i * 2 * Math.PI) / PILLARS.length;
  const r = (value / 5) * R;
  return [C + r * Math.cos(angle), C + r * Math.sin(angle)];
}

const polygon = (scores: PillarScores) => PILLARS.map((p, i) => point(i, scores[p]).join(',')).join(' ');

export function Radar({ mine, best, emphasis }: { mine: PillarScores; best: PillarScores; emphasis: Pillar }) {
  return (
    <figure className="flex flex-col items-center">
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="w-full max-w-72" role="img" aria-label="評価のレーダーチャート">
        {[5, 2.5].map((v) => (
          <polygon key={v} points={PILLARS.map((_, i) => point(i, v).join(',')).join(' ')} className="fill-none stroke-slate-300" />
        ))}
        {PILLARS.map((_, i) => {
          const [x, y] = point(i, 5);
          return <line key={i} x1={C} y1={C} x2={x} y2={y} className="stroke-slate-200" />;
        })}
        <polygon points={polygon(mine)} className="fill-blue-500/20 stroke-blue-600" strokeWidth={2} />
        <polygon points={polygon(best)} className="fill-none stroke-slate-800" strokeWidth={1.25} strokeDasharray="4 3" />
        {PILLARS.map((p, i) => {
          const [x, y] = point(i, 6.3);
          const strong = p === emphasis;
          return (
            <text key={p} x={x} y={y + 4} textAnchor="middle" className={strong ? 'fill-slate-900 text-[12px] font-bold' : 'fill-slate-500 text-[11px]'}>
              {strong ? '★' : ''}
              {PILLAR_LABELS[p]}
            </text>
          );
        })}
      </svg>
      <figcaption className="flex gap-4 text-xs text-slate-500">
        <span className="flex items-center gap-1"><span className="inline-block h-0.5 w-5 bg-blue-600" />あなたの提案</span>
        <span className="flex items-center gap-1"><span className="inline-block w-5 border-t border-dashed border-slate-800" />最適案</span>
      </figcaption>
    </figure>
  );
}
