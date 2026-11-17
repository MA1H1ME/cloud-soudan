// フロア（メイン）：会社の暦を進めて、すべてのラックの運用を同時に眺める。
// 上半分がオフィス（机のPCでメールを開く）、下半分がサーバールーム（ラック1台＝お客さん1組）。
import { useEffect, useRef, useState } from 'react';
import { content, ruleById } from '../content';
import { go } from '../router';
import { DAYS, monthIncidents, type MonthResult } from '../sim/engine';
import type { Incident, IncidentOption } from '../sim/incidents';
import { Term } from '../components/Term';
import type { Blueprint, PartType } from '../sim/schema';
import { ticketsFrom } from '../sim/tickets';
import {
  MAIL_STAGE, RANKS, STAFF, calendar, canOpsHandle, isBankrupt, nextPayday, payroll, salesFeeMult, tierOf, rankOf, customerSave, dayOf, dueSpots, inbox, onRacks, pastResults, pendingRequests, planFor, runningResult, unlockStage, useSave,
  type CustomerSave,
} from '../store';
import { Desk, MONO, Person, PX, Tiles } from '../components/pixel';
import { yen } from '../components/ui';
import { Senpai, SenpaiLine } from '../components/Senpai';
import { isStory, jobFor, nameFor, simFor } from '../jobs';
import { bgm, sfx } from '../sound';

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

/** オフィスの席。あなた（青）と鷹野先輩（緑）は最初から、運用担当と営業担当は雇うと座る */
const OFFICE = [
  { id: 'you', name: 'あなた', x: 8, shirt: '#4f7fd8' },
  { id: 'senpai', name: '鷹野先輩', x: 76, shirt: '#2f7d5b' },
  { id: 'ops', name: `${STAFF.ops.name}（運用）`, x: 144, shirt: '#7a4fd8' },
  { id: 'sales', name: `${STAFF.sales.name}（営業）`, x: 212, shirt: '#d84f7a' },
] as const;

