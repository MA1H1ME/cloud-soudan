// 実績と、いまの目標。会社の状態から計算するだけで、保存するのは「祝った実績」だけ。UI や保存に依存しない純粋な定義。

/** 実績の判定に使う、会社の状態のまとめ */
export interface Facts {
  bestMonths: number;
  /** 予算の半額以下で◎を取った月があるか */
  halfBudgetBest: boolean;
  jobsAccepted: number;
  learned: number;
  learnedTotal: number;
  rank: number;
  staff: { ops: number; sales: number };
  staffMax: { ops: number; sales: number };
  gear: number;
  racks: number;
  maxRacks: number;
  reputation: number;
  examBest: number;
  examCount: number;
  seenRules: number;
  rulesTotal: number;
  ending: boolean;
  revenue: number;
}

export interface Achievement {
  id: string;
  title: string;
  desc: string;
  /** 最終目標（クリア後も目指すもの） */
  goal?: boolean;
  done: (f: Facts) => boolean;
  /** 進み具合（0〜1）。なければ出さない */
  progress?: (f: Facts) => number;
}

const ratio = (a: number, b: number) => Math.max(0, Math.min(1, b === 0 ? 0 : a / b));

export const ACHIEVEMENTS: Achievement[] = [
  { id: 'first-best', title: '初めての◎', desc: '月次報告で、4つの目標をすべて達成する', done: (f) => f.bestMonths >= 1 },
  { id: 'half-budget', title: '倹約家', desc: '予算の半額以下で、◎を取る', done: (f) => f.halfBudgetBest },
  { id: 'best-5', title: '安定の実力', desc: '◎を5回取る', done: (f) => f.bestMonths >= 5, progress: (f) => ratio(f.bestMonths, 5) },
  { id: 'jobs-5', title: '案件メールの常連', desc: '案件メールを5件受ける', done: (f) => f.jobsAccepted >= 5, progress: (f) => ratio(f.jobsAccepted, 5) },
  { id: 'jobs-20', title: '街の何でも屋', desc: '案件メールを20件受ける', done: (f) => f.jobsAccepted >= 20, progress: (f) => ratio(f.jobsAccepted, 20) },
  { id: 'learned-4', title: '障害対応の心得', desc: '4種類の障害に、正しく対応できる', done: (f) => f.learned >= 4, progress: (f) => ratio(f.learned, 4) },
  { id: 'learned-all', title: '障害対応の達人', desc: 'すべての種類の障害に、正しく対応できる', done: (f) => f.learned >= f.learnedTotal, progress: (f) => ratio(f.learned, f.learnedTotal) },
  { id: 'first-hire', title: '最初の仲間', desc: '社員を雇う', done: (f) => f.staff.ops + f.staff.sales > 0 },
  { id: 'staff-max', title: '精鋭チーム', desc: '運用担当と営業担当を、最高の等級まで育てる', done: (f) => f.staff.ops >= f.staffMax.ops && f.staff.sales >= f.staffMax.sales },
  { id: 'gear', title: '備えあれば', desc: '設備を設置する', done: (f) => f.gear >= 1 },
  { id: 'racks-max', title: '満杯のサーバールーム', desc: 'ラックを最大まで増やす', done: (f) => f.racks >= f.maxRacks },
  { id: 'rank-3', title: '町の頼れる会社', desc: '会社のランクを3つ目まで上げる', done: (f) => f.rank >= 2 },
  { id: 'rep-80', title: '絶好調', desc: '評判を80以上にする', done: (f) => f.reputation >= 80, progress: (f) => ratio(f.reputation, 80) },
  { id: 'exam-1', title: '腕試し', desc: '模擬試験を受ける', done: (f) => f.examCount >= 1 },
  { id: 'exam-pass', title: '合格の目安', desc: '模擬試験で、合格の目安（72%）に届く', done: (f) => f.examBest >= 0.72, progress: (f) => ratio(f.examBest, 0.72) },
  { id: 'exam-full', title: '満点合格', desc: '模擬試験で、全問正解する', done: (f) => f.examBest >= 1 },
  { id: 'rules-half', title: '勉強熱心', desc: '起きた出来事の解説を、半分以上読む（出会う）', done: (f) => f.seenRules * 2 >= f.rulesTotal, progress: (f) => ratio(f.seenRules, Math.ceil(f.rulesTotal / 2)) },
  { id: 'story', title: '一人前', desc: '本編の3人の契約をすべて終える', goal: true, done: (f) => f.ending },
  { id: 'revenue-1m', title: '業界の注目株', desc: '契約料の合計を、¥1,000,000 にする', goal: true, done: (f) => f.revenue >= 1000000, progress: (f) => ratio(f.revenue, 1000000) },
  { id: 'rules-all', title: '全部知っている', desc: '起きた出来事の解説を、すべて読む（出会う）', goal: true, done: (f) => f.seenRules >= f.rulesTotal, progress: (f) => ratio(f.seenRules, f.rulesTotal) },
];

export const doneIds = (f: Facts) => ACHIEVEMENTS.filter((a) => a.done(f)).map((a) => a.id);

/** いまの目標：まだ達成していない実績のうち、進み具合が大きいものから最大3つ（進み具合がないものは後ろ） */
export function currentGoals(f: Facts, n = 3): Achievement[] {
  return ACHIEVEMENTS.filter((a) => !a.done(f))
    .map((a, i) => ({ a, p: a.progress ? a.progress(f) : -1, i }))
    .sort((x, y) => y.p - x.p || x.i - y.i)
    .slice(0, n)
    .map((x) => x.a);
}
