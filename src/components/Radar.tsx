// 5つの観点のレーダーチャート。お客さんが最も大事にする観点に★を付ける。
import { AXES, AXIS_LABELS, type Axis } from '../sim/radar';

const SIZE = 240, C = SIZE / 2, R = 78;
const PRIORITY_AXIS = { security: 'security', reliability: 'reliability', performance: 'performance', cost: 'cost' } as const;

function point(i: number, value: number): string {
  const angle = -Math.PI / 2 + (i * 2 * Math.PI) / AXES.length;
  const r = (value / 5) * R;
  return `${C + r * Math.cos(angle)},${C + r * Math.sin(angle)}`;
}

export function Radar({ scores, priority }: { scores: Record<Axis, number>; priority: keyof typeof PRIORITY_AXIS }) {
  const star = PRIORITY_AXIS[priority];
  return (
    <figure className="flex flex-col items-center">
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="w-full max-w-60" role="img" aria-label={`構成の特性：${AXES.map((a) => `${AXIS_LABELS[a]} ${scores[a]}`).join('、')}`}>
        {[5, 2.5].map((v) => <polygon key={v} points={AXES.map((_, i) => point(i, v)).join(' ')} className="fill-none stroke-slate-300" />)}
        <polygon points={AXES.map((a, i) => point(i, scores[a])).join(' ')} className="fill-teal-500/25 stroke-teal-700" strokeWidth={2} />
        {AXES.map((a, i) => {
          const [x, y] = point(i, 6.5).split(',').map(Number);
          const on = a === star;
          return <text key={a} x={x} y={y! + 4} textAnchor="middle" className={on ? 'fill-slate-900 text-[12px] font-bold' : 'fill-slate-500 text-[11px]'}>{on ? '★' : ''}{AXIS_LABELS[a]}</text>;
        })}
      </svg>
      <figcaption className="text-[11px] text-slate-500">★＝このお客さんが一番大事にする観点（ゲーム内の目安）</figcaption>
    </figure>
  );
}
