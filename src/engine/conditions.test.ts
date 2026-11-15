import { describe, expect, it } from 'vitest';
import { check } from './conditions';

describe('check', () => {
  const state = {
    flags: { 'kashiwagi.db': 'single-az' },
    completedOn: { 'kashiwagi-01': '2026-12-01' },
    today: '2026-12-03',
  };

  it('柏木さんの帰結：シングルAZを選び、2日以上たっていれば発火する', () => {
    const cond = {
      type: 'all' as const,
      of: [
        { type: 'flag' as const, key: 'kashiwagi.db', equals: 'single-az' },
        { type: 'daysSince' as const, scenarioId: 'kashiwagi-01', min: 2 },
      ],
    };
    expect(check(cond, state)).toBe(true);
    expect(check(cond, { ...state, today: '2026-12-02' })).toBe(false);
    expect(check(cond, { ...state, flags: { 'kashiwagi.db': 'multi-az' } })).toBe(false);
  });

  it('未完了の相談は daysSince を満たさない', () => {
    expect(check({ type: 'daysSince', scenarioId: 'other', min: 0 }, state)).toBe(false);
  });
});
