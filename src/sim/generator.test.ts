import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { candidates, generateJob, jobTemplatesSchema } from './generator';
import { runMonth } from './engine';
import type { PartType } from './schema';

const dir = join(dirname(fileURLToPath(import.meta.url)), '../../content');
const t = jobTemplatesSchema.parse(parse(readFileSync(join(dir, 'jobs.yaml'), 'utf8')));
const UNLOCK: Record<string, number> = { alb: 2, 'rds-standby': 3, 'rds-replica': 3 };

describe('案件の自動生成', () => {
  for (const stage of [1, 2, 3]) {
    const unlocked = (p: PartType) => stage >= (UNLOCK[p] ?? 1);
    it(`段階${stage}：作った案件は、使える部品だけで最高評価を取れる`, () => {
      for (let seed = 1; seed <= 120; seed++) {
        const job = generateJob(seed, t, stage, unlocked);
        const plan = job.sim.months[0]!;
        const best = candidates(job.kind, unlocked).some((bp) => runMonth(job.sim.profitPerVisit, plan, bp).grade === 'best');
        expect(best, `seed ${seed}`).toBe(true);
        expect(runMonth(job.sim.profitPerVisit, plan, job.sim.start).grade, `seed ${seed}`).not.toBe('best');
      }
    });
  }
  it('同じ種からは同じ案件ができる', () => {
    const u = () => true;
    expect(generateJob(42, t, 3, u)).toEqual(generateJob(42, t, 3, u));
  });
  it('いろいろな案件ができる', () => {
    const u = () => true;
    const jobs = Array.from({ length: 60 }, (_, i) => generateJob(i + 1, t, 3, u));
    expect(new Set(jobs.map((j) => j.kind)).size).toBe(3);
    expect(new Set(jobs.map((j) => j.sim.priority)).size).toBe(4);
    expect(new Set(jobs.map((j) => j.business)).size).toBeGreaterThan(10);
  });
});
