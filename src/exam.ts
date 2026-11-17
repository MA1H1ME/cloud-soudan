// 模擬試験：スポット案件（構成を見て、1手選ぶ）から問題を選び、分野ごとの正答率を出す。
// 問題は新しく作らず、照合済みのスポット案件だけを使う。合否は運用シムの計算で決まる（選択肢ごとの正誤は持たない）。
import { rng } from './sim/generator';

export const EXAM_DOMAINS = [
  { id: 'secure', label: 'セキュアな設計' },
  { id: 'resilient', label: '回復力のある設計' },
  { id: 'performant', label: '高パフォーマンスな設計' },
  { id: 'cost', label: 'コスト最適化' },
] as const;
export type DomainId = (typeof EXAM_DOMAINS)[number]['id'];

export const EXAM_SIZE = 10;
/** 1問あたりの目安時間（秒）。制限時間は 問題数 × これ */
export const SECONDS_PER_QUESTION = 90;

/** 種から決まる並べ替え */
export function shuffle<T>(xs: readonly T[], seed: number): T[] {
  const r = rng(seed);
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = r.int(0, i);
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

export interface ExamSpot { id: string; conceptId: string }

/**
 * 問題を選ぶ。4つの分野から順番に1問ずつ取り、足りない分野は飛ばす。
 * 同じ種からは、いつも同じ問題・同じ並びになる。
 */
export function pickQuestions(spots: readonly ExamSpot[], domainOf: (conceptId: string) => DomainId | undefined, seed: number, n = EXAM_SIZE): string[] {
  const byDomain = new Map<DomainId, string[]>();
  for (const [i, d] of EXAM_DOMAINS.entries()) {
    byDomain.set(d.id, shuffle(spots.filter((s) => domainOf(s.conceptId) === d.id).map((s) => s.id), seed + i));
  }
  const picked: string[] = [];
  while (picked.length < n && [...byDomain.values()].some((v) => v.length > 0)) {
    for (const d of EXAM_DOMAINS) {
      const next = byDomain.get(d.id)!.shift();
      if (next && picked.length < n) picked.push(next);
    }
  }
  return shuffle(picked, seed + 99);
}

export interface Answered { spotId: string; conceptId: string; passed: boolean }

export interface ExamScore {
  total: number;
  correct: number;
  byDomain: Record<DomainId, { total: number; correct: number }>;
}

export function scoreExam(answers: readonly Answered[], domainOf: (conceptId: string) => DomainId | undefined): ExamScore {
  const byDomain = Object.fromEntries(EXAM_DOMAINS.map((d) => [d.id, { total: 0, correct: 0 }])) as ExamScore['byDomain'];
  for (const a of answers) {
    const d = domainOf(a.conceptId);
    if (!d) continue;
    byDomain[d].total++;
    if (a.passed) byDomain[d].correct++;
  }
  return { total: answers.length, correct: answers.filter((a) => a.passed).length, byDomain };
}

/** 本番の合格ラインの目安（72%）。ゲームの目安であり、実際の合否とは関係ない */
export const PASS_LINE = 0.72;
