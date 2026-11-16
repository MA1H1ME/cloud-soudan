// ① ヒアリング：用意した質問から選んで聞き、要件メモを埋める。
import { nameFor, simFor } from '../jobs';
import { StepBar } from '../components/StepBar';
import { Senpai } from '../components/Senpai';
import { Face, PrimaryButton, Screen } from '../components/ui';
import { go } from '../router';
import { customerSave, useSave } from '../store';

export function Hearing({ customerId }: { customerId: string }) {
  const state = useSave();
  const sim = simFor(customerId);
  const save = customerSave(state, customerId);
  const hearing = sim?.hearing;
  if (!sim || !save || !hearing) return <Screen title="ヒアリングはありません"><PrimaryButton onClick={() => go({ name: 'floor' })}>フロアに戻る</PrimaryButton></Screen>;

  const name = nameFor(customerId);
  const left = hearing.maxQuestions - save.asked.length;
  const asked = save.asked.flatMap((id) => hearing.questions.filter((q) => q.id === id));
  const revealed = new Set(asked.flatMap((q) => (q.reveals ? [q.reveals] : [])));
  const rest = hearing.questions.filter((q) => !save.asked.includes(q.id));
  const next = () => {
    state.setPhase(customerId, 'design');
    go({ name: 'blueprint', customerId });
  };

  return (
    <Screen
      title={`ヒアリング：${name}さん`}
      right={<span className="text-sm font-bold text-yellow-300">質問 あと{left}回</span>}
      footer={<PrimaryButton onClick={next}>{left > 0 ? 'ヒアリングを切り上げて ② 設計へ' : '② 設計へ進む'}</PrimaryButton>}
    >
      <StepBar customerId={customerId} current="hearing" />
      <Senpai tip="hearing" />

      <div className="flex items-start gap-2">
        <Face mood="normal" />
        <p className="flex-1 rounded-2xl rounded-tl-sm bg-slate-100 px-3 py-2 text-sm text-slate-900">
          {hearing.opening}
        </p>
      </div>
      <ul className="space-y-2" aria-live="polite">
        {asked.map((q) => (
          <li key={q.id} className="space-y-2">
            <p className="ml-10 rounded-2xl rounded-tr-sm bg-blue-100 px-3 py-2 text-sm text-slate-900">{q.text}</p>
            <div className="flex items-start gap-2">
              <Face mood={q.reveals ? 'normal' : 'troubled'} size={32} />
              <p className="flex-1 rounded-2xl rounded-tl-sm bg-slate-100 px-3 py-2 text-sm text-slate-900">{q.answer}</p>
            </div>
          </li>
        ))}
      </ul>

      <section className="rounded-lg border border-amber-400 bg-amber-50 px-3 py-2">
        <h2 className="text-sm font-bold text-slate-900">要件メモ</h2>
        <ul className="mt-1 space-y-0.5 text-sm">
          {hearing.requirements.map((r) =>
            r.given || revealed.has(r.id) ? (
              <li key={r.id} className="text-emerald-800">✓ {r.label}</li>
            ) : (
              <li key={r.id} className="text-amber-700">？ {r.unknown}</li>
            ),
          )}
        </ul>
      </section>

      {left > 0 && rest.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-bold text-slate-900">次に聞くこと</h2>
          <div className="space-y-2">
            {rest.map((q) => (
              <button key={q.id} type="button" onClick={() => state.ask(customerId, q.id)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-left text-sm text-slate-900 active:bg-slate-50">
                {q.text}
              </button>
            ))}
          </div>
        </section>
      )}
      <p className="text-xs text-slate-500">質問の数には限りがあります。聞き逃した要件は検証できず、運用中に障害や苦情として返ってきます。</p>
    </Screen>
  );
}
