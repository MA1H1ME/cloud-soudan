// フロア（メイン）：会社の暦を進めて、すべてのラックの運用を同時に眺める。
// 上半分がオフィス（机のPCでメールを開く）、下半分がサーバールーム（ラック1台＝お客さん1組）。
import { useEffect, useRef, useState } from 'react';
import { ruleById } from '../content';
import { go } from '../router';
import { DAYS, monthIncidents, type MonthResult } from '../sim/engine';
import type { Incident, IncidentOption } from '../sim/incidents';
import { Term } from '../components/Term';
import type { Blueprint, PartType } from '../sim/schema';
import { ticketsFrom } from '../sim/tickets';
import {
  MAIL_STAGE, customerSave, dayOf, dueSpots, inbox, onRacks, pastResults, pendingRequests, planFor, runningResult, unlockStage, useSave,
  type CustomerSave,
} from '../store';
import { Desk, MONO, Person, PX, Tiles } from '../components/pixel';
import { yen } from '../components/ui';
import { Senpai, SenpaiLine } from '../components/Senpai';
import { isStory, jobFor, nameFor, simFor } from '../jobs';

const SECONDS_PER_DAY = 0.5;
const W = 288, H = 300;
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
  if (bp.site !== 'none') {
    if (bp.site === 's3-cloudfront') items.push({ label: 'CF', led: 'g' });
    items.push({ label: bp.site === 'ec2' ? 'EC2' : 'S3', led: bp.site === 'ec2' ? web : 'g' });
    return items;
  }
  if (s.public) items.push({ label: SHORT[s.public], led: web === 'r' ? 'y' : 'g' });
  if (s['app-a']) items.push({ label: SHORT[s['app-a']], led: dbDown ? 'r' : web });
  if (s['app-c']) items.push({ label: SHORT[s['app-c']], led: web });
  if (s['data-a']) items.push({ label: SHORT[s['data-a']], led: dbDown ? 'r' : 'g' });
  if (s['data-c']) items.push({ label: SHORT[s['data-c']], led: 'g' });
  return items;
}

interface Rack {
  id: string;
  save: CustomerSave;
  result?: MonthResult;
  day: number;
  /** まだ答えていない、次の障害対応 */
  pending?: Incident;
  blocking?: Incident;
  reportReady: boolean;
  files: boolean;
}

function racksOf(state: ReturnType<typeof useSave.getState>): Rack[] {
  return onRacks(state).flatMap((id) => {
    const sim = simFor(id);
    const save = customerSave(state, id);
    if (!sim || !save) return [];
    const plan = planFor(sim, save.month);
    const day = dayOf(save, state.clock);
    const result = runningResult(sim, save);
    const incidents = plan && save.running ? monthIncidents(plan, save.running) : [];
    const pending = incidents.find((x) => !(x.key in (save.responses ?? {})));
    return [{
      id, save, result, day, pending, files: sim.features.includes('files'),
      blocking: pending && save.running && day >= pending.day ? pending : undefined,
      reportReady: Boolean(save.running) && day >= DAYS,
    }];
  });
}

