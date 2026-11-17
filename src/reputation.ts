// 会社の評判。月次報告の結果で上下し、届く案件の数・報酬・紹介に効く。UI や保存に依存しない純粋な定義。
import type { Grade } from './sim/engine';

export const START_REPUTATION = 30;
export const MAX_REPUTATION = 100;

/** 結果ごとの評判の増減 */
export const GRADE_REPUTATION: Record<Grade, number> = { best: 6, good: 3, fair: -1, fail: -8 };
/** 結果ごとの契約料の割合（◎・○は満額、△は7割、×は入らない） */
export const GRADE_FEE: Record<Grade, number> = { best: 1, good: 1, fair: 0.7, fail: 0 };

export const clampReputation = (n: number) => Math.max(0, Math.min(MAX_REPUTATION, n));
export const nextReputation = (current: number, grade: Grade) => clampReputation(current + GRADE_REPUTATION[grade]);

export interface Tier { min: number; name: string; /** 案件メールの報酬の倍率 */ fee: number; /** 案件メールの件数の増減（1日あたり） */ mails: number; note: string }
/** 評判の段階 */
export const TIERS: Tier[] = [
  { min: 0, name: '悪評', fee: 0.9, mails: -1, note: '案件メールが減り、報酬も1割下がる' },
  { min: 20, name: '普通', fee: 1, mails: 0, note: '' },
  { min: 50, name: '良好', fee: 1.1, mails: 0, note: '案件メールの報酬が1割増える' },
  { min: 80, name: '絶好調', fee: 1.2, mails: 1, note: '案件メールが増え、報酬も2割増える' },
];
export const tierIndex = (reputation: number) => TIERS.reduce((acc, t, i) => (reputation >= t.min ? i : acc), 0);
export const tierOf = (reputation: number) => TIERS[tierIndex(reputation)]!;

/** ◎のあとに届く、紹介案件の報酬の倍率と、返事の期限（日数）の上乗せ */
export const REFERRAL_FEE = 1.5;
export const REFERRAL_EXTRA_DAYS = 1;
/** 紹介案件の種を作るときの候補数（いちばん難しいものを選ぶ） */
export const REFERRAL_CANDIDATES = 6;
