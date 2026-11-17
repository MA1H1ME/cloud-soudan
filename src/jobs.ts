// お客さんを ID から引く。本編のお客さん（content/sim）と、メールで届く自動生成の案件の両方を扱う。
// 生成した案件の ID には種と解禁段階が入っている（job-<種>-s<段階>）ので、ID だけで同じ案件を作り直せる。
import { content, customerById, simByCustomer } from './content';
import { UNLOCK_MONTH } from './guide';
import { generateJob, rng, type GeneratedJob } from './sim/generator';
import { REFERRAL_CANDIDATES } from './reputation';
import type { PartType, SimCustomer } from './sim/schema';

const cache = new Map<string, GeneratedJob | null>();

export const unlockedAt = (stage: number) => (p: PartType) => stage >= (UNLOCK_MONTH[p] ?? 1);

export function jobId(seed: number, stage: number) {
  return `job-${seed}-s${stage}`;
}

export function jobFor(id: string): GeneratedJob | undefined {
  if (!id.startsWith('job-')) return undefined;
  if (!cache.has(id)) {
    const m = /^job-(\d+)-s(\d+)$/.exec(id);
    let job: GeneratedJob | null = null;
    if (m) {
      try {
        const stage = Number(m[2]);
        job = { ...generateJob(Number(m[1]), content.jobs, stage, unlockedAt(stage)), id };
        job.sim = { ...job.sim, customerId: id };
      } catch {
        job = null;
      }
    }
    cache.set(id, job);
  }
  return cache.get(id) ?? undefined;
}

export function simFor(id: string): SimCustomer | undefined {
  return simByCustomer.get(id) ?? jobFor(id)?.sim;
}

export function nameFor(id: string): string {
  return customerById.get(id)?.name ?? jobFor(id)?.name ?? id;
}

export function businessFor(id: string): string {
  return customerById.get(id)?.business ?? jobFor(id)?.business ?? '';
}

export const isStory = (id: string) => simByCustomer.has(id);

/**
 * その日に届く案件メール。日付と段階から決まる。
 * 慣れるまで（early）は1日1件、そのあとは2〜3件（営業担当の等級で増える）。同じ業種・種類・難しさの案件は1日に1件まで。
 */
export function mailsForDay(day: number, stage: number, extra = 0, early = false): string[] {
  const r = rng(day * 9973 + 17);
  const n = early ? 1 : Math.max(1, r.int(2, 3) + extra);
  const out: string[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < 10 && out.length < n; i++) {
    const id = jobId(day * 10 + i, stage);
    const job = jobFor(id);
    if (!job) continue;
    const sig = `${job.business}/${job.kind}/${job.level}`;
    if (seen.has(sig)) continue;
    seen.add(sig);
    out.push(id);
  }
  return out;
}

/** メールの期限（届いた日を含めて何日残るか） */
export const MAIL_DAYS = 2;

/** ◎のあとに届く紹介案件。何件か候補を作って、いちばん難しいものを選ぶ（同じ日・同じ段階なら、いつも同じもの） */
export function referralId(clock: number, stage: number): string {
  let best = jobId(500000 + clock * 10, stage);
  let level = jobFor(best)?.level ?? 0;
  for (let i = 1; i < REFERRAL_CANDIDATES; i++) {
    const id = jobId(500000 + clock * 10 + i, stage);
    const l = jobFor(id)?.level ?? 0;
    if (l > level) { best = id; level = l; }
  }
  return best;
}