/** 社員の歩く順路（席からの移動量）。暦の2日ごとに次の地点へ歩く。乱数は使わず、暦だけで決まる */
const WALK: Record<string, { phase: number; stops: [number, number][] }> = {
  senpai: { phase: 0, stops: [[0, 0], [0, 0], [34, 22], [34, 22], [-10, 26], [0, 0]] },
  ops: { phase: 3, stops: [[0, 0], [0, 0], [0, 0], [-34, 24], [-34, 24], [12, 26]] },
  sales: { phase: 5, stops: [[0, 0], [0, 0], [-30, 26], [-30, 26], [-62, 10], [0, 0]] },
};

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
  const lastSpeed = useRef(1);
  useEffect(() => { if (speed > 0) lastSpeed.current = speed; }, [speed]);
  const rank = rankOf(state.revenue);
  const [celebrate, setCelebrate] = useState<number | null>(null);
  const [talk, setTalk] = useState<{ who: string; text: string } | null>(null);

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
      sfx.mail();
      setToast(`📧 新しい案件メールが ${mails.length - lastUnread.current} 件届きました`);
      const t = setTimeout(() => setToast(null), 2200);
      lastUnread.current = mails.length;
      return () => clearTimeout(t);
    }
    lastUnread.current = mails.length;
  }, [mails.length]);

  useEffect(() => {
    const st = useSave.getState();
    const r = racksOf(st).find((x) => x.blocking && canOpsHandle(st, x.blocking.type));
    if (!r?.blocking) return;
    const good = r.blocking.options.find((o) => o.good)!;
    // 社員が対応しても、あなたの「覚えた障害対応」は増えない（自分で解いたときだけ増える）
    st.respond(r.id, r.blocking.key, good.id);
    sfx.good();
    setToast(`🧑‍💻 運用担当の${STAFF.ops.name}さんが対応：${good.label}`);
    const t = setTimeout(() => setToast(null), 2600);
    setSpeed(lastSpeed.current);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.clock, state.staff.ops]);

  // ランクアップ：見せたことのないランクに上がっていたら、お祝いの画面を出す（古いセーブは今のランクから）
  useEffect(() => {
    if (state.seenRank === undefined) { state.setSeenRank(rank); return; }
    if (rank > state.seenRank) {
      sfx.fanfare();
      setCelebrate(rank);
      setSpeed(0);
      state.setSeenRank(rank);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rank, state.seenRank]);

  // 給料日を知らせる
  const payKey = state.lastPay ? `${state.lastPay.day}` : '';
  const lastPayKey = useRef(payKey);
  useEffect(() => {
    if (payKey && payKey !== lastPayKey.current && state.lastPay) {
      setToast(state.lastPay.interest > 0 ? `💴 給料日：給料 ${yen(state.lastPay.amount)}、利息 ${yen(state.lastPay.interest)} を払いました` : `💴 給料日：社員に ${yen(state.lastPay.amount)} を払いました`);
      const t = setTimeout(() => setToast(null), 2600);
      lastPayKey.current = payKey;
      return () => clearTimeout(t);
    }
    lastPayKey.current = payKey;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payKey]);

  // 月次報告で入った契約料を、フロアに戻ったときに知らせる
  useEffect(() => {
    if (!state.income) return;
    setToast(state.income);
    state.notifyIncome(null);
    const t = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.income]);

  // 人物のひとこと（タップで出て、3秒で消える）
  useEffect(() => {
    if (!talk) return;
    const t = setTimeout(() => setTalk(null), 3000);
    return () => clearTimeout(t);
  }, [talk]);

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
  // 本編の3人の契約をすべて終えたら、一度だけクリア画面を出す
  const storyDone = content.sim.length > 0 && content.sim.every((s) => state.accepted.includes(s.customerId) && !racks.some((r) => r.id === s.customerId));
  useEffect(() => {
    if (storyDone && !state.endingSeen) go({ name: 'ending' });
  }, [storyDone, state.endingSeen]);
  // 運用担当がいれば、前に正しく対応できた種類の障害は代わりに対応する
  const canDelegate = (inc?: Incident) => Boolean(inc && canOpsHandle(state, inc.type));
  const blockingRack = racks.find((r) => r.blocking && !canDelegate(r.blocking));
  const blockingKey = blockingRack ? `${blockingRack.id}-${blockingRack.blocking!.key}` : '';
  useEffect(() => { if (blockingKey) sfx.alarm(); }, [blockingKey]);
  // 障害の対応中は曲が変わる（設定がオフなら何も鳴らない）
  useEffect(() => {
    if (!state.music) return;
    bgm.set(blockingKey ? 'alert' : 'calm');
    return () => bgm.set('calm');
  }, [blockingKey, state.music]);
  if (!company) return null;
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
          { label: '会社（社員・ラック・ランク）', on: () => go({ name: 'company' }) },
          { label: '学習記録', on: () => go({ name: 'record' }) },
          { label: '用語図鑑', on: () => go({ name: 'glossary' }) },
          { label: '先輩の案内をもう一度見る', on: () => { state.resetTips(); setMenu(false); } },
          { label: `効果音：${state.sound ? 'オン' : 'オフ'}`, on: () => state.setSound(!state.sound) },
          { label: `BGM：${state.music ? 'オン' : 'オフ'}`, on: () => state.setMusic(!state.music) },
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
  const stars = rank + 1;
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

  // 何も動いていないのに、やることが残っているときは時間を進めさせない（メールが期限切れで消えないように）
  const idleWithWork = racks.every((r) => !r.save.running) && (unread > 0 || racks.length > 0);
  const lineFor = (id: string) =>
    id === 'senpai' ? nextStep
      : id === 'ops' ? (state.staff.ops >= 2 ? `出会った障害は${state.encountered.length}種類、全部見ています。お任せください。` : `任せてください。あなたが覚えた障害対応は${state.learned.length}種類。その種類なら、私が代わりに対応します。`)
        : id === 'sales' ? `案件メール、集めてきました！ 未読は${unread}件です。報酬は${Math.round((salesFeeMult(state.staff.sales) - 1) * 100)}%増しで交渉しています。`
          : `${calendar(state.clock).label}。ラックは${racks.length}／${state.racks}台が稼働中。`;

  // 監視モニターがあると、今月の判断が要る出来事を日ごとに予報する
  const forecast = main?.save.running && plan ? monthIncidents(plan, main.save.running).filter((x) => x.day > day).map((x) => ({ day: x.day, label: x.label })) : [];

  // ラックの並び（台数に合わせて幅を変える）
  const rw = Math.min(56, Math.floor((W - 16 - (state.racks - 1) * 6) / state.racks));
  const gap = (W - rw * state.racks) / (state.racks + 1);

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col bg-slate-900">
      <header className="flex items-center justify-between px-3 py-2 text-sm text-white" style={{ background: '#1b2333', fontFamily: MONO }}>
        <span>{calendar(state.clock).label}</span>
        <span className="font-bold text-yellow-300">{yen(company.cash)}</span>
        <span className="text-yellow-300" aria-label={`会社のランク ${RANKS[rank]!.name}`}>{'★'.repeat(stars)}{'☆'.repeat(5 - stars)}</span>
        <button type="button" onClick={() => { setSpeed(0); setMenu(true); }} aria-label="メニュー" className="-my-2 -mr-2 h-11 w-11 text-lg text-white">☰</button>
      </header>
      <p className="truncate px-3 py-1 text-[11px] text-slate-300" style={{ background: '#1b2333' }}>{company.name}（{RANKS[rank]!.name}）　ラック {racks.length}／{state.racks}　評判 {state.reputation}（{tierOf(state.reputation).name}）</p>
      {menuSheet}
      {company.cash < 0 && (
        <button type="button" onClick={() => { setSpeed(0); go({ name: 'company' }); }} className="block w-full border-y-2 border-red-700 bg-red-950 px-3 py-2 text-left text-xs text-red-100">
          ⚠ 資金がマイナスです（{yen(company.cash)}）。給料日ごとに利息がかかります。契約料が入るまで、雇用や設備は買えません。
        </button>
      )}
      {company.cash >= 0 && payroll(state.staff) > 0 && company.cash < payroll(state.staff) && nextPayday(state.clock) - state.clock <= 7 && (
        <button type="button" onClick={() => { setSpeed(0); go({ name: 'company' }); }} className="block w-full border-y-2 border-amber-600 bg-amber-950 px-3 py-2 text-left text-xs text-amber-100">
          ⚠ 給料日まであと{nextPayday(state.clock) - state.clock}日。給料 {yen(payroll(state.staff))} に対して、手元の資金 {yen(company.cash)} では足りません。
        </button>
      )}

      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="pixel block w-full" role="img" aria-label="会社のフロア">
          <Tiles x={0} y={0} cols={18} rows={7} a={PX.f1} b={PX.f2} />
          <Tiles x={0} y={120} cols={18} rows={12} a={PX.s1} b={PX.s2} />
          <rect x="0" y="112" width="128" height="8" fill={PX.wall} />
          <rect x="160" y="112" width="128" height="8" fill={PX.wall} />
          {/* 机は4つ：あなた・鷹野先輩・運用担当・営業担当。雇っていない席は空席 */}
          {state.gear.includes('monitor') && (
            <g aria-label="監視モニター">
              <rect x="100" y="2" width="56" height="16" fill="#0b1020" stroke={PX.deskD} strokeWidth="2" />
              <path d="M104 14l8 -6l8 4l8 -8l8 6l8 -2l8 4" fill="none" stroke={PX.g} strokeWidth="1.5" />
            </g>
          )}
          {OFFICE.map((o) => <Desk key={o.id} x={o.x} y={22} />)}
          {OFFICE.map((o) => {
            const present = o.id === 'you' || o.id === 'senpai' || state.staff[o.id as 'ops' | 'sales'];
            if (!present) {
              return <text key={o.id} x={o.x + 24} y="64" textAnchor="middle" fontSize="8" fill={PX.deskD}>空席</text>;
            }
            const running = o.id === 'senpai' && alarm;
            const speak = () => { setSpeed(0); setTalk({ who: o.id, text: lineFor(o.id) }); };
            const walk = WALK[o.id];
            // 時間が流れているときだけ歩く。止めているときは、その場で立ち止まる
            const [dx, dy] = running ? [0, 26] : walk ? walk.stops[Math.floor((state.clock + walk.phase) / 2) % walk.stops.length]! : [0, 0];
            const moving = speed > 0 && !running && Boolean(walk);
            return (
              <g key={o.id} role="button" tabIndex={0} aria-label={`${o.name}（話しかける）`} style={{ cursor: 'pointer', transform: `translate(${dx}px, ${dy}px)`, transition: `transform ${speed >= 4 ? 0.25 : 0.9}s linear` }} onClick={speak} onKeyDown={(e) => e.key === 'Enter' && speak()}>
                <g className={running ? 'runner' : moving ? 'bob' : undefined}>
                  <Person x={o.x + 19} y={46} shirt={o.shirt} />
                  {running && <g className="bob"><rect x={o.x + 21} y="30" width="12" height="12" fill={PX.y} /><text x={o.x + 27} y="40" textAnchor="middle" fontSize="11" fontWeight="700" fill={PX.ink}>!</text></g>}
                </g>
                <rect x={o.x + 1} y="72" width="46" height="11" fill={o.id === 'you' ? PX.btn : PX.box} opacity="0.85" />
                <text x={o.x + 24} y="80" textAnchor="middle" fontSize="7.5" fill={PX.w}>{o.id === 'you' ? '▼あなた' : o.name}</text>
                <rect x={o.x + 8} y="44" width="32" height="40" fill="transparent" />
              </g>
            );
          })}
          {/* 自分の机のPC：押すとメールが開く */}
          <g role="button" tabIndex={0} aria-label={`PC（メールを開く。未読 ${unread} 件）`} style={{ cursor: 'pointer' }}
            onClick={() => { setSpeed(0); go({ name: 'mail' }); }} onKeyDown={(e) => e.key === 'Enter' && go({ name: 'mail' })}>
            <rect x="8" y="14" width="48" height="24" fill="transparent" />
            {unread > 0 && (
              <g className="bob">
                <rect x="44" y="6" width="16" height="11" fill={PX.w} stroke={PX.r} strokeWidth="1.5" />
                <path d="M44 6l8 6l8 -6" fill="none" stroke={PX.r} strokeWidth="1.5" />
                <rect x="56" y="2" width="10" height="9" fill={PX.r} />
                <text x="61" y="9.5" textAnchor="middle" fontSize="8" fontWeight="700" fill={PX.w} fontFamily={MONO}>{Math.min(9, unread)}</text>
              </g>
            )}
          </g>
          <rect x="270" y="66" width="10" height="10" fill={PX.pot} /><rect x="267" y="54" width="16" height="12" fill={PX.plant} />
          {talk && (() => {
            const o = OFFICE.find((x) => x.id === talk.who)!;
            const bx = Math.min(W - 150, Math.max(4, o.x - 40));
            return (
              <g className="sheet-in" aria-live="polite">
                <rect x={bx} y="86" width="146" height="24" rx="3" fill={PX.w} stroke={PX.ink} strokeWidth="1" />
                <path d={`M${o.x + 24} 86l-4 -6l8 0z`} fill={PX.w} stroke={PX.ink} strokeWidth="1" />
                <foreignObject x={bx + 3} y="87" width="140" height="22">
                  <p style={{ fontSize: 7.5, lineHeight: 1.25, color: PX.ink, margin: 0 }}>{talk.text}</p>
                </foreignObject>
              </g>
            );
          })()}


          {Array.from({ length: state.racks }, (_, i) => {
            const rack = racks[i];
            const x = Math.round(gap + i * (rw + gap));
            const active = rack?.id === MAIN;
            const bp = rack ? rack.save.running ?? rack.save.blueprint : undefined;
            const items = bp ? [...rackItems(bp, rack!.result, rack!.day), ...(rack!.files ? [{ label: 'S3', led: 'g' as Led }] : [])] : [];
            const i0 = Math.max(0, rack ? rack.day - 1 : 0);
            const hot = rack?.result && rack.day > 0 && (rack.result.up[i0]! < 1 || rack.result.load[i0]! > rack.result.cap[i0]!);
            const label = rack ? nameFor(rack.id).split(' ')[0]! : '空き';
            const status = !rack ? 'メールで受注' : rack.reportReady ? '報告' : rack.save.running ? `${rack.day}/30日` : rack.save.phase !== 'operate' ? '案件中' : '待機';
            const onClick = rack ? () => { setSpeed(0); state.setActive(rack.id); } : () => { setSpeed(0); go({ name: 'mail' }); };
            return (
              <g key={i} role="button" tabIndex={0} style={{ cursor: 'pointer' }} onClick={onClick} onKeyDown={(e) => e.key === 'Enter' && onClick()}
                aria-label={rack ? `${nameFor(rack.id)}さんのラック${active ? '（担当中）' : '（担当を切り替える）'}` : '空きラック（メールを開く）'}>
                {hot && <rect x={x - 4} y="136" width={rw + 8} height="104" fill={PX.r} fillOpacity="0.35" className="blink" />}
                {rack
                  ? <rect x={x} y="140" width={rw} height="96" fill={PX.rack} stroke={active ? PX.y : undefined} strokeWidth="2" />
                  : <rect x={x + 1} y="141" width={rw - 2} height="94" fill="transparent" stroke={PX.smoke} strokeWidth="1.5" strokeDasharray="4 3" opacity="0.6" />}
                {items.slice(0, 5).map((it, k) => (
                  <g key={k}>
                    <rect x={x + 3} y={145 + k * 18} width={rw - 6} height="15" fill={PX.slot} />
                    <text x={x + 6} y={156 + k * 18} fontSize={rw < 48 ? 8 : 9} fill={PX.w} fontFamily={MONO}>{it.label}</text>
                    <rect x={x + rw - 9} y={150 + k * 18} width="4" height="4" fill={PX[it.led]} className={it.led === 'r' ? 'blink' : undefined} />
                  </g>
                ))}
                {!rack && <text x={x + rw / 2} y="194" textAnchor="middle" fontSize="18" fill={PX.smoke} opacity="0.7">＋</text>}
                {rack?.result && rack.day > 0 && speed > 0 && !hot && rack.result.earnedByDay[rack.day - 1]! > 0 && (
                  <text key={`m${rack.day}`} x={x + rw / 2} y="134" textAnchor="middle" fontSize="9" fontWeight="700" fill={PX.y} fontFamily={MONO} className="popup">
                    +{yen(rack.result.earnedByDay[rack.day - 1]!)}
                  </text>
                )}
                {rack && !isStory(rack.id) && <text x={x + rw - 4} y="134" textAnchor="end" fontSize="8" fill={PX.y}>{'★'.repeat(jobFor(rack.id)?.level ?? 1)}</text>}
                <text x={x + rw / 2} y="252" textAnchor="middle" fontSize="10" fontWeight={active ? 700 : 400} fill={hot ? PX.r : PX.w}>{label}</text>
                <text x={x + rw / 2} y="266" textAnchor="middle" fontSize="8" fill={rack?.reportReady ? PX.y : PX.smoke} fontFamily={MONO}>{status}</text>
                {(() => {
                  const ev = rack?.result && rack.day > 0 ? rack.result.fired.filter((f) => f.day <= rack.day && f.day > rack.day - 3).at(-1) : undefined;
                  const rule = ev ? ruleById.get(ev.ruleId) : undefined;
                  if (!ev || !rule || blockingRack) return null;
                  const good = rule.tone === 'good';
                  const bw = 124;
                  const bx = Math.min(W - bw - 2, Math.max(2, x + rw / 2 - bw / 2));
                  const text = rule.headline.length > 30 ? `${rule.headline.slice(0, 29)}…` : rule.headline;
                  return (
                    <g key={`b${ev.ruleId}`} className="sheet-in">
                      <rect x={bx} y="88" width={bw} height="26" fill={PX.w} stroke={good ? '#1f9d55' : PX.r} strokeWidth="1.5" />
                      <path d={`M${x + rw / 2 - 4} 114l4 6l4 -6z`} fill={PX.w} stroke={good ? '#1f9d55' : PX.r} strokeWidth="1.5" />
                      <rect x={x + rw / 2 - 3} y="113" width="6" height="2" fill={PX.w} />
                      <text x={bx + 3} y="98" fontSize="8" fontWeight="700" fill={good ? '#1f9d55' : PX.r}>{good ? '♪' : '!'}</text>
                      <foreignObject x={bx + 11} y="89" width={bw - 14} height="24">
                        <p style={{ fontSize: 6.5, lineHeight: 1.25, color: PX.ink, margin: 0 }}>{text}</p>
                      </foreignObject>
                    </g>
                  );
                })()}
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

        {latest && <p className="sr-only" aria-live="polite">{name}さん {latest.day}日目：{latest.label}：{ruleById.get(latest.ruleId)?.headline}</p>}
        {toast && <p className="absolute left-3 right-3 top-2 z-10 border-2 border-yellow-300 bg-slate-900 px-3 py-2 text-center text-sm text-white" role="status">{toast}</p>}
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
          {before && (
            <details className="text-sm leading-relaxed">
              <summary className="cursor-pointer text-[13px] text-slate-200">今月のお客さんの声を読む</summary>
              <p className="mt-1">{plan.brief}</p>
            </details>
          )}
          {before && tickets.map((t) => <p key={t.id} className="border border-red-400 px-2 py-1 text-xs text-red-200">先月の課題：{t.voice}</p>)}
          <p className="text-[11px] text-slate-300">
            予算 {yen(plan.budget)}／稼働率 {(plan.uptimeTarget * 100).toFixed(1)}%以上／1日の訪問 {plan.visitsPerDay.toLocaleString('ja-JP')}
          </p>
          {state.gear.includes('monitor') && main.save.running && forecast.length > 0 && (
            <p className="border border-cyan-500 px-2 py-1 text-xs text-cyan-100">
              📡 予報：{forecast.map((f) => `${f.day}日ごろ ${f.label}`).join('／')}
            </p>
          )}
          {result && (
            <p className="text-xs text-slate-300" style={{ fontFamily: MONO }}>
              {name}さん {day}/30日　お客さんの売上 <span className="font-bold text-yellow-300">{yen(result.earnedByDay.slice(0, day).reduce((a, b) => a + b, 0))}</span>　月額 {yen(result.fixedCost)}
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

      <div className="sticky bottom-0 z-20 mt-auto bg-slate-900/95 backdrop-blur">
        <div className="flex items-center justify-center gap-2 px-3 py-2" style={{ fontFamily: MONO }}>
          {([[0, '⏸ 停止'], [1, '▶ ×1'], [4, '▶▶ ×4']] as const).map(([s, label]) => (
            <button key={s} type="button" aria-pressed={speed === s} onClick={() => setSpeed(s)} disabled={s > 0 && (halted || idleWithWork)}
              className={`flex-1 py-2 text-sm disabled:opacity-40 ${speed === s ? 'bg-yellow-300 font-bold text-slate-900' : 'bg-slate-700 text-white'}`}>
              {label}
            </button>
          ))}
        </div>
        {idleWithWork && <p className="px-3 text-center text-[11px] text-yellow-200">{racks.length ? 'お客さんの月を始めると、時間を進められます。' : 'メールで依頼を受けると、時間を進められます。'}</p>}
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

      {isBankrupt(company.cash) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 px-6" role="dialog" aria-modal="true" aria-label="倒産">
          <section className="sheet-in w-full max-w-xs space-y-3 border-4 border-red-600 px-4 py-5 text-white" style={{ background: PX.box }}>
            <p className="text-center text-xs text-red-300" style={{ fontFamily: MONO }}>資金ショート</p>
            <p className="text-center text-lg font-bold">会社が立ち行かなくなりました</p>
            <p className="text-sm leading-relaxed text-slate-200">資金が {yen(company.cash)} まで落ち込みました。ここから立て直せます。社員は全員辞めますが、お客さんとの契約と、あなたが覚えたことはそのまま残ります。</p>
            <p className="text-xs text-slate-400">再建すると、資金は {yen(50000)} になります。</p>
            <button type="button" onClick={() => { sfx.bad(); state.rebuild(); }} className="min-h-12 w-full py-2 font-bold text-slate-900" style={{ background: PX.y }}>会社を立て直す</button>
          </section>
        </div>
      )}

      {celebrate !== null && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/80 px-6" role="dialog" aria-modal="true" aria-label="ランクアップ">
          <div className="confetti" aria-hidden="true">{Array.from({ length: 24 }, (_, i) => <i key={i} style={{ left: `${(i * 37) % 100}%`, animationDelay: `${(i % 6) * 0.15}s`, background: ['#ffd84d', '#4dff88', '#ff8a4d', '#7fd3ff'][i % 4] }} />)}</div>
          <section className="sheet-in relative w-full max-w-xs border-4 border-yellow-300 px-4 py-5 text-center text-white" style={{ background: PX.box }}>
            <p className="text-xs text-yellow-300" style={{ fontFamily: MONO }}>RANK UP!</p>
            <p className="mt-1 text-2xl font-bold">{'★'.repeat(celebrate + 1)}</p>
            <p className="mt-2 text-lg font-bold">「{RANKS[celebrate]!.name}」になりました</p>
            <p className="mt-2 text-sm text-slate-200">お客さんからの評判が広がっています。{(Object.keys(STAFF) as ('ops' | 'sales')[]).filter((k) => !state.staff[k] && state.revenue >= STAFF[k].rank).map((k) => `${STAFF[k].title}を雇えます。`).join('')}</p>
            <button type="button" onClick={() => setCelebrate(null)} className="mt-4 w-full py-2 font-bold text-slate-900" style={{ background: PX.y }}>やったね！</button>
          </section>
        </div>
      )}

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
                    <button key={o.id} type="button" onClick={() => { state.respond(blockingRack.id, blockingRack.blocking!.key, o.id, { type: blockingRack.blocking!.type, good: o.good }); (o.good ? sfx.good : sfx.bad)(); setOutcome({ id: blockingRack.id, incident: blockingRack.blocking!, option: o }); }}
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
