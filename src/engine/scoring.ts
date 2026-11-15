// 提案の評価。仕様書「7. スコア／評価ロジック」に対応する。
import { PILLARS, type Decision, type Option, type PillarScores, type PillarWeights, type Scenario } from '../content/schema';

export type Grade = 'best' | 'good' | 'fair' | 'fail';

export const GRADE_THRESHOLDS = { best: 0.95, good: 0.85, fair: 0.6 } as const;
export const TRUST_GAIN: Record<Grade, number> = { best: 3, good: 2, fair: 1, fail: 0 };
export const GRADE_LABELS: Record<Grade, string> = {
  best: '◎ ベストフィット',
  good: '○ 良い提案',
  fair: '△ 改善の余地あり',
  fail: '× 見直しが必要',
};

/** 重みと点数から適合度（0〜100）を出す。丸めは表示側で行う。 */
export function fitScore(weights: PillarWeights, scores: PillarScores): number {
  let sum = 0;
  for (const p of PILLARS) sum += weights[p] * scores[p];
  return (sum / 5) * 100;
}

/** 判断ポイントが複数ある相談では、選んだ選択肢の点数を軸ごとに平均する。 */
export function averageScores(list: PillarScores[]): PillarScores {
  if (list.length === 0) throw new Error('averageScores: 空の配列');
  const out = { security: 0, reliability: 0, performance: 0, cost: 0, operations: 0 };
  for (const s of list) for (const p of PILLARS) out[p] += s[p] / list.length;
  return out;
}

function findOption(decision: Decision, optionId: string): Option {
  const opt = decision.options.find((o) => o.id === optionId);
  if (!opt) throw new Error(`選択肢が見つかりません: ${decision.id}/${optionId}`);
  return opt;
}

/** 必須条件に違反しない選択肢だけで取りうる最高の適合度。 */
export function maxFit(scenario: Scenario): number {
  // 適合度は各判断ポイントの点数の平均に対して線形なので、判断ポイントごとの最大の平均になる
  let total = 0;
  for (const d of scenario.decisions) {
    const candidates = d.options.filter((o) => o.violates.length === 0);
    if (candidates.length === 0) throw new Error(`必須条件を満たす選択肢がありません: ${scenario.id}/${d.id}`);
    total += Math.max(...candidates.map((o) => fitScore(scenario.weights, o.scores)));
  }
  return total / scenario.decisions.length;
}

export interface Evaluation {
  scores: PillarScores;
  fit: number;
  maxFit: number;
  ratio: number;
  grade: Grade;
  violated: string[];
  misconceptions: string[];
}

/** choices: decisionId → optionId */
export function evaluate(scenario: Scenario, choices: Record<string, string>): Evaluation {
  const chosen = scenario.decisions.map((d) => {
    const optionId = choices[d.id];
    if (!optionId) throw new Error(`未回答の判断ポイント: ${scenario.id}/${d.id}`);
    return findOption(d, optionId);
  });
  const scores = averageScores(chosen.map((o) => o.scores));
  const fit = fitScore(scenario.weights, scores);
  const best = maxFit(scenario);
  const ratio = fit / best;
  const violated = [...new Set(chosen.flatMap((o) => o.violates))];
  const misconceptions = chosen.flatMap((o) => (o.misconception ? [o.misconception] : []));

  let grade: Grade;
  if (violated.length > 0) grade = 'fail';
  else if (ratio >= GRADE_THRESHOLDS.best) grade = 'best';
  else if (ratio >= GRADE_THRESHOLDS.good) grade = 'good';
  else if (ratio >= GRADE_THRESHOLDS.fair) grade = 'fair';
  else grade = 'fail';

  return { scores, fit, maxFit: best, ratio, grade, violated, misconceptions };
}

/** その相談で最も適合度が高い選び方（レーダーチャートの点線用）。 */
export function bestChoices(scenario: Scenario): Record<string, string> {
  const out: Record<string, string> = {};
  for (const d of scenario.decisions) {
    const candidates = d.options.filter((o) => o.violates.length === 0);
    const top = candidates.reduce((a, b) =>
      fitScore(scenario.weights, b.scores) > fitScore(scenario.weights, a.scores) ? b : a,
    );
    out[d.id] = top.id;
  }
  return out;
}