export function Floor() {
  const state = useSave();
  const company = state.company;
  const [speed, setSpeed] = useState(0);
  const [menu, setMenu] = useState(false);
  const [outcome, setOutcome] = useState<{ id: string; incident: Incident; option: IncidentOption } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const local = useRef(state.clock);

  const racks = racksOf(state);
  // 時間を止める日：どこかのラックで判断が要る日か、月末
  const stops = racks.filter((r) => r.save.running && r.save.startedOn !== undefined).map((r) => r.save.startedOn! + (r.pending?.day ?? DAYS));
  const stopAt = stops.length ? Math.min(...stops) : Number.POSITIVE_INFINITY;
  const halted = stopAt <= state.clock;
  const mails = inbox(state);
  const requests = pendingRequests(state);
  const spots = dueSpots(state);
  const unread = mails.length + requests.length + spots.length;
  const lastUnread = useRef(mails.length);

  useEffect(() => {
    if (mails.length > lastUnread.current) {
      setToast(`📧 新しい案件メールが ${mails.length - lastUnread.current} 件届きました`);
      const t = setTimeout(() => setToast(null), 2200);
      lastUnread.current = mails.length;
      return () => clearTimeout(t);
    }
    lastUnread.current = mails.length;
  }, [mails.length]);

  useEffect(() => {
    if (speed === 0) return;
    local.current = useSave.getState().clock;
    let frame = 0, prev = performance.now();
    const tick = (now: number) => {
      local.current = Math.min(stopAt, local.current + ((now - prev) / 1000 / SECONDS_PER_DAY) * speed);
      prev = now;
      const whole = Math.floor(local.current);
      if (whole > useSave.getState().clock) useSave.getState().setClock(whole);
      if (local.current >= stopAt) {
        setSpeed(0);
        return;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [speed, stopAt]);

  useEffect(() => {
    if (!company) go({ name: 'title' });
  }, [company]);
  if (!company) return null;

  const blockingRack = racks.find((r) => r.blocking);
  const reportRack = racks.find((r) => r.reportReady);
  const MAIN = outcome?.id ?? blockingRack?.id ?? (racks.some((r) => r.id === state.active) ? state.active! : racks[0]?.id ?? '');
  const main = racks.find((r) => r.id === MAIN);
  const sim = simFor(MAIN);
  const plan = sim && main ? planFor(sim, main.save.month) : undefined;
  const name = nameFor(MAIN);
  const stage = unlockStage(state);

  const menuSheet = menu && (
    <div className="fixed inset-0 z-40 flex items-start justify-end bg-slate-900/50" onClick={() => setMenu(false)} role="presentation">
      <nav aria-label="メニュー" onClick={(e) => e.stopPropagation()} className="mr-2 mt-12 w-56 space-y-1 border-2 border-white p-2 text-sm text-white" style={{ background: PX.box }}>
        {[
          { label: `メール${unread ? `（${unread}）` : ''}`, on: () => go({ name: 'mail' }) },
          { label: '学習記録', on: () => go({ name: 'record' }) },
          { label: '用語図鑑', on: () => go({ name: 'glossary' }) },
          { label: '先輩の案内をもう一度見る', on: () => { state.resetTips(); setMenu(false); } },
          { label: 'タイトルへ戻る', on: () => go({ name: 'title' }) },
        ].map((m) => (
          <button key={m.label} type="button" onClick={() => { setSpeed(0); m.on(); }} className="block w-full px-2 py-2 text-left active:bg-white/10">{m.label}</button>
        ))}
        <p className="px-2 pt-1 text-[10px] text-slate-300">進み具合は自動で保存されます。</p>
      </nav>
    </div>
  );

  const past = sim && main ? pastResults(sim, main.save) : [];
  const tickets = past.length ? ticketsFrom(past.at(-1)!.result, ruleById) : [];
  const day = main?.day ?? 0;
  const result = main?.result;
  const recent = result ? result.fired.filter((f) => f.day <= day && f.day > day - 3) : [];
  const latest = recent.at(-1);
  const alarm = racks.some((r) => r.result && r.day > 0 && r.result.fired.some((f) => f.day <= r.day && f.day > r.day - 3 && ruleById.get(f.ruleId)?.tone === 'bad'));
  const allBest = state.accepted.flatMap((id) => {
    const sm = simFor(id), sv = customerSave(state, id);
    return sm && sv ? pastResults(sm, sv).filter((p) => p.result.grade === 'best') : [];
  }).length;
  const stars = Math.min(5, 1 + Math.floor(allBest / 3));
  const before = main ? !main.save.running : false;
  const inCase = main ? main.save.phase !== 'operate' : false;
  const free = state.racks - racks.length;

  const nextStep = reportRack
    ? `${nameFor(reportRack.id)}さんの月末の報告が届いた。読んでおこう。`
    : !main
      ? unread > 0 ? '机のPCを押して、メールを開こう。届いた依頼から選んで受けるんだ。' : '時間を進めると、新しいメールが届く。'
      : inCase
        ? `${name}さんの案件の続きを進めよう。ヒアリング → 設計 → 構築 → 検証の順だ。`
        : before
          ? tickets.length > 0 ? '先月の課題を見て、設計図か構築で直してから月を始めよう。' : `構成がよければ、${name}さんの月を始めよう。`
          : free > 0 && unread > 0 && stage >= MAIL_STAGE ? `ラックが${free}台空いている。メールの案件を受ければ、同時に回せるぞ。` : '時間を進めて、ラックの様子を見守ろう。';

  // ラックの並び（台数に合わせて幅を変える）
  const rw = Math.min(56, Math.floor((W - 16 - (state.racks - 1) * 6) / state.racks));
  const gap = (W - rw * state.racks) / (state.racks + 1);

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col bg-slate-900">
      <header className="flex items-center justify-between px-3 py-2 text-sm text-white" style={{ background: '#1b2333', fontFamily: MONO }}>
        <span>{state.clock}日目</span>
        <span className="font-bold text-yellow-300">{yen(company.cash)}</span>
        <span className="text-yellow-300" aria-label={`評判 ${stars}`}>{'★'.repeat(stars)}{'☆'.repeat(5 - stars)}</span>
        <button type="button" onClick={() => { setSpeed(0); setMenu(true); }} aria-label="メニュー" className="px-1 text-base text-white">☰</button>
      </header>
      <p className="truncate px-3 py-1 text-[11px] text-slate-300" style={{ background: '#1b2333' }}>{company.name}　ラック {racks.length}／{state.racks}</p>
      {menuSheet}

      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="pixel block w-full" role="img" aria-label="会社のフロア">
          <Tiles x={0} y={0} cols={18} rows={7} a={PX.f1} b={PX.f2} />
          <Tiles x={0} y={120} cols={18} rows={12} a={PX.s1} b={PX.s2} />
          <rect x="0" y="112" width="128" height="8" fill={PX.wall} />
          <rect x="160" y="112" width="128" height="8" fill={PX.wall} />
          <Desk x={16} y={22} /><Desk x={92} y={22} /><Desk x={168} y={22} />
          <Person x={35} y={46} shirt="#4f7fd8" />
          {/* 自分の机のPC：押すとメールが開く */}
          <g role="button" tabIndex={0} aria-label={`PC（メールを開く。未読 ${unread} 件）`} style={{ cursor: 'pointer' }}
            onClick={() => { setSpeed(0); go({ name: 'mail' }); }} onKeyDown={(e) => e.key === 'Enter' && go({ name: 'mail' })}>
            <rect x="26" y="14" width="30" height="24" fill="transparent" />
            {unread > 0 && (
              <g className="bob">
                <rect x="44" y="6" width="16" height="11" fill={PX.w} stroke={PX.r} strokeWidth="1.5" />
                <path d="M44 6l8 6l8 -6" fill="none" stroke={PX.r} strokeWidth="1.5" />
                <rect x="56" y="2" width="10" height="9" fill={PX.r} />
                <text x="61" y="9.5" textAnchor="middle" fontSize="8" fontWeight="700" fill={PX.w} fontFamily={MONO}>{Math.min(9, unread)}</text>
              </g>
            )}
          </g>
          {alarm ? (
            <g className="runner">
              <Person x={136} y={84} shirt="#e8a33d" />
              <g className="bob"><rect x="138" y="68" width="12" height="12" fill={PX.y} /><text x="144" y="78" textAnchor="middle" fontSize="11" fontWeight="700" fill={PX.ink}>!</text></g>
            </g>
          ) : (
            <Person x={111} y={46} shirt="#e8a33d" />
          )}
          <rect x="244" y="66" width="12" height="10" fill={PX.pot} /><rect x="240" y="52" width="20" height="14" fill={PX.plant} />

          {Array.from({ length: state.racks }, (_, i) => {
            const rack = racks[i];
            const x = Math.round(gap + i * (rw + gap));
            const active = rack?.id === MAIN;
            const bp = rack ? rack.save.running ?? rack.save.blueprint : undefined;
            const items = bp ? [...rackItems(bp, rack!.result, rack!.day), ...(rack!.files ? [{ label: 'S3', led: 'g' as Led }] : [])] : [];
            const i0 = Math.max(0, rack ? rack.day - 1 : 0);
            const hot = rack?.result && rack.day > 0 && (rack.result.up[i0]! < 1 || rack.result.load[i0]! > rack.result.cap[i0]!);
            const label = rack ? nameFor(rack.id).split(' ')[0]! : '空き';
            const status = !rack ? '' : rack.reportReady ? '報告' : rack.save.running ? `${rack.day}日` : rack.save.phase !== 'operate' ? '案件中' : '待機';
            const onClick = rack ? () => { setSpeed(0); state.setActive(rack.id); } : () => { setSpeed(0); go({ name: 'mail' }); };
            return (
              <g key={i} role="button" tabIndex={0} style={{ cursor: 'pointer' }} onClick={onClick} onKeyDown={(e) => e.key === 'Enter' && onClick()}
                aria-label={rack ? `${nameFor(rack.id)}さんのラック${active ? '（担当中）' : '（担当を切り替える）'}` : '空きラック（メールを開く）'}>
                {hot && <rect x={x - 4} y="136" width={rw + 8} height="104" fill={PX.r} fillOpacity="0.35" className="blink" />}
                <rect x={x} y="140" width={rw} height="96" fill={PX.rack} opacity={rack ? 1 : 0.5} stroke={active ? PX.y : undefined} strokeWidth="2" />
                {items.slice(0, 5).map((it, k) => (
                  <g key={k}>
                    <rect x={x + 3} y={145 + k * 18} width={rw - 6} height="15" fill={PX.slot} />
                    <text x={x + 6} y={156 + k * 18} fontSize={rw < 48 ? 8 : 9} fill={PX.w} fontFamily={MONO}>{it.label}</text>
                    <rect x={x + rw - 9} y={150 + k * 18} width="4" height="4" fill={PX[it.led]} className={it.led === 'r' ? 'blink' : undefined} />
                  </g>
                ))}
                {!rack && <text x={x + rw / 2} y="192" textAnchor="middle" fontSize="9" fill={PX.smoke}>空き</text>}
                {rack && !isStory(rack.id) && <text x={x + rw - 4} y="134" textAnchor="end" fontSize="8" fill={PX.y}>{'★'.repeat(jobFor(rack.id)?.level ?? 1)}</text>}
                <text x={x + rw / 2} y="252" textAnchor="middle" fontSize="10" fontWeight={active ? 700 : 400} fill={hot ? PX.r : PX.w}>{label}</text>
                <text x={x + rw / 2} y="266" textAnchor="middle" fontSize="8" fill={rack?.reportReady ? PX.y : PX.smoke} fontFamily={MONO}>{status}</text>
                {hot && (
                  <g>
                    <rect x={x + rw / 2 - 14} y="126" width="8" height="8" fill={PX.smoke} className="puff" />
                    <rect x={x + rw / 2 - 2} y="122" width="10" height="10" fill={PX.smoke} className="puff puff-2" />
                  </g>
                )}
              </g>
            );
          })}
          <text x="280" y="292" textAnchor="end" fontSize="9" fill={PX.smoke} fontFamily={MONO}>サーバールーム</text>
        </svg>

        {latest && !blockingRack && (
          <div className={`absolute left-3 right-3 top-2 border-2 px-3 py-2 text-xs shadow ${ruleById.get(latest.ruleId)?.tone === 'bad' ? 'border-red-700 bg-white' : 'border-slate-800 bg-white'}`} aria-live="polite">
            <p className="font-bold text-slate-900">{name}さん {latest.day}日目：{latest.label}</p>
            {recent.filter((f) => f.day === latest.day).map((f) => <p key={f.ruleId} className="text-slate-800">{ruleById.get(f.ruleId)?.headline}</p>)}
          </div>
        )}
        {toast && <p className="absolute bottom-2 left-3 right-3 border-2 border-yellow-300 bg-slate-900 px-3 py-2 text-center text-sm text-white" role="status">{toast}</p>}
      </div>

      {stage >= MAIL_STAGE && <div className="px-3 pt-2"><Senpai tip="mail-start" /></div>}
      {!main && <div className="px-3 pt-2"><Senpai tip="first-request" /></div>}
      {main && before && !inCase && stage >= 2 && <div className="px-3 pt-2"><Senpai tip="unlock-2" /></div>}
      {main && before && !inCase && stage >= 3 && <div className="px-3 pt-2"><Senpai tip="unlock-3" /></div>}
      {main && before && !inCase && plan && <div className="px-3 pt-2"><Senpai tip="operate" /></div>}

      {reportRack && (
        <button type="button" onClick={() => go({ name: 'report', customerId: reportRack.id })} className="mx-3 mt-2 border-2 border-yellow-300 py-2 text-sm font-bold text-white" style={{ background: '#3b2f0b' }}>
          📄 {nameFor(reportRack.id)}さんの月次レポートを読む
        </button>
      )}

      {main && plan && (
        <section className="space-y-2 border-t-2 border-white px-3 py-3 text-white" style={{ background: PX.box }}>
          <p className="text-xs font-bold text-yellow-300">☎ {name}さん（{jobFor(MAIN) ? `${jobFor(MAIN)!.business}・1か月契約` : `${main.save.month}か月目`}）</p>
          {before && <p className="text-sm leading-relaxed">{plan.brief}</p>}
          {before && tickets.map((t) => <p key={t.id} className="border border-red-400 px-2 py-1 text-xs text-red-200">先月の課題：{t.voice}</p>)}
          <p className="text-[11px] text-slate-300">
            予算 {yen(plan.budget)}／稼働率 {(plan.uptimeTarget * 100).toFixed(1)}%以上／1日の訪問 {plan.visitsPerDay.toLocaleString('ja-JP')}
          </p>
          {result && (
            <p className="text-xs text-slate-300" style={{ fontFamily: MONO }}>
              {day}日目　今月のもうけ <span className="font-bold text-yellow-300">{yen(result.earnedByDay.slice(0, day).reduce((a, b) => a + b, 0))}</span>　月額 {yen(result.fixedCost)}
            </p>
          )}
          {inCase ? (
            <button type="button" onClick={() => go({ name: main.save.phase === 'design' ? 'blueprint' : (main.save.phase as 'hearing' | 'build' | 'verify'), customerId: MAIN })} className="w-full py-2 font-bold text-white" style={{ background: '#0f766e' }}>
              {main.save.phase === 'hearing' && main.save.asked.length === 0 ? '依頼の内容を確かめる' : '案件の続きへ'}
            </button>
          ) : before ? (
            <button type="button" onClick={() => { state.startMonth(MAIN); setSpeed(1); }} className="w-full py-2 font-bold text-white" style={{ background: '#c2410c' }}>
              ▶ この構成で{jobFor(MAIN) ? '運用を始める' : `${main.save.month}か月目を始める`}
            </button>
          ) : null}
        </section>
      )}

      <SenpaiLine dark>{nextStep}</SenpaiLine>

      <div className="mt-auto">
        <div className="flex items-center justify-center gap-2 px-3 py-2" style={{ fontFamily: MONO }}>
          {([[0, '⏸ 停止'], [1, '▶ ×1'], [4, '▶▶ ×4']] as const).map(([s, label]) => (
            <button key={s} type="button" aria-pressed={speed === s} onClick={() => setSpeed(s)} disabled={s > 0 && halted}
              className={`flex-1 py-2 text-sm disabled:opacity-40 ${speed === s ? 'bg-yellow-300 font-bold text-slate-900' : 'bg-slate-700 text-white'}`}>
              {label}
            </button>
          ))}
        </div>
        {halted && !blockingRack && <p className="px-3 text-center text-[11px] text-yellow-200">月末の報告を読むと、時間を進められます。</p>}
        <nav className="grid grid-cols-4 gap-1 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-1">
          {[
            { label: '設計図', on: Boolean(main && before && !inCase), go: () => go({ name: 'blueprint', customerId: MAIN }), note: '月初だけ' },
            { label: '構築', on: Boolean(main && before && !inCase), go: () => go({ name: 'build', customerId: MAIN }), note: '月初だけ' },
            { label: `メール${unread ? `(${unread})` : ''}`, on: true, go: () => go({ name: 'mail' }), note: '' },
            { label: '記録', on: true, go: () => go({ name: 'record' }), note: '' },
          ].map((m) => (
            <button key={m.label} type="button" disabled={!m.on} onClick={() => { setSpeed(0); m.go(); }}
              className="py-2 text-sm font-bold text-white disabled:opacity-40" style={{ background: PX.btn }}>
              {m.label}
              {!m.on && <span className="block text-[10px] font-normal">{m.note}</span>}
            </button>
          ))}
        </nav>
        <p className="px-3 pb-2 text-center text-[10px] text-slate-500">金額や処理能力はゲーム内の値です。</p>
      </div>

      {(blockingRack || outcome) && (
        <div className="fixed inset-0 z-30 flex items-end justify-center bg-slate-900/60">
          <section role="dialog" aria-modal="true" aria-label="障害対応" className="sheet-in w-full max-w-md space-y-3 border-t-4 border-red-600 bg-white px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 text-sm text-slate-900">
            {outcome ? (
              <>
                <p className={`text-base font-bold ${outcome.option.good ? 'text-emerald-700' : 'text-red-700'}`}>{outcome.option.good ? '◎ 良い対応' : '× まずい対応'}</p>
                <p className="leading-relaxed">{outcome.option.result}</p>
                <p className="text-xs">関係する用語：<Term id={outcome.incident.termId} /></p>
                <button type="button" onClick={() => { setOutcome(null); setSpeed(1); }} className="w-full py-3 font-bold text-white" style={{ background: '#c2410c' }}>運用を続ける</button>
              </>
            ) : blockingRack?.blocking && (
              <>
                <p className="text-xs font-bold text-red-700">🚨 {nameFor(blockingRack.id)}さん　{blockingRack.blocking.day}日目　障害対応</p>
                <p className="font-bold leading-relaxed">{blockingRack.blocking.alert}</p>
                <p className="text-slate-700">{blockingRack.blocking.question}</p>
                <div className="space-y-2">
                  {blockingRack.blocking.options.map((o) => (
                    <button key={o.id} type="button" onClick={() => { state.respond(blockingRack.id, blockingRack.blocking!.key, o.id); setOutcome({ id: blockingRack.id, incident: blockingRack.blocking!, option: o }); }}
                      className="w-full border-2 border-slate-300 px-3 py-2 text-left active:bg-slate-100">
                      {o.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
