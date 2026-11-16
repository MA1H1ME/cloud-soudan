import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { z } from 'zod';
import { judgeSpot, spotSchema } from './spot';

const file = join(dirname(fileURLToPath(import.meta.url)), '../../content/spots.yaml');
const spots = z.array(spotSchema).parse(parse(readFileSync(file, 'utf8')));
const passing = (id: string) => {
  const s = spots.find((x) => x.id === id)!;
  return s.options.filter((o) => judgeSpot(s, o.id).passed).map((o) => o.id);
};

describe('スポット案件', () => {
  it('どの案件にも、合格する選択肢と不合格の選択肢がある', () => {
    for (const s of spots) {
      const n = s.options.filter((o) => judgeSpot(s, o.id).passed).length;
      expect([s.id, n > 0 && n < s.options.length]).toEqual([s.id, true]);
    }
  });

  it('合格する選択肢は、意図したものだけ', () => {
    expect(passing('spot-photo-studio')).toEqual(['standby']);
    expect(passing('spot-flower-shop')).toEqual(['none']); // 同じ知識でも、優先度が違えば答えが変わる
    expect(passing('spot-neighborhood')).toEqual(['backup']);
    expect(passing('spot-architect')).toEqual(['standby']);
    expect(passing('spot-theater')).toEqual(['alb-second']);
    expect(passing('spot-local-news')).toEqual(['asg']);
    expect(passing('spot-city-hall')).toEqual(['alb-second']);
    expect(passing('spot-video-class')).toEqual(['alb']);
    expect(passing('spot-dental')).toEqual(['close']);
    expect(passing('spot-zakka')).toEqual(['close']);
    expect(passing('spot-school-prints')).toEqual(['private']);
    expect(passing('spot-realtor')).toEqual(['private']);
    expect(passing('spot-print-shop')).toEqual(['role-scoped']);
    expect(passing('spot-survey')).toEqual(['role-scoped']);
    expect(passing('spot-cafe-site')).toEqual(['cf']);
    expect(passing('spot-band')).toEqual(['cf']);
    expect(passing('spot-photo-archive')).toEqual(['lifecycle']);
    expect(passing('spot-newsletter')).toEqual(['lifecycle']);
  });
});
