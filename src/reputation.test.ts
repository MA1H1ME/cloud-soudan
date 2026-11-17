import { describe, expect, it } from 'vitest';
import { GRADE_FEE, MAX_REPUTATION, TIERS, nextReputation, tierIndex, tierOf } from './reputation';

describe('評判', () => {
  it('結果で上下する', () => {
    expect(nextReputation(30, 'best')).toBe(36);
    expect(nextReputation(30, 'fail')).toBe(22);
    expect(nextReputation(30, 'fair')).toBe(29);
  });
  it('0〜100に収まる', () => {
    expect(nextReputation(3, 'fail')).toBe(0);
    expect(nextReputation(98, 'best')).toBe(MAX_REPUTATION);
  });
  it('段階の境目', () => {
    expect([0, 19, 20, 49, 50, 79, 80, 100].map(tierIndex)).toEqual([0, 0, 1, 1, 2, 2, 3, 3]);
    expect(tierOf(10).name).toBe('悪評');
    expect(tierOf(90).name).toBe('絶好調');
  });
  it('悪評は不利、絶好調は有利になる', () => {
    expect(TIERS[0]!.fee).toBeLessThan(1);
    expect(TIERS[3]!.fee).toBeGreaterThan(TIERS[2]!.fee);
    expect(TIERS[3]!.mails).toBe(1);
  });
  it('△は7割、×は入らない', () => {
    expect(GRADE_FEE).toEqual({ best: 1, good: 1, fair: 0.7, fail: 0 });
  });
});
