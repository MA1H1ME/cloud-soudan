// メール：届いた依頼から、受ける案件を自分で選ぶ。受けた案件は空きラックに入る。
// 本編の依頼（作り込んだお客さん）、復習のスポット案件、日々の案件メール（自動で組み合わせたもの）の3種類。
import { useState } from 'react';
import { spotById } from '../content';
import { Screen, yen } from '../components/ui';
import { go } from '../router';
import { businessFor, jobFor, nameFor } from '../jobs';
import { MAX_RACKS, RACK_PRICE, SPOT_REWARD, dueSpots, inbox, onRacks, pendingRequests, useSave } from '../store';
import type { SimCustomer } from '../sim/schema';

const PRIORITY = { security: 'セキュリティ', reliability: '止まらないこと', performance: '速さ', cost: 'コスト' } as const;
const KIND = { web: 'Webサイト＋DB', files: 'ファイルの受け渡し', static: '静的サイト' } as const;

function Requirements({ sim }: { sim: SimCustomer }) {
  const reqs = sim.hearing?.requirements.filter((r) => r.given) ?? [];
  if (reqs.length === 0) return null;
  return (
    <ul className="mt-1 space-y-0.5 rounded bg-amber-50 px-2 py-1 text-xs text-slate-800">
      {reqs.map((r) => <li key={r.id}>・{r.label}</li>)}
    </ul>
  );
}

export function Mail() {
  const state = useSave();
  const [open, setOpen] = useState<string | null>(null);
  const used = onRacks(state).length;
  const free = state.racks - used;
  const mails = inbox(state);
  const requests = pendingRequests(state);
  const spots = dueSpots(state);
  const cash = state.company?.cash ?? 0;

  const take = (id: string, story: boolean) => {
    if (story) state.accept(id);
    else if (!state.acceptMail(id)) return;
    go({ name: 'hearing', customerId: id });
  };

  return (
    <Screen title="メール">
      <section className="flex items-center justify-between rounded-lg border border-slate-300 px-3 py-2 text-sm">
        <span>空きラック <b className={free > 0 ? 'text-emerald-700' : 'text-red-700'}>{free}</b>／{state.racks}台</span>
        {state.racks < MAX_RACKS ? (
          <button type="button" disabled={cash < RACK_PRICE} onClick={() => confirm(`ラックを1台増設しますか？（${yen(RACK_PRICE)}）`) && state.buyRack()}
            className="rounded border border-slate-400 px-2 py-1 text-xs disabled:opacity-40">
            ラックを増設 {yen(RACK_PRICE)}
          </button>
        ) : <span className="text-xs text-slate-500">これ以上は置けません</span>}
      </section>

      {requests.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-bold text-slate-700">★ 本編の依頼</h2>
          {requests.map((r) => (
            <article key={r.customerId} className="space-y-1 border-2 border-amber-400 bg-amber-50/40 px-3 py-2 text-sm">
              <p className="text-xs text-slate-500">差出人：{nameFor(r.customerId)}（{businessFor(r.customerId)}）</p>
              <p className="text-slate-900">{r.request.pitch}</p>
              <p className="text-[11px] text-slate-600">契約料 月 {yen(r.contractFee)}・{r.months.length}か月・最優先：{PRIORITY[r.priority]}</p>
              <button type="button" disabled={free <= 0} onClick={() => take(r.customerId, true)} className="w-full rounded bg-teal-700 py-2 font-bold text-white disabled:bg-slate-300">
                {free > 0 ? 'この依頼を受ける' : '空きラックがありません'}
              </button>
            </article>
          ))}
        </section>
      )}

      {spots.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-bold text-slate-700">☎ スポット案件（復習・ラック不要・1件 +{yen(SPOT_REWARD)}）</h2>
          {spots.map((id) => {
            const sp = spotById.get(id);
            return sp ? (
              <button key={id} type="button" onClick={() => go({ name: 'spot', spotId: id, practice: false })} className="block w-full border border-slate-300 px-3 py-2 text-left text-sm">
                <span className="text-xs text-slate-500">{sp.guest}（{sp.business}）</span>
                <span className="block text-slate-900">{sp.voice}</span>
              </button>
            ) : null;
          })}
        </section>
      )}

      <section className="space-y-2">
        <h2 className="text-sm font-bold text-slate-700">📧 案件メール</h2>
        {mails.length === 0 && (
          <p className="text-sm text-slate-500">
            {state.mailLog.length === 0 ? '柏木さんの最初の月を終えると、毎日いくつも案件メールが届くようになります。' : '新しいメールはありません。時間を進めると届きます。'}
          </p>
        )}
        {mails.map((m) => {
          const job = jobFor(m.id);
          if (!job) return null;
          const plan = job.sim.months[0]!;
          const expanded = open === m.id;
          return (
            <article key={m.id} className="border border-slate-300 text-sm">
              <button type="button" onClick={() => setOpen(expanded ? null : m.id)} aria-expanded={expanded} className="block w-full px-3 py-2 text-left">
                <span className="flex items-center justify-between text-xs">
                  <span className="text-amber-600">{'★'.repeat(job.level)}{'☆'.repeat(3 - job.level)}</span>
                  <span className={m.left <= 1 ? 'font-bold text-red-700' : 'text-slate-500'}>{m.left <= 1 ? '今日まで' : `あと${m.left}日`}</span>
                </span>
                <span className="block font-bold text-slate-900">{job.name}さん（{job.business}）</span>
                <span className="block text-xs text-slate-600">{KIND[job.kind]}・最優先：{PRIORITY[job.sim.priority]}・報酬 {yen(job.sim.contractFee)}</span>
              </button>
              {expanded && (
                <div className="space-y-2 border-t border-slate-200 px-3 py-2">
                  <p className="text-slate-900">{job.sim.request.pitch}</p>
                  <Requirements sim={job.sim} />
                  <p className="text-[11px] text-slate-500">1か月の運用契約・1日の訪問 {plan.visitsPerDay.toLocaleString('ja-JP')}・稼働率 {(plan.uptimeTarget * 100).toFixed(1)}%以上</p>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => state.declineMail(m.id)} className="flex-1 rounded border border-slate-300 py-2 text-slate-700">断る</button>
                    <button type="button" disabled={free <= 0} onClick={() => take(m.id, false)} className="flex-[2] rounded bg-teal-700 py-2 font-bold text-white disabled:bg-slate-300">
                      {free > 0 ? '引き受ける' : '空きラックがありません'}
                    </button>
                  </div>
                </div>
              )}
            </article>
          );
        })}
      </section>
      <p className="text-center text-[11px] text-slate-400">案件メールは、照合済みの部品を組み合わせて作っています。どの案件にも、予算内で目標をすべて満たせる構成があります。</p>
    </Screen>
  );
}
