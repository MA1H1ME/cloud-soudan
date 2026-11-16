import { describe, expect, it } from 'vitest';
import { addDays, enqueue, gameDate, onReviewAnswered, pickDueReviews } from './review';
import type { Concept } from '../content/schema';

describe('onReviewAnswered', () => {
  const base = enqueue('rds', 'kashiwagi-01', 1, '2026-12-01');

  it('正解で1段階上がり、間隔が広がる', () => {
    expect(base.dueOn).toBe('2026-12-02');
    const next = onReviewAnswered(base, 'good', 'guest-a', '2026-12-02');
    expect(next.stage).toBe(2);
    expect(next.dueOn).toBe('2026-12-05');
  });

  it('△か×なら段階1に戻る', () => {
    const item = { ...base, stage: 4 as const };
    const next = onReviewAnswered(item, 'fair', 'guest-a', '2026-12-10');
    expect(next.stage).toBe(1);
    expect(next.lapses).toBe(2);
    expect(next.dueOn).toBe('2026-12-11');
  });

  it('段階5で正解すると定着になる', () => {
    const next = onReviewAnswered({ ...base, stage: 5 }, 'best', 'guest-a', '2027-01-30');
    expect(next.mastered).toBe(true);
  });
});

describe('pickDueReviews', () => {
  const concepts = new Map<string, Concept>(
    (['a', 'b', 'c', 'd'] as const).map((id, i) => [
      id,
      { id, title: id, domain: i < 3 ? 'resilient' : 'secure', requires: [], reviewScenarioIds: [] },
    ]),
  );
  const item = (conceptId: string, dueOn: string) => ({ ...enqueue(conceptId, 's', 1, '2026-12-01'), dueOn });

  it('期限の古い順に最大3件、同じ分野は2件まで', () => {
    const picked = pickDueReviews(
      [item('a', '2026-12-01'), item('b', '2026-12-02'), item('c', '2026-12-03'), item('d', '2026-12-04'), item('a', '2027-01-01')],
      concepts,
      '2026-12-10',
    );
    expect(picked.map((p) => `${p.conceptId}@${p.dueOn}`)).toEqual(['a@2026-12-01', 'b@2026-12-02', 'd@2026-12-04']);
  });
});

describe('日付', () => {
  it('午前4時より前は前日扱い', () => {
    expect(gameDate(new Date(2026, 11, 2, 3, 59))).toBe('2026-12-01');
    expect(gameDate(new Date(2026, 11, 2, 4, 0))).toBe('2026-12-02');
  });
  it('月をまたぐ加算', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });
});
