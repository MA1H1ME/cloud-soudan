import { describe, expect, it } from 'vitest';
import { bestChoices, evaluate, fitScore, maxFit } from './scoring';
import type { PillarScores, PillarWeights, Scenario } from '../content/schema';

// 仕様書「7. 計算例」の数値をそのまま検証する
const costFirst: PillarWeights = { security: 0.1, reliability: 0.2, performance: 0.1, cost: 0.45, operations: 0.15 };
const availabilityFirst: PillarWeights = { security: 0.1, reliability: 0.45, performance: 0.15, cost: 0.15, operations: 0.15 };

const s = (security: number, reliability: number, performance: number, cost: number, operations: number): PillarScores => ({
  security, reliability, performance, cost, operations,
});
const A = s(3, 2, 3, 5, 3);
const B = s(3, 4, 3, 3, 4);
const C = s(3, 3, 4, 3, 2);
const D = s(3, 5, 4, 1, 4);

const line = [{ speaker: 'customer' as const, text: '…' }];
const opt = (id: string, scores: PillarScores, violates: string[] = []) => ({
  id, label: id, services: [], scores, scoreNotes: {}, violates, setFlags: {}, reaction: line, explanation: '…',
});
const scenario = (weights: PillarWeights): Scenario => ({
  id: 'test', kind: 'story', customerId: 'c', title: 't', weights,
  requirements: [], prerequisites: [], intros: [{ lines: line }], outro: [], unlocks: [], sources: [],
  review: { status: 'draft' },
  decisions: [{
    id: 'db', conceptId: 'x', prompt: 'p', hint: 'h', examPoint: 'e',
    options: [opt('a', A), opt('b', B), opt('c', C), opt('d', D)],
  }],
});

describe('fitScore', () => {
  it.each([
    ['A', A, 74, 57],
    ['B', B, 67, 72],
    ['C', C, 59, 60],
    ['D', D, 55, 78],
  ])('選択肢%s', (_name, scores, cost, availability) => {
    expect(Math.round(fitScore(costFirst, scores))).toBe(cost);
    expect(Math.round(fitScore(availabilityFirst, scores))).toBe(availability);
  });
});

describe('evaluate', () => {
  it('コスト優先の客にはAが◎、Bが○、C・Dが△', () => {
    const sc = scenario(costFirst);
    expect(evaluate(sc, { db: 'a' }).grade).toBe('best');
    expect(evaluate(sc, { db: 'b' }).grade).toBe('good');
    expect(evaluate(sc, { db: 'c' }).grade).toBe('fair');
    expect(evaluate(sc, { db: 'd' }).grade).toBe('fair');
    expect(bestChoices(sc)).toEqual({ db: 'a' });
  });

  it('可用性優先の客にはDが◎、Bが○、A・Cが△', () => {
    const sc = scenario(availabilityFirst);
    expect(evaluate(sc, { db: 'd' }).grade).toBe('best');
    expect(evaluate(sc, { db: 'b' }).grade).toBe('good');
    expect(evaluate(sc, { db: 'a' }).grade).toBe('fair');
    expect(evaluate(sc, { db: 'c' }).grade).toBe('fair');
    expect(bestChoices(sc)).toEqual({ db: 'd' });
  });

  it('必須条件に違反する選択肢は適合度にかかわらず×で、最高値の計算からも外れる', () => {
    const sc = scenario(costFirst);
    sc.decisions[0]!.options[0] = opt('a', A, ['https']);
    const e = evaluate(sc, { db: 'a' });
    expect(e.grade).toBe('fail');
    expect(e.violated).toEqual(['https']);
    expect(Math.round(maxFit(sc))).toBe(67);
  });

  it('判断ポイントが2つある相談は軸ごとの平均で評価する', () => {
    const sc = scenario(costFirst);
    sc.decisions.push({ ...sc.decisions[0]!, id: 'web' });
    const e = evaluate(sc, { db: 'a', web: 'b' });
    expect(e.fit).toBeCloseTo((fitScore(costFirst, A) + fitScore(costFirst, B)) / 2);
  });
});
