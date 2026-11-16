// 会社：ランク、社員の雇用、ラックの増設、給料。お金の使い道をまとめた画面。
import { PrimaryButton, Screen, yen } from '../components/ui';
import { go } from '../router';
import { MAX_RACKS, PAYDAY, RACK_PRICE, RANKS, STAFF, onRacks, payroll, rankOf, useSave, type StaffKind } from '../store';

export function CompanyScreen() {
  const state = useSave();
  const company = state.company;
  if (!company) return <Screen title="会社"><PrimaryButton onClick={() => go({ name: 'title' })}>タイトルへ</PrimaryButton></Screen>;
  const rank = rankOf(state.revenue);
  const nextRank = RANKS[rank + 1];
  const nextPay = Math.ceil(state.clock / PAYDAY) * PAYDAY + 1;

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

      <section className="space-y-2">
        <h2 className="text-sm font-bold text-slate-700">社員</h2>
        {(Object.keys(STAFF) as StaffKind[]).map((k) => {
          const s = STAFF[k];
          const hired = state.staff[k];
          const locked = state.revenue < s.rank;
          return (
            <article key={k} className={`rounded-lg border px-3 py-2 text-sm ${hired ? 'border-emerald-400 bg-emerald-50' : 'border-slate-300'}`}>
              <p className="font-bold text-slate-900">{s.title}・{s.name}さん {hired && <span className="text-xs text-emerald-700">在籍中</span>}</p>
              <p className="text-xs text-slate-700">{s.desc}</p>
              <p className="mt-1 text-[11px] text-slate-500">雇う費用 {yen(s.hire)}・給料 {PAYDAY}日ごとに {yen(s.salary)}</p>
              {!hired && (
                <button type="button" disabled={locked || company.cash < s.hire} onClick={() => confirm(`${s.title}の${s.name}さんを雇いますか？（${yen(s.hire)}）`) && state.hire(k)}
                  className="mt-2 w-full rounded bg-teal-700 py-2 font-bold text-white disabled:bg-slate-300">
                  {locked ? `契約料の合計が ${yen(s.rank)} になると雇えます` : company.cash < s.hire ? 'お金が足りません' : '雇う'}
                </button>
              )}
            </article>
          );
        })}
        {state.staff.ops && <p className="text-xs text-slate-600">{STAFF.ops.name}さんに任せられる障害：{state.learned.length} 種類（あなたが正しく対応すると増えます）</p>}
      </section>

      <section className="space-y-2 text-sm">
        <h2 className="text-sm font-bold text-slate-700">サーバールーム</h2>
        <div className="flex items-center justify-between rounded-lg border border-slate-300 px-3 py-2">
          <span>ラック {onRacks(state).length}／{state.racks}台 使用中</span>
          {state.racks < MAX_RACKS ? (
            <button type="button" disabled={company.cash < RACK_PRICE} onClick={() => confirm(`ラックを1台増設しますか？（${yen(RACK_PRICE)}）`) && state.buyRack()} className="rounded border border-slate-400 px-2 py-1 text-xs disabled:opacity-40">
              増設 {yen(RACK_PRICE)}
            </button>
          ) : <span className="text-xs text-slate-500">満杯です</span>}
        </div>
      </section>

      <section className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
        <p>給料の合計：{PAYDAY}日ごとに <b>{yen(payroll(state.staff))}</b></p>
        <p className="text-xs text-slate-500">次の給料日：{nextPay}日目</p>
      </section>
      <button type="button" onClick={() => go({ name: 'transfer' })} className="w-full text-sm text-cyan-700 underline">セーブの引き継ぎ（ほかの端末へ）</button>
    </Screen>
  );
}
