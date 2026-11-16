// ④ 検証：聞き出した要件ごとに、構成が合っているかを確かめる。
import { customerById, simByCustomer } from '../content';
import { StepBar } from '../components/StepBar';
import { Senpai } from '../components/Senpai';
import { PrimaryButton, Screen } from '../components/ui';
import { go } from '../router';
import { verify } from '../sim/verify';
import { radarScores } from '../sim/radar';
import { Radar } from '../components/Radar';
import { customerSave, planFor, useSave } from '../store';

const STYLE = {
  pass: { box: 'border-emerald-300 bg-emerald-50', mark: '✓', text: 'text-emerald-800' },
  fail: { box: 'border-red-400 bg-red-50', mark: '✗', text: 'text-red-700' },
  unknown: { box: 'border-amber-400 bg-amber-50', mark: '？', text: 'text-amber-700' },
};

export function Verify({ customerId }: { customerId: string }) {
  const state = useSave();
  const sim = simByCustomer.get(customerId);
  const save = customerSave(state, customerId);
  const plan = sim && save ? planFor(sim, save.month) : undefined;
  if (!sim?.hearing || !save || !plan) return <Screen title="検証はありません"><PrimaryButton onClick={() => go({ name: 'floor' })}>フロアに戻る</PrimaryButton></Screen>;

  const name = customerById.get(customerId)?.name ?? customerId;
  const checks = verify(sim.hearing, save.asked, save.blueprint, plan, sim.profitPerVisit);
  const passed = checks.filter((c) => c.status === 'pass').length;
  const clean = passed === checks.length;
  const start = () => {
    state.setPhase(customerId, 'operate');
    go({ name: 'floor' });
  };

  return (
    <Screen
      title={`検証：${name}さんの構成`}
      right={<span className="text-sm font-bold text-teal-700">{passed}／{checks.length} 合格</span>}
      footer={
        <div className="space-y-2">
          {!clean && <PrimaryButton onClick={() => go({ name: 'build', customerId })}>③ 構築に戻って直す</PrimaryButton>}
          <button type="button" onClick={start} className={`w-full rounded-full py-3 text-sm ${clean ? 'border-2 border-blue-600 bg-blue-50 font-bold text-slate-900' : 'border border-slate-300 text-slate-700'}`}>
            {clean ? 'この構成で運用を始める' : 'このまま運用を始める'}
          </button>
        </div>
      }
    >
      <StepBar customerId={customerId} current="verify" />
      <Senpai tip="verify" />
      <Radar scores={radarScores(save.blueprint, plan, sim.features.includes('files'))} priority={sim.priority} />
      <ul className="space-y-2">
        {checks.map((c) => {
          const st = STYLE[c.status];
          return (
            <li key={c.id} className={`border px-3 py-2 text-sm ${st.box}`}>
              <p className={`font-bold ${st.text}`}>{st.mark} {c.title}</p>
              <p className="mt-0.5 text-xs text-slate-800">{c.detail}</p>
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-slate-500">✗ や ？ を残したままでも運用は始められます。その弱点は、運用中の出来事で表に出ます。設計（部品の配置）を直すときは、上の「②設計」から戻れます。</p>
    </Screen>
  );
}
