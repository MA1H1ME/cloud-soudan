// 早送り：30日が流れる。アクセス数と処理能力のグラフ、出来事、メーター。
import { useEffect, useState } from 'react';
import { customerById, ruleById, simByCustomer } from '../content';
import { PrimaryButton, Screen, pct, yen } from '../components/ui';
import { go } from '../router';
import { DAYS } from '../sim/engine';
import { customerSave, runningResult, useSave } from '../store';

const W = 328, H = 160, PAD = 10;
const SECONDS = 12;

export function Sim({ customerId }: { customerId: string }) {
  const state = useSave();
  const sim = simByCustomer.get(customerId);
  const save = customerSave(state, customerId);
  const result = sim && save ? runningResult(sim, save) : undefined;
  const reduced = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const [day, setDay] = useState(reduced ? DAYS : 0);
  const [speed, setSpeed] = useState(1);
  const done = day >= DAYS;

  useEffect(() => {
    if (done) return;
    let frame = 0;
    let prev = performance.now();
    const tick = (now: number) => {
      const dt = now - prev;
      prev = now;
      setDay((d) => Math.min(DAYS, d + (dt / 1000) * (DAYS / SECONDS) * speed));
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [speed, done]);

  if (!result || !save) return <Screen title="今月はまだ回していません"><PrimaryButton onClick={() => go({ name: 'office' })}>オフィスに戻る</PrimaryButton></Screen>;

  const n = Math.floor(day);
  const name = customerById.get(customerId)?.name ?? customerId;
  const maxY = Math.max(...result.load, ...result.cap) * 1.1;
  const x = (i: number) => PAD + (i / (DAYS - 1)) * (W - 2 * PAD);
  const y = (v: number) => H - PAD - (v / maxY) * (H - 2 * PAD);
  const line = (values: number[]) => values.slice(0, Math.max(n, 1)).map((v, i) => `${x(i)},${y(v)}`).join(' ');
  const sum = (values: number[]) => values.slice(0, n).reduce((a, b) => a + b, 0);
  const uptime = n === 0 ? 1 : sum(result.up) / n;
  const cost = (result.fixedCost * n) / DAYS + sum(result.scalingByDay);
  const slowDays = result.slow.slice(0, n).filter(Boolean).length;
  const firedSoFar = result.fired.filter((f) => f.day <= n);
  const latest = firedSoFar.at(-1);
  const latestGroup = latest ? firedSoFar.filter((f) => f.day === latest.day) : [];
  const bad = latestGroup.some((f) => ruleById.get(f.ruleId)?.tone === 'bad');
  const meters: [string, string][] = [
    ['稼働率', pct(uptime)],
    ['もうけ', yen(sum(result.earnedByDay))],
    ['AWSの請求額', yen(cost)],
    ['重かった日', `${slowDays}日`],
  ];

  return (
    <Screen
      title={`${name}さんの${save.month}か月目`}
      right={<span className="text-sm tabular-nums text-slate-500">{Math.min(n + 1, DAYS)}日目／{DAYS}日</span>}
      footer={<PrimaryButton onClick={() => go({ name: 'report', customerId })} disabled={!done}>月次レポートを見る</PrimaryButton>}
    >
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full rounded-lg border border-slate-200" role="img" aria-label="アクセス数と処理能力の推移">
        {result.up.slice(0, n).map((u, i) => (u < 1 ? <rect key={i} x={x(i) - 4} y={PAD} width="8" height={H - 2 * PAD} className="fill-red-500" fillOpacity={0.15 + 0.5 * (1 - u)} /> : null))}
        <polyline points={line(result.cap)} className="fill-none stroke-slate-400" strokeWidth="1.5" strokeDasharray="4 3" />
        <polyline points={line(result.load)} className="fill-none stroke-blue-600" strokeWidth="2" />
        {result.events.filter((e) => e.day <= n).map((e) => (
          <g key={e.day}>
            <line x1={x(e.day - 1)} x2={x(e.day - 1)} y1={PAD} y2={H - PAD} className="stroke-slate-400" strokeDasharray="2 3" />
            <text x={Math.min(x(e.day - 1) + 4, W - 110)} y={PAD + 10} className="fill-slate-600 text-[10px]">{e.label}</text>
          </g>
        ))}
      </svg>
      <p className="flex justify-center gap-4 text-[11px] text-slate-500">
        <span><span className="mr-1 inline-block h-0.5 w-4 bg-blue-600 align-middle" />アクセス数</span>
        <span><span className="mr-1 inline-block w-4 border-t border-dashed border-slate-500 align-middle" />処理能力</span>
        <span><span className="mr-1 inline-block h-2 w-2 bg-red-400 align-middle" />停止</span>
      </p>

      <div className="h-1.5 rounded-full bg-slate-200"><div className="h-1.5 rounded-full bg-blue-600" style={{ width: `${(day / DAYS) * 100}%` }} /></div>

      <div className={`min-h-16 rounded-xl border px-3 py-2 text-sm ${latest ? (bad ? 'border-red-300 bg-red-50' : 'border-emerald-300 bg-emerald-50') : 'border-slate-200'}`} aria-live="polite">
        {latest ? (
          <>
            <p className="font-bold text-slate-900">{latest.day}日目：{latest.label}</p>
            {latestGroup.map((f) => <p key={f.ruleId} className="text-slate-800">{ruleById.get(f.ruleId)?.headline}</p>)}
          </>
        ) : (
          <p className="text-slate-500">いまのところ平穏です。</p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 text-sm">
        {meters.map(([label, value]) => (
          <div key={label} className="rounded-lg border border-slate-300 px-3 py-2">
            <p className="text-[11px] text-slate-500">{label}</p>
            <p className="font-bold tabular-nums text-slate-900">{value}</p>
          </div>
        ))}
      </div>

      {!done && (
        <div className="flex gap-2">
          {[1, 4].map((s) => (
            <button key={s} type="button" aria-pressed={speed === s} onClick={() => setSpeed(s)} className={`flex-1 rounded-full py-1.5 text-sm ${speed === s ? 'border-2 border-blue-600 bg-blue-50 font-bold' : 'border border-slate-300'}`}>×{s}</button>
          ))}
          <button type="button" onClick={() => setDay(DAYS)} className="flex-1 rounded-full border border-slate-300 py-1.5 text-sm">スキップ</button>
        </div>
      )}
    </Screen>
  );
}
