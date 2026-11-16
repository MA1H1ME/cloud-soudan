// 月次レポート：目標の達成度、収支、発動したルールの解説。学習の本体。
import { customerById, ruleById, simByCustomer } from '../content';
import { GRADE_TEXT, PrimaryButton, Screen, Stamp, Voice, pct, yen } from '../components/ui';
import { go } from '../router';
import { SLOW_DAYS_ALLOWED } from '../sim/parts';
import { BEST_BONUS, customerSave, planFor, runningResult, useSave } from '../store';

export function Report({ customerId }: { customerId: string }) {
  const state = useSave();
  const sim = simByCustomer.get(customerId);
  const save = customerSave(state, customerId);
  const plan = sim && save ? planFor(sim, save.month) : undefined;
  const result = sim && save ? runningResult(sim, save) : undefined;
  if (!sim || !save || !plan || !result) return <Screen title="レポートがありません"><PrimaryButton onClick={() => go({ name: 'floor' })}>フロアに戻る</PrimaryButton></Screen>;

  const name = customerById.get(customerId)?.name ?? customerId;
  const kpis = [
    { ok: result.kpi.budget, label: '予算内', detail: `${yen(result.cost)}／${yen(plan.budget)}` },
    { ok: result.kpi.uptime, label: '稼働率', detail: `${pct(result.uptime, 2)}／目標 ${pct(plan.uptimeTarget)}` },
    { ok: result.kpi.performance, label: '重くない', detail: `重かった日 ${result.slowDays}日／${SLOW_DAYS_ALLOWED}日まで` },
    { ok: result.kpi.security, label: '情報を漏らさない', detail: result.kpi.security ? '事故なし' : '情報が漏れた' },
  ];
  const next = () => {
    state.next(customerId, result.grade);
    go({ name: 'floor' });
  };

  return (
    <Screen title={`月次レポート：${save.month}か月目`} footer={<PrimaryButton onClick={next}>翌月へ進む{result.grade !== 'fail' ? `（契約料 +${yen(sim.contractFee)}${result.grade === 'best' ? `、ボーナス +${yen(BEST_BONUS)}` : ''}）` : '（契約料なし）'}</PrimaryButton>}>
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <Voice name={name} mood={result.grade === 'best' ? 'happy' : result.grade === 'good' ? 'normal' : 'troubled'}>{sim.comments[result.grade]}</Voice>
        </div>
        <Stamp grade={result.grade} />
      </div>
      <p className="text-center text-sm font-bold text-slate-900">{GRADE_TEXT[result.grade]}</p>

      <section>
        <h2 className="mb-2 text-sm font-bold text-slate-700">今月の目標</h2>
        <ul className="divide-y divide-slate-200 rounded-xl border border-slate-300 text-sm">
          {kpis.map((k) => (
            <li key={k.label} className="flex items-center justify-between px-3 py-2">
              <span className="font-bold text-slate-900"><span className={k.ok ? 'text-emerald-700' : 'text-red-700'}>{k.ok ? '✓' : '✗'}</span> {k.label}</span>
              <span className="tabular-nums text-slate-600">{k.detail}</span>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-bold text-slate-700">今月の収支（{name}さん）</h2>
        <dl className="rounded-xl border border-slate-300 px-3 py-2 text-sm tabular-nums">
          <div className="flex justify-between py-0.5"><dt>もうけ</dt><dd>{yen(result.earned)}</dd></div>
          <div className="flex justify-between py-0.5 text-slate-500"><dt>（止まる・重いで逃したもうけ）</dt><dd>{yen(result.lost)}</dd></div>
          <div className="flex justify-between py-0.5"><dt>AWSの請求額</dt><dd className="text-red-700">−{yen(result.cost)}</dd></div>
          <div className="mt-1 flex justify-between border-t border-slate-200 pt-1.5 font-bold"><dt>手元に残った額</dt><dd className="text-base">{yen(result.net)}</dd></div>
        </dl>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-bold text-slate-700">今月起きたことと、その理由</h2>
        {result.fired.length === 0 && <p className="text-sm text-slate-500">特別な出来事はありませんでした。</p>}
        <ul className="space-y-2">
          {result.fired.map((f) => {
            const rule = ruleById.get(f.ruleId);
            if (!rule) return null;
            const good = rule.tone === 'good';
            return (
              <li key={f.ruleId} className={`rounded-xl border px-3 py-2 text-sm ${good ? 'border-emerald-300' : 'border-red-300'}`}>
                <p className="text-[11px] text-slate-500">{f.day}日目・{f.label}</p>
                <p className="font-bold text-slate-900"><span className={good ? 'text-emerald-700' : 'text-red-700'}>{good ? '＋' : '−'}</span> {rule.headline}</p>
                <p className="mt-1 text-slate-800">{rule.explanation}</p>
                <p className="mt-1 rounded bg-slate-100 px-2 py-1 text-xs text-slate-700"><b>試験では：</b>{rule.examPoint}</p>
                {rule.review.status === 'draft' && <p className="mt-1 text-[11px] text-slate-400">下書き（公式ドキュメントとの照合前）</p>}
              </li>
            );
          })}
        </ul>
      </section>
      <p className="text-center text-[11px] text-slate-400">金額はゲーム内の値です。</p>
    </Screen>
  );
}
