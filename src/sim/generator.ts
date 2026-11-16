// 日々のメールで届く案件を、ひな形（content/jobs.yaml）から組み合わせて作る。
// 乱数は種（seed）から決まるので、同じ種からはいつも同じ案件ができる。セーブには種だけを残す。
// AIで文章を作るのではなく、決まった部品を組み合わせるだけ。正誤と結果はエンジンが計算する。
// 作った案件は、最高評価を取れる構成があるかを総当たりで確かめ、なければ捨てて作り直す。
import { z } from 'zod';
import { runMonth } from './engine';
import type { Blueprint, CheckType, MonthPlan, PartType, SimCustomer } from './schema';

export const jobTemplatesSchema = z.object({
  surnames: z.array(z.string()).min(5),
  givens: z.array(z.string()).min(5),
  web: z.array(z.object({ business: z.string(), thing: z.string(), peak: z.array(z.string()).min(1) })).min(1),
  files: z.array(z.object({ business: z.string(), file: z.string(), holder: z.string() })).min(1),
  static: z.array(z.object({ business: z.string(), peak: z.array(z.string()).min(1) })).min(1),
  priorityLines: z.object({ cost: z.string(), reliability: z.string(), security: z.string(), performance: z.string() }),
});
export type JobTemplates = z.infer<typeof jobTemplatesSchema>;

export type JobKind = 'web' | 'files' | 'static';
export type Priority = SimCustomer['priority'];

export interface GeneratedJob {
  id: string;
  seed: number;
  name: string;
  business: string;
  kind: JobKind;
  /** 難しさ（星1〜3） */
  level: number;
  sim: SimCustomer;
}

/** 種から決まる乱数（mulberry32） */
export function rng(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (min: number, max: number) => min + Math.floor(next() * (max - min + 1)),
    pick: <T,>(xs: readonly T[]): T => xs[Math.floor(next() * xs.length)]!,
    chance: (p: number) => next() < p,
  };
}

const BASE: Blueprint = {
  slots: { public: null, 'app-a': 'ec2', 'app-c': null, 'data-a': 'rds', 'data-c': null },
  backup: true, autoScaling: false, dbPublic: false, dbSgOpen: false, s3Public: false,
  site: 'none', lifecycle: false, credential: 'role-scoped',
};

/** 総当たりで試す構成（安全な設定のもの）。使える部品だけで組む */
export function candidates(kind: JobKind, unlocked: (p: PartType) => boolean): Blueprint[] {
  if (kind === 'static') {
    return (['ec2', 's3-website', 's3-cloudfront'] as const).flatMap((site) => [false, true].map((lifecycle) => ({ ...BASE, slots: { ...BASE.slots, 'app-a': null, 'data-a': null }, site, lifecycle, backup: false })));
  }
  const out: Blueprint[] = [];
  for (const pub of [null, 'alb'] as const) {
    if (pub && !unlocked('alb')) continue;
    for (const appC of [null, 'ec2'] as const) {
      for (const dataC of [null, 'rds-standby', 'rds-replica'] as const) {
        if (dataC && !unlocked(dataC)) continue;
        for (const backup of [false, true]) {
          for (const autoScaling of pub ? [false, true] : [false]) {
            out.push({ ...BASE, slots: { ...BASE.slots, public: pub, 'app-c': appC, 'data-c': dataC }, backup, autoScaling });
          }
        }
      }
    }
  }
  return out;
}

const yen = (n: number) => `¥${Math.round(n).toLocaleString('ja-JP')}`;

/** 目標をすべて満たす構成のうち、いちばん安いもの（模範の構成）。なければ undefined */
export function modelAnswer(profit: number, plan: MonthPlan, kind: JobKind, unlocked: (p: PartType) => boolean): Blueprint | undefined {
  let best: { bp: Blueprint; cost: number } | undefined;
  for (const bp of candidates(kind, unlocked)) {
    const r = runMonth(profit, plan, bp);
    if (r.grade === 'best' && (!best || r.cost < best.cost)) best = { bp, cost: r.cost };
  }
  return best?.bp;
}

/** 予算を除いた3つの目標を満たす構成のうち、いちばん安いものの費用 */
function cheapestBest(profit: number, plan: MonthPlan, cands: Blueprint[]): number | null {
  let min: number | null = null;
  for (const bp of cands) {
    const r = runMonth(profit, { ...plan, budget: Number.MAX_SAFE_INTEGER }, bp);
    if (r.kpi.uptime && r.kpi.performance && r.kpi.security && (min === null || r.cost < min)) min = r.cost;
  }
  return min;
}

