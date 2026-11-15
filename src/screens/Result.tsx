// S5 結果：お客さんの反応、レーダーチャート、適合度、判定
import { customerById, scenarioById } from '../content';
import { PILLARS } from '../content/schema';
import { averageScores, bestChoices, evaluate, GRADE_LABELS, TRUST_GAIN } from '../engine/scoring';
import { go } from '../router';
import { useSave } from '../store';
import { Lines, PrimaryButton, Screen } from '../components/ui';
import { Radar } from '../components/Radar';

export function Result({ scenarioId }: { scenarioId: string }) {
  const scenario = scenarioById.get(scenarioId);
  const record = useSave((s) => s.history.findLast((h) => h.scenarioId === scenarioId));
  if (!scenario || !record) return <Screen title="結果が見つかりません">{null}</Screen>;

  const name = customerById.get(scenario.customerId)?.name ?? '';
  const result = evaluate(scenario, record.choices);
  const best = bestChoices(scenario);
  const bestScores = averageScores(
    scenario.decisions.map((d) => d.options.find((o) => o.id === best[d.id])!.scores),
  );
  const reaction = scenario.decisions.flatMap((d) => d.options.find((o) => o.id === record.choices[d.id])?.reaction ?? []);
  const top = PILLARS.reduce((a, b) => (scenario.weights[b] > scenario.weights[a] ? b : a));

  return (
    <Screen title={`${name}さんの反応`} footer={<PrimaryButton onClick={() => go({ name: 'explain', scenarioId })}>解説を読む</PrimaryButton>}>
      <Lines lines={reaction} customerName={name} />
      <Radar mine={result.scores} best={bestScores} emphasis={top} />
      <section className="rounded-xl border border-slate-300 px-4 py-3">
        <div className="flex items-baseline justify-between">
          <span className="text-2xl font-bold text-slate-900">適合度 {Math.round(result.fit)}</span>
          <span className="font-bold text-slate-900">{GRADE_LABELS[result.grade]}</span>
        </div>
        <p className="text-xs text-slate-500">{name}さんの信頼度 +{TRUST_GAIN[result.grade]}</p>
        {result.violated.length > 0 && (
          <p className="mt-2 text-sm text-red-700">
            必須条件を満たしていません：{result.violated.map((v) => scenario.requirements.find((r) => r.id === v)?.text ?? v).join('、')}
          </p>
        )}
      </section>
      <p className="text-center text-xs text-slate-500">★の軸が伸びているかを見る</p>
    </Screen>
  );
}
