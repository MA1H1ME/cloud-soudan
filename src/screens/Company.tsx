// 会社：ランク、社員の雇用と研修、設備、ラックの増設、給料。お金の使い道をまとめた画面。
import { Screen, yen } from '../components/ui';
import { go } from '../router';
import {
  BANKRUPT_LIMIT, GEAR, GEAR_IDS, INTEREST_RATE, MAX_RACKS, PAYDAY, RANKS, STAFF, TIERS, onRacks, payroll, rackPrice, rankOf, tierIndex, useSave,
  type StaffKind,
} from '../store';

export function CompanyScreen() {
  const state = useSave();
  const company = state.company;
  if (!company) return <Screen title="会社" back={() => go({ name: 'title' })}><p className="text-sm">セーブデータがありません。</p></Screen>;
  const rank = rankOf(state.revenue);
  const nextRank = RANKS[rank + 1];
  const nextPay = Math.ceil(state.clock / PAYDAY) * PAYDAY + 1;
  const owing = company.cash < 0;
  const price = rackPrice(state.racks);

  return (
    <Screen title="会社">
      <section className="rounded-xl border border-slate-300 px-3 py-3 text-sm">
        <p className="text-xs text-slate-500">{company.name}</p>
        <p className="text-lg font-bold text-slate-900">{'★'.repeat(rank + 1)}{'☆'.repeat(4 - rank)}　{RANKS[rank]!.name}</p>
        <p className="mt-1 text-slate-700">受け取った契約料の合計 {yen(state.revenue)}</p>
        {nextRank && (
          <>
            <div className="mt-2 h-2 rounded bg-slate-200"><div className="h-2 rounded bg-amber-500" style={{ width: `${Math.min(100, ((state.revenue - RANKS[rank]!.min) / (nextRank.min - RANKS[rank]!.min)) * 100)}%` }} /></div>
            <p className="mt-1 text-xs text-slate-500">次の「{nextRank.name}」まで {yen(nextRank.min - state.revenue)}</p>
          </>
        )}
      </section>

      <section className="rounded-xl border border-slate-300 px-3 py-3 text-sm">
        <div className="flex items-baseline justify-between">
          <h2 className="font-bold text-slate-900">評判　{TIERS[tierIndex(state.reputation)]!.name}</h2>
          <span className="tabular-nums text-slate-700">{state.reputation}／100</span>
        </div>
        <div className="relative mt-2 h-3 rounded bg-slate-200" role="img" aria-label={`評判 ${state.reputation}`}>
          <div className="h-3 rounded bg-amber-500" style={{ width: `${state.reputation}%` }} />
          {TIERS.slice(1).map((t) => <span key={t.min} className="absolute top-0 h-3 w-px bg-slate-500" style={{ left: `${t.min}%` }} />)}
        </div>
        <ul className="mt-2 space-y-0.5 text-xs text-slate-700">
          {TIERS.map((t, i) => (
            <li key={t.min} className={i === tierIndex(state.reputation) ? 'font-bold text-slate-900' : 'text-slate-500'}>
              {i === tierIndex(state.reputation) ? '▶ ' : '　'}{t.min}〜　{t.name}：{t.note || '特になし'}
            </li>
          ))}
        </ul>
        <p className="mt-1 text-[11px] text-slate-500">月次報告で ◎ +6、○ +3、△ −1、× −8。◎ のあとは、お客さんが案件を紹介してくれます。</p>
      </section>

      <section className={`rounded-xl border-2 px-3 py-2 text-sm ${owing ? 'border-red-500 bg-red-50' : 'border-slate-300'}`}>
        <div className="flex justify-between"><span>手元の資金</span><b className={owing ? 'text-red-700' : 'text-slate-900'}>{yen(company.cash)}</b></div>
        <div className="flex justify-between text-slate-700"><span>給料（{PAYDAY}日ごと・次は{nextPay}日目）</span><span>{yen(payroll(state.staff))}</span></div>
        {owing && <p className="mt-1 text-xs text-red-800">資金がマイナスです。給料日ごとに、マイナス額の{Math.round(INTEREST_RATE * 100)}%の利息がかかります。{yen(BANKRUPT_LIMIT)} を下回ると倒産です。社員の雇用や設備は、資金が戻るまで買えません。</p>}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-bold text-slate-700">社員</h2>
        {(Object.keys(STAFF) as StaffKind[]).map((k) => {
          const s = STAFF[k];
          const level = state.staff[k];
          const hired = level > 0;
          const locked = state.revenue < s.rank;
          const next = level + 1;
          return (
            <article key={k} className={`rounded-lg border px-3 py-2 text-sm ${hired ? 'border-emerald-400 bg-emerald-50' : 'border-slate-300'}`}>
              <p className="font-bold text-slate-900">
                {s.title}・{s.name}さん {hired && <span className="text-xs text-emerald-700">在籍中　{'●'.repeat(level)}{'○'.repeat(s.maxLevel - level)}（等級 {level}／{s.maxLevel}）</span>}
              </p>
              <p className="text-xs text-slate-700">{hired ? s.desc[level] : s.desc[1]}</p>
              <p className="mt-1 text-[11px] text-slate-500">
                {hired ? `給料 ${PAYDAY}日ごとに ${yen(s.salary[level]!)}` : `雇う費用 ${yen(s.hire)}・給料 ${PAYDAY}日ごとに ${yen(s.salary[1]!)}`}
              </p>
              {!hired && (
                <button type="button" disabled={locked || company.cash < s.hire} onClick={() => confirm(`${s.title}の${s.name}さんを雇いますか？（${yen(s.hire)}）`) && state.hire(k)}
                  className="mt-2 min-h-11 w-full rounded bg-teal-700 py-2 font-bold text-white disabled:bg-slate-300">
                  {locked ? `契約料の合計が ${yen(s.rank)} になると雇えます` : company.cash < s.hire ? 'お金が足りません' : '雇う'}
                </button>
              )}
              {hired && next <= s.maxLevel && (
                <div className="mt-2 rounded bg-white/70 px-2 py-1 text-xs text-slate-800">
                  <p><b>研修で等級 {next} に：</b>{s.desc[next]}</p>
                  <p className="text-[11px] text-slate-500">給料は {yen(s.salary[next]!)} になります</p>
                  <button type="button" disabled={company.cash < s.train[next]!} onClick={() => confirm(`${s.name}さんに研修を受けてもらいますか？（${yen(s.train[next]!)}）`) && state.train(k)}
                    className="mt-1 min-h-11 w-full rounded border-2 border-teal-700 py-2 font-bold text-teal-800 disabled:opacity-40">
                    研修を受けさせる {yen(s.train[next]!)}
                  </button>
                </div>
              )}
              {hired && next > s.maxLevel && <p className="mt-1 text-xs text-emerald-800">これ以上の研修はありません。</p>}
            </article>
          );
        })}
        {state.staff.ops > 0 && (
          <p className="text-xs text-slate-600">
            {STAFF.ops.name}さんが任せられる障害：{state.staff.ops >= 2 ? state.encountered.length : state.learned.length} 種類
            （あなたが正しく対応した種類：{state.learned.length}／出会った種類：{state.encountered.length}）
          </p>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-bold text-slate-700">設備</h2>
        {GEAR_IDS.map((id) => {
          const g = GEAR[id]!;
          const have = state.gear.includes(id);
          const locked = state.revenue < g.rank;
          return (
            <article key={id} className={`rounded-lg border px-3 py-2 text-sm ${have ? 'border-emerald-400 bg-emerald-50' : 'border-slate-300'}`}>
              <p className="font-bold text-slate-900">{g.title} {have && <span className="text-xs text-emerald-700">設置済み</span>}</p>
              <p className="text-xs text-slate-700">{g.desc}</p>
              {!have && (
                <button type="button" disabled={locked || company.cash < g.price} onClick={() => confirm(`${g.title}を設置しますか？（${yen(g.price)}）`) && state.buyGear(id)}
                  className="mt-2 min-h-11 w-full rounded bg-teal-700 py-2 font-bold text-white disabled:bg-slate-300">
                  {locked ? `契約料の合計が ${yen(g.rank)} になると買えます` : company.cash < g.price ? 'お金が足りません' : `設置する ${yen(g.price)}`}
                </button>
              )}
            </article>
          );
        })}
      </section>

      <section className="space-y-2 text-sm">
        <h2 className="text-sm font-bold text-slate-700">サーバールーム</h2>
        <div className="flex items-center justify-between rounded-lg border border-slate-300 px-3 py-2">
          <span>ラック {onRacks(state).length}／{state.racks}台 使用中</span>
          {state.racks < MAX_RACKS ? (
            <button type="button" disabled={company.cash < price} onClick={() => confirm(`ラックを1台増設しますか？（${yen(price)}）`) && state.buyRack()} className="min-h-11 rounded border border-slate-400 px-3 py-1 text-xs disabled:opacity-40">
              増設 {yen(price)}
            </button>
          ) : <span className="text-xs text-slate-500">満杯です</span>}
        </div>
      </section>
      <button type="button" onClick={() => go({ name: 'achievements' })} className="min-h-11 w-full rounded border-2 border-teal-700 py-2 text-sm font-bold text-teal-800">🏆 実績と、いまの目標を見る</button>
      <button type="button" onClick={() => go({ name: 'transfer' })} className="min-h-11 w-full text-sm text-cyan-700 underline">セーブの引き継ぎ（ほかの端末へ）</button>
    </Screen>
  );
}
