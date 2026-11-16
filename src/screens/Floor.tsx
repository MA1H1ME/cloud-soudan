// フロア（メイン）：時間を流して運用を眺める。
// 上半分がオフィス、下半分がサーバールーム。ラックの中身がお客さんの構成で、ランプの色が負荷を表す。
import { useEffect, useRef, useState } from 'react';
import { content, customerById, ruleById, simByCustomer } from '../content';
import { go } from '../router';
import { DAYS, type MonthResult } from '../sim/engine';
import type { Blueprint, PartType } from '../sim/schema';
import { ticketsFrom } from '../sim/tickets';
import { customerSave, dueSpots, pendingRequests, pastResults, planFor, runningResult, SPOT_REWARD, useSave } from '../store';
import { spotById } from '../content';
import { Desk, MONO, Person, PX, Tiles } from '../components/pixel';
import { yen } from '../components/ui';

const PRIORITY_LABELS = { security: 'セキュリティ', reliability: '止まらないこと', performance: '速さ', cost: 'コスト' } as const;

const SECONDS_PER_DAY = 0.5;
const W = 288, H = 300;
const RACKS = [
  { id: 'kashiwagi', x: 16 },
  { id: 'himuro', x: 116 },
  { id: 'akari', x: 216 },
];
const SHORT: Record<PartType, string> = { alb: 'ALB', ec2: 'EC2', rds: 'RDS', 'rds-standby': 'STBY', 'rds-replica': 'RPLC' };

type Led = 'g' | 'y' | 'r';

function rackItems(bp: Blueprint, result: MonthResult | undefined, day: number): { label: string; led: Led }[] {
  const i = Math.max(0, Math.min(DAYS - 1, day - 1));
  const started = result && day > 0;
  const ratio = started ? result.load[i]! / result.cap[i]! : 0.4;
  const web: Led = ratio > 1 ? 'r' : ratio > 0.8 ? 'y' : 'g';
  const dbDown = started && result.up[i]! < 1;
  const s = bp.slots;
  const items: { label: string; led: Led }[] = [];
  if (s.public) items.push({ label: SHORT[s.public], led: web === 'r' ? 'y' : 'g' });
  if (s['app-a']) items.push({ label: SHORT[s['app-a']], led: dbDown ? 'r' : web });
  if (s['app-c']) items.push({ label: SHORT[s['app-c']], led: web });
  if (s['data-a']) items.push({ label: SHORT[s['data-a']], led: dbDown ? 'r' : 'g' });
  if (s['data-c']) items.push({ label: SHORT[s['data-c']], led: 'g' });
  return items;
}

