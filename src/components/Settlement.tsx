// 決算：給料日に、それまでの30日分のお金の出入りをまとめて見せる。数字は少しずつ数え上げる。
import { useEffect, useState } from 'react';
import { MONO, PX } from './pixel';
import { yen } from './ui';
import { calendar, type LedgerEntry } from '../store';

/** 数字を、前の値から新しい値まで数え上げて見せる（動きを減らす設定なら、すぐに出す） */
export function CountUp({ value, ms = 700, className }: { value: number; ms?: number; className?: string }) {
  const [shown, setShown] = useState(value);
  useEffect(() => {
    const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce || shown === value) { setShown(value); return; }
    const from = shown;
    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / ms);
      setShown(Math.round(from + (value - from) * (1 - (1 - t) ** 3)));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return <span className={className}>{shown < 0 ? `−${yen(-shown)}` : yen(shown)}</span>;
}

export function Settlement({ ledger, from, to, cash, onClose }: { ledger: LedgerEntry[]; from: number; to: number; cash: number; onClose: () => void }) {
  const rows = ledger.filter((e) => e.day > from && e.day <= to);
  // 内容ごとにまとめる（契約料はお客さんごとに残す）
  const byLabel = new Map<string, number>();
  for (const e of rows) byLabel.set(e.label, (byLabel.get(e.label) ?? 0) + e.amount);
  const incomes = [...byLabel].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  const costs = [...byLabel].filter(([, v]) => v < 0).sort((a, b) => a[1] - b[1]);
  const income = incomes.reduce((s, [, v]) => s + v, 0);
  const cost = costs.reduce((s, [, v]) => s + v, 0);
  const profit = income + cost;
  const c = calendar(to);

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/85 px-5" role="dialog" aria-modal="true" aria-label="決算">
      <section className="sheet-in w-full max-w-sm space-y-3 border-4 border-yellow-300 px-4 py-4 text-white" style={{ background: PX.box }}>
        <p className="text-center text-xs text-yellow-300" style={{ fontFamily: MONO }}>決算　〜{c.label}</p>
        <div className="grid grid-cols-3 gap-2 text-center" style={{ fontFamily: MONO }}>
          <div><p className="text-[10px] text-slate-300">収入</p><CountUp value={income} className="text-sm font-bold text-emerald-300" /></div>
          <div><p className="text-[10px] text-slate-300">支出</p><CountUp value={-cost} className="text-sm font-bold text-red-300" /></div>
          <div><p className="text-[10px] text-slate-300">利益</p><CountUp value={profit} className={`text-sm font-bold ${profit >= 0 ? 'text-yellow-300' : 'text-red-400'}`} /></div>
        </div>
        <div className="max-h-[38dvh] space-y-2 overflow-y-auto text-xs">
          {incomes.length > 0 && (
            <ul className="space-y-0.5">
              {incomes.map(([label, v]) => <li key={label} className="flex justify-between gap-2"><span className="truncate text-slate-200">{label}</span><span className="tabular-nums text-emerald-300">+{yen(v)}</span></li>)}
            </ul>
          )}
          {costs.length > 0 && (
            <ul className="space-y-0.5 border-t border-slate-600 pt-1">
              {costs.map(([label, v]) => <li key={label} className="flex justify-between gap-2"><span className="truncate text-slate-200">{label}</span><span className="tabular-nums text-red-300">−{yen(-v)}</span></li>)}
            </ul>
          )}
          {rows.length === 0 && <p className="text-center text-slate-400">この30日は、お金の出入りがありませんでした。</p>}
        </div>
        <p className="text-center text-xs text-slate-300">手元の資金 <b className={cash < 0 ? 'text-red-400' : 'text-yellow-300'}>{yen(cash)}</b></p>
        <p className="text-center text-sm font-bold">{profit > 0 ? '黒字です。この調子でいこう！' : profit === 0 ? '収支はとんとんでした。' : '赤字です。案件を増やすか、出費を見直そう。'}</p>
        <button type="button" onClick={onClose} className="min-h-12 w-full py-2 font-bold text-slate-900" style={{ background: PX.y }}>次の30日へ</button>
      </section>
    </div>
  );
}