/**
 * 案件を1つ作る。解けない組み合わせになったら、種をずらして作り直す。
 * stage：部品の解禁の進み具合。unlocked：その部品を使えるか。
 */
export function generateJob(seed: number, t: JobTemplates, stage: number, unlocked: (p: PartType) => boolean): GeneratedJob {
  for (let attempt = 0; attempt < 40; attempt++) {
    const job = tryGenerate(seed, seed * 131 + attempt * 7919, t, stage, unlocked);
    if (job) return job;
  }
  throw new Error(`案件を作れませんでした（seed ${seed}）`);
}

function tryGenerate(seed: number, salt: number, t: JobTemplates, stage: number, unlocked: (p: PartType) => boolean): GeneratedJob | null {
  const r = rng(salt);
  const kinds: JobKind[] = stage >= 2 ? ['web', 'web', 'files', 'static'] : ['web'];
  const kind = r.pick(kinds);
  const priority = r.pick(['cost', 'reliability', 'security', 'performance'] as const);
  const name = `${r.pick(t.surnames)} ${r.pick(t.givens)}`;
  const events: MonthPlan['events'] = [];
  const reqs: NonNullable<SimCustomer['hearing']>['requirements'] = [];
  const req = (id: string, check: CheckType, label: string) => reqs.push({ id, check, label, unknown: label, given: true });
  let business: string;
  let profitPerVisit: number;
  let visitsPerDay: number;
  let start: Blueprint;
  const features: SimCustomer['features'] = [];

  // 難しさ（出来事の数）を先に決める。序盤は易しい案件を多めにする
  const level = r.pick(stage >= 3 ? [1, 2, 2, 3, 3] : [1, 1, 1, 2, 2, 3]);
  /** 必ず入る要素 → お客さんの最優先に関わる要素 → 残りから無作為、の順で level 個まで選ぶ */
  const choose = (must: string[], prefer: string[], rest: string[]) => {
    const out = [...must];
    for (const x of prefer) if (out.length < level && !out.includes(x)) out.push(x);
    const pool = rest.filter((x) => !out.includes(x));
    while (out.length < level && pool.length) out.push(pool.splice(Math.floor(r.next() * pool.length), 1)[0]!);
    return out;
  };

  if (kind === 'static') {
    const tpl = r.pick(t.static);
    business = tpl.business;
    profitPerVisit = r.pick([0.3, 0.4, 0.5]);
    visitsPerDay = r.int(8, 30) * 100;
    start = { ...BASE, slots: { ...BASE.slots, 'app-a': null, 'data-a': null }, backup: false, site: 'ec2' };
    const aspects = choose(['peak'], priority === 'security' ? ['https'] : priority === 'cost' ? ['storage'] : [], ['https', 'storage']);
    const peak = r.pick(tpl.peak);
    const factor = r.pick([3, 5, 8]);
    events.push({ day: r.int(6, 14), type: 'spike', label: peak, factor, days: 2 });
    req('peak', 'peak', `アクセスのピーク：${peak}で約${factor}倍`);
    if (aspects.includes('https')) {
      events.push({ day: r.int(16, 22), type: 'https-check', label: '読者からの問い合わせ' });
      req('https', 'https', 'アドレスバーに鍵マークを出す（HTTPS）');
    }
    if (aspects.includes('storage')) {
      events.push({ day: 28, type: 'storage-review', label: '保存料の見直し' });
      req('storage', 'storage', '写真は毎月増える。古い写真はほとんど見られない');
    }
    events.push({ day: 30, type: 'invoice', label: '今月の請求書' });
  } else {
    const tpl = kind === 'files' ? r.pick(t.files) : r.pick(t.web);
    business = tpl.business;
    const thing = 'thing' in tpl ? tpl.thing : '予約';
    profitPerVisit = r.int(5, 20);
    visitsPerDay = r.int(5, 16) * 100;
    start = { ...BASE, backup: r.chance(0.5) };
    const files = kind === 'files' && 'file' in tpl;
    const prefer = { performance: ['peak'], reliability: ['failure'], security: files ? ['audit', 'probe'] : ['probe'], cost: [] }[priority];
    // 読み込みの急増（リードレプリカで受ける）は、レプリカを使える段階3から
    const reads = stage >= 3 ? ['reads'] : [];
    const aspects = choose(files ? ['bucket'] : [], prefer, files ? ['peak', 'failure', 'probe', 'audit', ...reads] : ['peak', 'failure', 'probe', ...reads]);
    if (aspects.includes('peak')) {
      const peak = 'peak' in tpl ? r.pick(tpl.peak) : '繁忙期';
      const factor = r.pick([1.6, 2, 2.4]);
      events.push({ day: r.int(5, 12), type: 'spike', label: peak, factor, days: r.int(2, 3) });
      req('peak', 'peak', `アクセスのピーク：${peak}で約${factor}倍`);
    }
    if (aspects.includes('failure')) {
      const type = stage >= 3 && r.chance(0.5) ? 'az-outage' : 'db-failure';
      events.push({ day: r.int(14, 22), type, label: type === 'az-outage' ? 'AZ-a の障害' : 'データベースの障害' });
      req('data', 'data', `${thing}の記録は必ず残す`);
      if (priority === 'reliability') req('downtime', 'downtime', '止まってよい長さ：半日まで');
    }
    if (aspects.includes('reads')) {
      const label = r.pick(['月末の売上集計', '在庫の棚卸し', '年間レポートの作成']);
      events.push({ day: r.int(22, 26), type: 'read-surge', label, days: 3 });
      req('reads', 'reads', `${label}で、データベースの読み込みが3日間増える`);
    }
    if (aspects.includes('probe')) {
      events.push({ day: r.int(20, 27), type: 'probe', label: 'データベースへの不審なアクセス' });
      req('secure-db', 'secure-db', 'データベースには個人情報が入る。外から届かないこと');
      start = { ...start, dbPublic: true, dbSgOpen: r.chance(0.7) };
    }
    if (files) {
      features.push('files');
      events.push({ day: r.int(8, 15), type: 'bucket-probe', label: `${tpl.file}のURLの共有` });
      req('s3-private', 's3-private', `${tpl.file}は${tpl.holder}本人にだけ渡す`);
      start = { ...start, s3Public: r.chance(0.7), credential: r.pick(['access-key', 'role-full'] as const) };
      if (aspects.includes('audit')) {
        events.push({ day: r.int(24, 28), type: 'audit', label: 'セキュリティ審査' });
        req('no-keys', 'no-keys', 'サーバーに長期のキーを置かない');
        req('least-privilege', 'least-privilege', '権限は必要な分だけにする');
      } else start = { ...start, credential: 'role-scoped' };
    }
    if (events.length === 0) return null;
  }

  const uptimeTarget = priority === 'reliability' && kind !== 'static' ? 0.995 : 0.98;
  const draft: MonthPlan = { month: 1, visitsPerDay, budget: 0, uptimeTarget, brief: '', events: events.sort((a, b) => a.day - b.day) };
  // 予算は「目標を満たす最も安い構成」の費用に、ゆとりを足して決める。これで必ず解ける
  const cands = candidates(kind, unlocked);
  const min = cheapestBest(profitPerVisit, draft, cands);
  if (min === null) return null;
  const slack = priority === 'cost' ? 1.05 : r.pick([1.2, 1.35, 1.5]);
  const budget = Math.max(1000, Math.ceil((min * slack) / 1000) * 1000);
  const plan: MonthPlan = { ...draft, budget };
  // 最初の構成のままで最高評価が取れる案件は、手を動かす意味がないので作らない
  if (runMonth(profitPerVisit, plan, start).grade === 'best') return null;
  reqs.unshift({ id: 'budget', check: 'budget', label: `予算：月 ${yen(budget)} まで`, unknown: '予算', given: true });

  const contractFee = Math.round((8000 + level * 7000 + (priority === 'cost' ? 0 : 3000)) / 1000) * 1000;
  const pitch = `${business}をやっています。${t.priorityLines[priority]}予算は月${yen(budget)}までです。`;
  plan.brief = pitch;
  const id = `job-${seed}`;
  return {
    id, seed, name, business, kind, level,
    sim: {
      customerId: id, profitPerVisit, contractFee, priority, features, start,
      request: { pitch },
      hearing: { opening: pitch, maxQuestions: 0, questions: [{ id: 'none', text: '—', answer: '—' }], requirements: reqs },
      months: [plan],
      comments: {
        best: '期待以上です。また何かあればお願いします',
        good: 'おおむね満足です。1つだけ気になる点がありました',
        fair: '正直、少し不安な1か月でした',
        fail: 'これでは困ります。ほかを当たることにします',
      },
    },
  };
}