export function Floor() {
  const state = useSave();
  const company = state.company;
  const MAIN = state.active ?? '';
  const sim = simByCustomer.get(MAIN);
  const save = customerSave(state, MAIN);
  const [speed, setSpeed] = useState(0);
  const local = useRef(save?.day ?? 0);

  const result = sim && save ? runningResult(sim, save) : undefined;
  const plan = sim && save ? planFor(sim, save.month) : undefined;
  const day = save?.day ?? 0;

  useEffect(() => {
    if (!result || speed === 0 || !save) return;
    local.current = save.day;
    let frame = 0, prev = performance.now();
    const tick = (now: number) => {
      local.current = Math.min(DAYS, local.current + ((now - prev) / 1000 / SECONDS_PER_DAY) * speed);
      prev = now;
      const whole = Math.floor(local.current);
      if (whole !== useSave.getState().customers[MAIN]?.day) state.setDay(MAIN, whole);
      if (local.current >= DAYS) {
        setSpeed(0);
        setTimeout(() => go({ name: 'report', customerId: MAIN }), 600);
        return;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speed, Boolean(result)]);

  useEffect(() => {
    if (!company) go({ name: 'title' });
  }, [company]);
  if (!company) return null;
  const requests = pendingRequests(state);
  const requestCards = requests.map((r) => {
    const c = customerById.get(r.customerId);
    return (
      <section key={r.customerId} className="space-y-2 border-2 border-yellow-300 px-3 py-3 text-white" style={{ background: PX.box }}>
        <p className="text-xs font-bold text-yellow-300">新しい依頼：{c?.name}（{c?.business}）</p>
        <p className="text-sm leading-relaxed">{r.request.pitch}</p>
        <p className="text-[11px] text-slate-300">契約料 月 {yen(r.contractFee)}・最優先：{PRIORITY_LABELS[r.priority]}</p>
        <button type="button" onClick={() => { setSpeed(0); state.accept(r.customerId); }} className="w-full py-2 font-bold text-white" style={{ background: '#0f766e' }}>この依頼を受ける</button>
      </section>
    );
  });
  if (!sim || !save) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-md flex-col gap-3 bg-slate-900 px-3 py-3">
        <p className="text-sm text-white" style={{ fontFamily: MONO }}>{company.name}　<span className="text-yellow-300">{yen(company.cash)}</span></p>
        <p className="text-sm text-slate-300">事務所を開いたばかりです。最初の依頼が届いています。</p>
        {requestCards}
        {content.sim.length === 0 && <p className="text-xs text-slate-400">公開できる内容がまだありません。</p>}
      </div>
    );
  }

  const name = customerById.get(MAIN)?.name ?? MAIN;
  const past = pastResults(sim, save);
  const tickets = past.length ? ticketsFrom(past.at(-1)!.result, ruleById) : [];
  const recent = result ? result.fired.filter((f) => f.day <= day && f.day > day - 3) : [];
  const latest = recent.at(-1);
  const alarm = recent.some((f) => ruleById.get(f.ruleId)?.tone === 'bad');
  const todayIdx = Math.max(0, day - 1);
  const trouble = result && day > 0 && (result.up[todayIdx]! < 1 || result.load[todayIdx]! > result.cap[todayIdx]!);
  const earnedToday = result && day > 0 ? result.earnedByDay[todayIdx]! : 0;
  const monthEarned = result ? result.earnedByDay.slice(0, day).reduce((a, b) => a + b, 0) : 0;
  const allBest = state.accepted.flatMap((id) => {
    const sm = simByCustomer.get(id), sv = customerSave(state, id);
    return sm && sv ? pastResults(sm, sv).filter((p) => p.result.grade === 'best') : [];
  }).length;
  const stars = Math.min(5, 1 + Math.floor(allBest / 2));
  const before = !save.running;
  const inCase = save.phase !== 'operate';
  const finished = !plan;

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col bg-slate-900">
      <header className="flex items-center justify-between px-3 py-2 text-sm text-white" style={{ background: '#1b2333', fontFamily: MONO }}>
        <span>{finished ? '試作版はここまで' : `${save.month}か月目 ${Math.max(day, 1)}日`}</span>
        <span className="font-bold text-yellow-300">{yen(company.cash)}</span>
        <span className="text-yellow-300" aria-label={`評判 ${stars}`}>{'★'.repeat(stars)}{'☆'.repeat(5 - stars)}</span>
      </header>
      <p className="truncate px-3 py-1 text-[11px] text-slate-300" style={{ background: '#1b2333' }}>{company.name}</p>

      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="pixel block w-full" role="img" aria-label="会社のフロア">
          <Tiles x={0} y={0} cols={18} rows={7} a={PX.f1} b={PX.f2} />
          <Tiles x={0} y={120} cols={18} rows={12} a={PX.s1} b={PX.s2} />
          <rect x="0" y="112" width="128" height="8" fill={PX.wall} />
          <rect x="160" y="112" width="128" height="8" fill={PX.wall} />
          <Desk x={16} y={22} /><Desk x={92} y={22} /><Desk x={168} y={22} />
          <Person x={35} y={46} shirt="#4f7fd8" />
          {alarm ? (
            <g className="runner">
              <Person x={136} y={84} shirt="#e8a33d" />
              <g className="bob"><rect x="138" y="68" width="12" height="12" fill={PX.y} /><text x="144" y="78" textAnchor="middle" fontSize="11" fontWeight="700" fill={PX.ink}>!</text></g>
            </g>
          ) : (
            <Person x={111} y={46} shirt="#e8a33d" />
          )}
          <rect x="244" y="66" width="12" height="10" fill={PX.pot} /><rect x="240" y="52" width="20" height="14" fill={PX.plant} />

          {RACKS.map((r) => {
            const active = r.id === MAIN;
            const otherSave = !active && state.accepted.includes(r.id) ? customerSave(state, r.id) : undefined;
            const items = active ? rackItems(save.running ?? save.blueprint, result, day) : otherSave ? rackItems(otherSave.running ?? otherSave.blueprint, undefined, 0) : [];
            const switchTo = otherSave ? () => { setSpeed(0); state.setActive(r.id); } : undefined;
            const label = customerById.get(r.id)?.name.split(' ')[0] ?? r.id;
            const hot = active && trouble;
            return (
              <g
                key={r.id}
                role={active || switchTo ? 'button' : undefined}
                tabIndex={active || switchTo ? 0 : undefined}
                aria-label={active ? `${name}さんのラック（設計図を開く）` : switchTo ? `${label}さんのラック（担当を切り替える）` : `${label}さんのラック（準備中）`}
                onClick={active ? () => go({ name: 'blueprint', customerId: MAIN }) : switchTo}
                onKeyDown={active ? (e) => e.key === 'Enter' && go({ name: 'blueprint', customerId: MAIN }) : undefined}
                style={{ cursor: active || switchTo ? 'pointer' : undefined }}
              >
                {hot && <rect x={r.x - 4} y="136" width="64" height="104" fill={PX.r} fillOpacity="0.35" className="blink" />}
                <rect x={r.x} y="140" width="56" height="96" fill={PX.rack} opacity={active ? 1 : otherSave ? 0.8 : 0.5} stroke={active ? PX.y : undefined} strokeWidth="2" />
                {items.map((it, k) => (
                  <g key={k}>
                    <rect x={r.x + 4} y={146 + k * 18} width="48" height="15" fill={PX.slot} />
                    <text x={r.x + 8} y={157 + k * 18} fontSize="9" fill={PX.w} fontFamily={MONO}>{it.label}</text>
                    <rect x={r.x + 44} y={151 + k * 18} width="4" height="4" fill={PX[it.led]} className={it.led === 'r' ? 'blink' : undefined} />
                  </g>
                ))}
                {!active && !otherSave && <text x={r.x + 28} y="192" textAnchor="middle" fontSize="9" fill={PX.smoke}>{simByCustomer.has(r.id) ? '依頼待ち' : '準備中'}</text>}
                <text x={r.x + 28} y="254" textAnchor="middle" fontSize="11" fontWeight={active ? 700 : 400} fill={hot ? PX.r : PX.w}>{label}</text>
                {hot && (
                  <g>
                    <rect x={r.x + 14} y="126" width="8" height="8" fill={PX.smoke} className="puff" />
                    <rect x={r.x + 26} y="122" width="10" height="10" fill={PX.smoke} className="puff puff-2" />
                    <rect x={r.x + 38} y="126" width="8" height="8" fill={PX.smoke} className="puff puff-3" />
                  </g>
                )}
                {active && earnedToday > 0 && !hot && speed > 0 && (
                  <text key={day} x={r.x + 28} y="134" textAnchor="middle" fontSize="11" fontWeight="700" fill={PX.y} fontFamily={MONO} className="popup">
                    +{yen(earnedToday)}
                  </text>
                )}
              </g>
            );
          })}
          <text x="280" y="290" textAnchor="end" fontSize="9" fill={PX.smoke} fontFamily={MONO}>サーバールーム</text>
        </svg>

        {latest && (
          <div className={`absolute left-3 right-3 top-2 border-2 px-3 py-2 text-xs shadow ${alarm ? 'border-red-700 bg-white' : 'border-slate-800 bg-white'}`} aria-live="polite">
            <p className="font-bold text-slate-900">{latest.day}日目：{latest.label}</p>
            {recent.filter((f) => f.day === latest.day).map((f) => <p key={f.ruleId} className="text-slate-800">{ruleById.get(f.ruleId)?.headline}</p>)}
          </div>
        )}
      </div>

      {before && dueSpots(state).length > 0 && (
        <section className="space-y-1 border-t-2 border-yellow-300 px-3 py-2 text-white" style={{ background: '#3b2f0b' }}>
          <p className="text-xs font-bold text-yellow-300">☎ スポット案件（1件 +{yen(SPOT_REWARD)}）</p>
          {dueSpots(state).map((id) => {
            const sp = spotById.get(id);
            return sp ? (
              <button key={id} type="button" onClick={() => go({ name: 'spot', spotId: id, practice: false })} className="block w-full border border-yellow-300/60 px-2 py-1.5 text-left text-sm">
                {sp.guest}（{sp.business}）
              </button>
            ) : null;
          })}
        </section>
      )}
      {speed === 0 && requestCards}
      {before && plan && (
        <section className="space-y-2 border-t-2 border-white px-3 py-3 text-white" style={{ background: PX.box }}>
          <p className="text-xs font-bold text-yellow-300">☎ {name}さん（{save.month}か月目）</p>
          <p className="text-sm leading-relaxed">{plan.brief}</p>
          {tickets.map((t) => <p key={t.id} className="border border-red-400 px-2 py-1 text-xs text-red-200">先月の課題：{t.voice}</p>)}
          <p className="text-[11px] text-slate-300">
            予算 {yen(plan.budget)}／稼働率 {(plan.uptimeTarget * 100).toFixed(1)}%以上／1日の訪問 {plan.visitsPerDay.toLocaleString('ja-JP')}
          </p>
        </section>
      )}
      {result && (
        <p className="px-3 py-2 text-xs text-slate-300" style={{ fontFamily: MONO }}>
          今月のもうけ（{name}さん） <span className="font-bold text-yellow-300">{yen(monthEarned)}</span>
          <span className="ml-2">月額 {yen(result.fixedCost)}</span>
        </p>
      )}
      {finished && (
        <p className="px-3 py-3 text-sm text-white" style={{ background: PX.box }}>4か月分を遊び終えました。タイトルの「はじめから」で、別の構成でもう一度試せます。</p>
      )}

      <div className="mt-auto">
        {!finished && (
          <div className="flex items-center justify-center gap-2 px-3 py-2" style={{ fontFamily: MONO }}>
            {before ? (
inCase ? (
                <button type="button" onClick={() => go({ name: save.phase === 'design' ? 'blueprint' : (save.phase as 'hearing' | 'build' | 'verify'), customerId: MAIN })} className="w-full py-3 font-bold text-white" style={{ background: '#0f766e' }}>
                  {save.phase === 'hearing' && save.asked.length === 0 ? '依頼を受けて、話を聞く' : '案件の続きへ'}
                </button>
              ) : (
              <button type="button" onClick={() => { state.startMonth(MAIN); setSpeed(1); }} className="w-full py-3 font-bold text-white" style={{ background: '#c2410c' }}>
                ▶ この構成で{save.month}か月目を始める
              </button>
              )
            ) : (
              ([[0, '⏸ 停止'], [1, '▶ ×1'], [4, '▶▶ ×4']] as const).map(([s, label]) => (
                <button key={s} type="button" aria-pressed={speed === s} onClick={() => setSpeed(s)} disabled={day >= DAYS}
                  className={`flex-1 py-2 text-sm ${speed === s ? 'bg-yellow-300 font-bold text-slate-900' : 'bg-slate-700 text-white'}`}>
                  {label}
                </button>
              ))
            )}
          </div>
        )}
        <nav className="grid grid-cols-4 gap-1 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-1">
          {[
            { label: '設計図', on: before && !finished && !inCase, go: () => go({ name: 'blueprint', customerId: MAIN }), note: '月初だけ' },
            { label: '構築', on: before && !finished && !inCase, go: () => go({ name: 'build', customerId: MAIN }), note: '月初だけ' },
            { label: '記録', on: true, go: () => go({ name: 'record' }), note: '' },
            { label: '報告', on: Boolean(result && day >= DAYS), go: () => go({ name: 'report', customerId: MAIN }), note: '月末' },
          ].map((m) => (
            <button key={m.label} type="button" disabled={!m.on} onClick={m.go}
              className="py-2 text-sm font-bold text-white disabled:opacity-40" style={{ background: PX.btn }}>
              {m.label}
              {!m.on && <span className="block text-[10px] font-normal">{m.note}</span>}
            </button>
          ))}
        </nav>
        {content.sim.length === 0 && <p className="px-3 pb-3 text-xs text-slate-400">公開できる内容がまだありません。</p>}
        <p className="px-3 pb-2 text-center text-[10px] text-slate-500">金額や処理能力はゲーム内の値です。</p>
      </div>
    </div>
  );
}
