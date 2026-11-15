// オフィス：顧客ボードとチケット。ここから設計図を開く。
import { content, customerById, ruleById, simByCustomer } from '../content';
import { go } from '../router';
import { TICKET_KIND_LABELS, ticketsFrom } from '../sim/tickets';
import { customerSave, pastResults, planFor, useSave } from '../store';
import { Face, GRADE_MARK, PrimaryButton, Screen, Voice, yen } from '../components/ui';

function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return <div className="h-8 w-20 rounded border border-slate-200" />;
  const min = Math.min(...values), max = Math.max(...values);
  const pts = values.map((v, i) => `${4 + (i / (values.length - 1)) * 72},${28 - ((v - min) / (max - min || 1)) * 24}`).join(' ');
  return (
    <svg viewBox="0 0 80 32" className="h-8 w-20 rounded border border-slate-200" aria-hidden="true">
      <polyline points={pts} className="fill-none stroke-emerald-600" strokeWidth="2" />
    </svg>
  );
}

export function Office() {
  const state = useSave();
  const sims = content.sim;
  const grades = sims.flatMap((sim) => {
    const save = customerSave(state, sim.customerId);
    return save ? pastResults(sim, save).map((p) => p.result.grade) : [];
  });
  const stars = Math.min(5, 1 + grades.filter((g) => g === 'best').length);

  return (
    <Screen title="オフィス" right={<span className="text-sm text-slate-800" aria-label={`評判 ${stars}`}>評判 {'★'.repeat(stars)}{'☆'.repeat(5 - stars)}</span>}>
      {sims.length === 0 && <p className="text-sm text-slate-500">公開できる内容がまだありません（照合前のルールは公開用ビルドに含めません）。</p>}

      {sims.map((sim) => {
        const customer = customerById.get(sim.customerId);
        const save = customerSave(state, sim.customerId)!;
        const past = pastResults(sim, save);
        const last = past.at(-1)?.result;
        const plan = planFor(sim, save.month);
        const tickets = last ? ticketsFrom(last, ruleById) : [];
        const name = customer?.name ?? sim.customerId;
        return (
          <section key={sim.customerId} className="space-y-3">
            <div className="rounded-xl border border-slate-300 px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-bold text-slate-900">{name}</p>
                  <p className="text-xs text-slate-500">{customer?.business}</p>
                </div>
                <Sparkline values={past.map((p) => p.result.net)} />
              </div>
              <p className="mt-2 text-sm text-slate-800">
                {plan ? <>{save.month}か月目・1日の訪問 <b>{plan.visitsPerDay.toLocaleString('ja-JP')}</b></> : '試作版はここまで'}
                {last && <span className="ml-2 text-slate-500">先月 {GRADE_MARK[last.grade]}・手元に {yen(last.net)}</span>}
              </p>
            </div>

            {plan ? (
              <>
                <Voice name={`${name}（今月の話）`} mood={last?.grade === 'fail' || last?.grade === 'fair' ? 'troubled' : 'normal'}>{plan.brief}</Voice>
                {tickets.length > 0 && (
                  <div>
                    <h2 className="mb-2 text-sm font-bold text-slate-700">チケット（先月からの課題）</h2>
                    <ul className="space-y-2">
                      {tickets.map((t) => (
                        <li key={t.id} className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-slate-900">
                          <span className="mr-2 rounded bg-red-200 px-1.5 py-0.5 text-[11px] font-bold">{TICKET_KIND_LABELS[t.kind]}</span>
                          {t.voice}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <PrimaryButton onClick={() => go({ name: save.running ? 'report' : 'blueprint', customerId: sim.customerId })}>
                  {save.running ? '今月のレポートを見る' : '設計図を開く'}
                </PrimaryButton>
              </>
            ) : (
              <div className="space-y-3 rounded-xl bg-slate-100 px-4 py-3 text-sm text-slate-800">
                <p>4か月分を遊び終えました。別の構成でもう一度試せます。</p>
                <button type="button" onClick={() => confirm('最初からやり直しますか？') && state.reset()} className="underline">最初からやり直す</button>
              </div>
            )}
          </section>
        );
      })}

      {content.customers.filter((c) => c.kind === 'main' && !simByCustomer.has(c.id)).map((c) => (
        <div key={c.id} className="flex items-center gap-3 rounded-xl border border-dashed border-slate-300 px-4 py-3 text-slate-400">
          <Face mood="normal" size={32} />
          <p className="text-sm">{c.name}（{c.business}）— 準備中</p>
        </div>
      ))}

      <p className="pt-4 text-center text-[11px] text-slate-400">AWS SAA-C03 の学習用に作られた非公式のゲームです。金額や処理能力はゲーム内の値で、実際の料金や性能ではありません。</p>
    </Screen>
  );
}
