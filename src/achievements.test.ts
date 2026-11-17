import { describe, expect, it } from 'vitest';
import { ACHIEVEMENTS, currentGoals, doneIds, type Facts } from './achievements';

const base: Facts = {
  bestMonths: 0, halfBudgetBest: false, jobsAccepted: 0, learned: 0, learnedTotal: 7, rank: 0,
  staff: { ops: 0, sales: 0 }, staffMax: { ops: 2, sales: 3 }, gear: 0, racks: 3, maxRacks: 6, reputation: 30,
  examBest: 0, examCount: 0, seenRules: 0, rulesTotal: 30, ending: false, revenue: 0,
};

describe('実績', () => {
  it('はじめは1つも達成していない', () => {
    expect(doneIds(base)).toEqual([]);
  });
  it('id は重ならない', () => {
    expect(new Set(ACHIEVEMENTS.map((a) => a.id)).size).toBe(ACHIEVEMENTS.length);
  });
  it('状態に応じて達成される', () => {
    const f: Facts = { ...base, bestMonths: 5, learned: 7, staff: { ops: 2, sales: 3 }, examBest: 1, examCount: 2, seenRules: 15 };
    const done = doneIds(f);
    expect(done).toEqual(expect.arrayContaining(['first-best', 'best-5', 'learned-4', 'learned-all', 'first-hire', 'staff-max', 'exam-1', 'exam-pass', 'exam-full', 'rules-half']));
    expect(done).not.toContain('story');
  });
  it('いまの目標は、進み具合の大きいものから最大3つ', () => {
    const goals = currentGoals({ ...base, jobsAccepted: 4, reputation: 78 });
    expect(goals).toHaveLength(3);
    expect(goals.map((g) => g.id)).toContain('rep-80');
    expect(goals.map((g) => g.id)).toContain('jobs-5');
    expect(goals.every((g) => !g.done({ ...base, jobsAccepted: 4, reputation: 78 }))).toBe(true);
  });
  it('達成済みは目標に出ない', () => {
    const f = { ...base, jobsAccepted: 5 };
    expect(currentGoals(f, 30).map((g) => g.id)).not.toContain('jobs-5');
  });
});
