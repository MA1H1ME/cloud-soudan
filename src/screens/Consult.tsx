// S3 相談 + S4 提案。会話を読み、判断ポイントごとに選択肢カードを1枚選ぶ。
import { useState } from 'react';
import { cardById, customerById, scenarioById } from '../content';
import { PILLARS, PILLAR_LABELS } from '../content/schema';
import { go } from '../router';
import { today, useSave } from '../store';
import { Lines, PrimaryButton, Screen } from '../components/ui';
import { checkAll } from '../engine/conditions';

export function Consult({ scenarioId }: { scenarioId: string }) {
  const scenario = scenarioById.get(scenarioId);
  const save = useSave();
  const [choices, setChoices] = useState<Record<string, string>>({});
  const [hintShown, setHintShown] = useState<string | null>(null);

  if (!scenario) return <Screen title="相談が見つかりません">{null}</Screen>;
  const customer = customerById.get(scenario.customerId);
  const name = customer?.name ?? '';
  const condState = { flags: save.flags, completedOn: save.completedOn, today: today() };
  const intro = scenario.intros.find((i) => !i.when || checkAll([i.when], condState)) ?? scenario.intros[0]!;
  const top = PILLARS.reduce((a, b) => (scenario.weights[b] > scenario.weights[a] ? b : a));
  const complete = scenario.decisions.every((d) => choices[d.id]);

  const submit = () => {
    save.submit(scenario.id, choices, hintShown !== null);
    go({ name: 'result', scenarioId: scenario.id });
  };

  return (
    <Screen title={`${name}さんの相談`} footer={<PrimaryButton onClick={submit} disabled={!complete}>この構成で提案する</PrimaryButton>}>
      <Lines lines={intro.lines} customerName={name} />

      <section className="rounded-xl bg-slate-100 px-3 py-2">
        <h2 className="text-[11px] text-slate-500">ヒアリングメモ</h2>
        <p className="font-bold text-slate-900">最優先：{PILLAR_LABELS[top]}</p>
        {scenario.requirements.map((r) => (
          <p key={r.id} className="text-sm text-slate-800">必須：{r.text}</p>
        ))}
      </section>

      {scenario.decisions.map((d) => (
        <section key={d.id} className="space-y-2">
          <h2 className="font-bold text-slate-900">{d.prompt}</h2>
          {d.options.map((o, i) => {
            const on = choices[d.id] === o.id;
            return (
              <button
                key={o.id}
                type="button"
                aria-pressed={on}
                onClick={() => setChoices({ ...choices, [d.id]: o.id })}
                className={`w-full rounded-xl px-4 py-3 text-left text-sm ${on ? 'border-2 border-blue-600 bg-blue-50 font-bold' : 'border border-slate-300'}`}
              >
                <span className="text-slate-900">{String.fromCharCode(65 + i)}. {o.label}</span>
                <span className="mt-1 block text-[11px] font-normal text-slate-500">{o.services.map((s) => cardById.get(s)?.name ?? s).join('・')}</span>
              </button>
            );
          })}
          {hintShown === d.id ? (
            <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-slate-800">{d.hint}</p>
          ) : (
            hintShown === null && (
              <button type="button" onClick={() => setHintShown(d.id)} className="w-full text-center text-xs text-slate-500 underline">
                先輩にヒントを聞く（残り1回）
              </button>
            )
          )}
        </section>
      ))}
    </Screen>
  );
}
