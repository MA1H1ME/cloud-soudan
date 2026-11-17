import { describe, expect, it } from 'vitest';
import { EXAM_SIZE, pickQuestions, scoreExam, shuffle, type DomainId } from './exam';

const spots = [
  ...['a1', 'a2', 'a3'].map((id) => ({ id, conceptId: 'sec' })),
  ...['b1', 'b2', 'b3'].map((id) => ({ id, conceptId: 'res' })),
  ...['c1', 'c2'].map((id) => ({ id, conceptId: 'perf' })),
  ...['d1', 'd2', 'd3'].map((id) => ({ id, conceptId: 'cost' })),
];
const domainOf = (c: string): DomainId | undefined => ({ sec: 'secure', res: 'resilient', perf: 'performant', cost: 'cost' } as const)[c as 'sec'];

describe('模擬試験', () => {
  it('同じ種からは同じ問題と並びになる', () => {
    expect(pickQuestions(spots, domainOf, 7)).toEqual(pickQuestions(spots, domainOf, 7));
    expect(shuffle([1, 2, 3, 4, 5], 3)).toEqual(shuffle([1, 2, 3, 4, 5], 3));
  });
  it('問題は重ならず、4つの分野から選ばれる', () => {
    const q = pickQuestions(spots, domainOf, 1);
    expect(new Set(q).size).toBe(q.length);
    expect(q.length).toBe(Math.min(EXAM_SIZE, spots.length));
    const domains = new Set(q.map((id) => domainOf(spots.find((s) => s.id === id)!.conceptId)));
    expect(domains.size).toBe(4);
  });
  it('分野の問題が足りなければ、ほかの分野から選ぶ', () => {
    const q = pickQuestions(spots, domainOf, 1, 10);
    expect(q.filter((id) => id.startsWith('c')).length).toBe(2);
    expect(q.length).toBe(10);
  });
  it('分野ごとの正答数を数える', () => {
    const s = scoreExam([
      { spotId: 'a1', conceptId: 'sec', passed: true },
      { spotId: 'a2', conceptId: 'sec', passed: false },
      { spotId: 'b1', conceptId: 'res', passed: true },
    ], domainOf);
    expect(s.total).toBe(3);
    expect(s.correct).toBe(2);
    expect(s.byDomain.secure).toEqual({ total: 2, correct: 1 });
    expect(s.byDomain.cost).toEqual({ total: 0, correct: 0 });
  });
});
