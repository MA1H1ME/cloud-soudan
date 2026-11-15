// 復習キュー。仕様書「6. デイリータスクと復習」に対応する。
import type { Grade } from './scoring';
import type { Concept, ExamDomain } from '../content/schema';

export type Stage = 1 | 2 | 3 | 4 | 5;

export const INTERVAL_DAYS: Record<Stage, number> = { 1: 1, 2: 3, 3: 7, 4: 14, 5: 30 };
export const DAILY_REVIEW_LIMIT = 3;
export const PER_DOMAIN_LIMIT = 2;

export interface ReviewItem {
  conceptId: string;
  stage: Stage;
  dueOn: string;
  lapses: number;
  seen: { scenarioId: string; seenOn: string }[];
  mastered: boolean;
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** ストーリーでの結果から、復習キューに入れる最初の段階を決める。 */
export function initialStage(grade: Grade, usedHint: boolean, hitMisconception: boolean): Stage {
  if (grade === 'fair' || grade === 'fail' || hitMisconception) return 1;
  if (grade === 'good' || usedHint) return 2;
  return 3;
}

export function enqueue(
  conceptId: string,
  scenarioId: string,
  stage: Stage,
  today: string,
): ReviewItem {
  return {
    conceptId,
    stage,
    dueOn: addDays(today, INTERVAL_DAYS[stage]),
    lapses: stage === 1 ? 1 : 0,
    seen: [{ scenarioId, seenOn: today }],
    mastered: false,
  };
}

/** 復習の相談に答えたあとの更新。新しいオブジェクトを返す。 */
export function onReviewAnswered(
  item: ReviewItem,
  grade: Grade,
  scenarioId: string,
  today: string,
): ReviewItem {
  const seen = [...item.seen, { scenarioId, seenOn: today }];
  const ok = grade === 'best' || grade === 'good';
  if (!ok) {
    return { ...item, seen, stage: 1, lapses: item.lapses + 1, dueOn: addDays(today, INTERVAL_DAYS[1]) };
  }
  if (item.stage === 5) return { ...item, seen, mastered: true };
  const stage = (item.stage + 1) as Stage;
  return { ...item, seen, stage, dueOn: addDays(today, INTERVAL_DAYS[stage]) };
}

/** 今日出す復習を選ぶ：期限の古い順に最大3件、同じ試験分野は2件まで。 */
export function pickDueReviews(
  items: ReviewItem[],
  concepts: Map<string, Concept>,
  today: string,
): ReviewItem[] {
  const due = items
    .filter((i) => !i.mastered && i.dueOn <= today)
    .sort((a, b) => a.dueOn.localeCompare(b.dueOn) || a.conceptId.localeCompare(b.conceptId));
  const perDomain = new Map<ExamDomain, number>();
  const picked: ReviewItem[] = [];
  for (const item of due) {
    if (picked.length >= DAILY_REVIEW_LIMIT) break;
    const domain = concepts.get(item.conceptId)?.domain;
    if (!domain) continue;
    const n = perDomain.get(domain) ?? 0;
    if (n >= PER_DOMAIN_LIMIT) continue;
    perDomain.set(domain, n + 1);
    picked.push(item);
  }
  return picked;
}

/** 学習項目の復習用の相談から1件選ぶ：未見を優先、なければ最後に見た日が最も古いもの。 */
export function pickReviewScenario(item: ReviewItem, concept: Concept): string | undefined {
  const lastSeen = new Map<string, string>();
  for (const s of item.seen) lastSeen.set(s.scenarioId, s.seenOn);
  const unseen = concept.reviewScenarioIds.find((id) => !lastSeen.has(id));
  if (unseen) return unseen;
  return [...concept.reviewScenarioIds].sort((a, b) =>
    (lastSeen.get(a) ?? '').localeCompare(lastSeen.get(b) ?? ''),
  )[0];
}

/** ゲーム内の日付。端末のローカル時刻で午前4時に切り替える。 */
export function gameDate(now: Date, rolloverHour = 4): string {
  const shifted = new Date(now.getTime() - rolloverHour * 60 * 60 * 1000);
  const y = shifted.getFullYear();
  const m = String(shifted.getMonth() + 1).padStart(2, '0');
  const d = String(shifted.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
