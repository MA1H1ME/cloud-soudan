// 運用シムの計算。構成（ブループリント）とその月の出来事から、30日分の結果を出す。
// 乱数は使わない。同じ構成で同じ月を回せば、必ず同じ結果になる。
import type { Blueprint, MonthPlan } from './schema';
import {
  ASG_COST_PER_DAY, ASG_MAX_EXTRA, BACKUP_COST, EC2_CAPACITY, PARTS, SLOW_DAYS_ALLOWED, SLOW_RATIO,
} from './parts';

export const DAYS = 30;
export type Grade = 'best' | 'good' | 'fair' | 'fail';

/** このファイルが発動させるルール。content/rules.yaml にすべて定義が必要。 */
export const RULE_IDS = [
  'db-multi-az', 'db-replica-manual', 'db-single-backup', 'db-no-backup',
  'web-single-overload', 'web-fixed-overload', 'asg-scale-out', 'web-alb-spread',
  'web-single-az-outage', 'web-multi-az-survive', 'web-second-without-alb', 'alb-single-ec2',
  'db-exposed', 'db-private',
  's3-public-leak', 's3-presigned-private', 'cred-access-key', 'cred-role-broad', 'cred-role-scoped',
  's3-website-no-https', 'cf-https-oac', 'cf-edge-cache', 'static-ec2-overload', 'static-on-ec2', 's3-lifecycle', 's3-no-lifecycle',
] as const;
export type RuleId = (typeof RULE_IDS)[number];

export interface FiredRule { ruleId: RuleId; day: number; label: string }

export interface MonthResult {
  load: number[]; cap: number[]; up: number[]; served: number[]; slow: boolean[];
  earnedByDay: number[]; scalingByDay: number[];
  events: { day: number; label: string }[];
  fired: FiredRule[];
  fixedCost: number; cost: number; earned: number; lost: number; net: number;
  uptime: number; slowDays: number;
  kpi: { budget: boolean; uptime: boolean; performance: boolean; security: boolean };
  grade: Grade;
}

const AZ_OUTAGE_DAYS = 0.4;

export function webServers(bp: Blueprint): { count: number; effective: number } {
  const count = (bp.slots['app-a'] ? 1 : 0) + (bp.slots['app-c'] ? 1 : 0);
  // 振り分ける装置（ALB）がなければ、2台目にはアクセスが届かない
  return { count, effective: count === 2 && !bp.slots.public ? 1 : count };
}

export function scalingActive(bp: Blueprint): boolean {
  return bp.autoScaling && bp.slots.public !== null && webServers(bp).count > 0;
}

export function baseCapacity(bp: Blueprint): number {
  return webServers(bp).effective * EC2_CAPACITY;
}

const SITE_COST = { none: 0, ec2: 6000, 's3-website': 300, 's3-cloudfront': 500 } as const;
const STORAGE_COST_PER_MONTH = 800; // 写真が毎月たまる分（ゲーム内の値）

/** 静的サイトの月額。写真の保存料は月を追うごとに増え、ライフサイクルルールで半分になる */
export function staticCost(bp: Blueprint, month: number): number {
  const storage = STORAGE_COST_PER_MONTH * month * (bp.lifecycle ? 0.5 : 1);
  return SITE_COST[bp.site] + storage;
}

export function fixedCost(bp: Blueprint, month = 1): number {
  if (bp.site !== 'none') return staticCost(bp, month);
  const parts = Object.values(bp.slots).reduce((sum, p) => sum + (p ? PARTS[p].cost : 0), 0);
  return parts + (bp.backup ? BACKUP_COST : 0);
}

/** データベースにインターネットから届く状態か（パブリックアクセスあり、かつ接続元を絞っていない） */
export function dbExposed(bp: Blueprint): boolean {
  return bp.dbPublic && bp.dbSgOpen;
}

export function dbFailure(bp: Blueprint): { rule: RuleId; down: number; penaltyDays: number } {
  const c = bp.slots['data-c'];
  if (c === 'rds-standby') return { rule: 'db-multi-az', down: 0.02, penaltyDays: 0 };
  if (c === 'rds-replica') return { rule: 'db-replica-manual', down: 0.25, penaltyDays: 0 };
  if (bp.backup) return { rule: 'db-single-backup', down: 0.5, penaltyDays: 0 };
  return { rule: 'db-no-backup', down: 1.5, penaltyDays: 3 };
}

function runStatic(profitPerVisit: number, plan: MonthPlan, bp: Blueprint): MonthResult {
  const load = Array.from({ length: DAYS }, (_, i) => plan.visitsPerDay * (1 + 0.005 * i));
  const fired: FiredRule[] = [];
  const fire = (ruleId: RuleId, day: number, label: string) => {
    if (!fired.some((f) => f.ruleId === ruleId)) fired.push({ ruleId, day, label });
  };
  let insecure = false;
  const events = [...plan.events].sort((a, b) => a.day - b.day);
  for (const ev of events) {
    if (ev.type === 'spike') {
      for (let i = ev.day - 1; i < Math.min(DAYS, ev.day - 1 + (ev.days ?? 2)); i++) load[i] = load[i]! * (ev.factor ?? 2);
      if (bp.site === 's3-cloudfront') fire('cf-edge-cache', ev.day, ev.label);
    } else if (ev.type === 'https-check') {
      if (bp.site === 's3-website') {
        insecure = true;
        fire('s3-website-no-https', ev.day, ev.label);
      } else if (bp.site === 's3-cloudfront') fire('cf-https-oac', ev.day, ev.label);
    } else if (ev.type === 'storage-review') {
      fire(bp.lifecycle ? 's3-lifecycle' : 's3-no-lifecycle', ev.day, ev.label);
    } else if (ev.type === 'invoice' && bp.site === 'ec2') fire('static-on-ec2', ev.day, ev.label);
  }
  const peak = Math.max(...load);
  const cap = load.map(() => (bp.site === 'ec2' ? EC2_CAPACITY : peak * 1.5));
  const served = load.map((l, i) => (l <= cap[i]! ? 1 : cap[i]! / l));
  const slow = load.map((l, i) => l > cap[i]! * SLOW_RATIO);
  load.forEach((l, i) => l > cap[i]! && fire('static-ec2-overload', i + 1, 'アクセスの増加'));
  const up = load.map(() => 1);
  const earnedByDay = load.map((l, i) => profitPerVisit * l * served[i]!);
  const earned = earnedByDay.reduce((a, b) => a + b, 0);
  const potential = load.reduce((sum, l) => sum + profitPerVisit * l, 0);
  const cost = staticCost(bp, plan.month);
  const slowDays = slow.filter(Boolean).length;
  const kpi = { budget: cost <= plan.budget, uptime: true, performance: slowDays <= SLOW_DAYS_ALLOWED, security: !insecure };
  const met = Number(kpi.budget) + Number(kpi.uptime) + Number(kpi.performance) + Number(kpi.security);
  return {
    load, cap, up, served, slow, earnedByDay, scalingByDay: load.map(() => 0),
    events: events.map((e) => ({ day: e.day, label: e.label })),
    fired: fired.sort((a, b) => a.day - b.day),
    fixedCost: cost, cost, earned, lost: potential - earned, net: earned - cost,
    uptime: 1, slowDays, kpi, grade: met === 4 ? 'best' : met === 3 ? 'good' : met === 2 ? 'fair' : 'fail',
  };
}

export function runMonth(profitPerVisit: number, plan: MonthPlan, bp: Blueprint): MonthResult {
  if (bp.site !== 'none') return runStatic(profitPerVisit, plan, bp);
  const load = Array.from({ length: DAYS }, (_, i) => plan.visitsPerDay * (1 + 0.005 * i));
  const down = Array.from({ length: DAYS }, () => 0);
  const fired: FiredRule[] = [];
  const fire = (ruleId: RuleId, day: number, label: string) => {
    if (!fired.some((f) => f.ruleId === ruleId)) fired.push({ ruleId, day, label });
  };
  const addDown = (day: number, amount: number) => {
    let rest = amount;
    for (let i = day - 1; i < DAYS && rest > 0; i++) {
      const take = Math.min(1 - down[i]!, rest);
      down[i] = down[i]! + take;
      rest -= take;
    }
  };
  let penalty = 0;
  let breached = false;
  const web = webServers(bp);
  const events = [...plan.events].sort((a, b) => a.day - b.day);

  for (const ev of events) {
    if (ev.type === 'spike') {
      for (let i = ev.day - 1; i < Math.min(DAYS, ev.day - 1 + (ev.days ?? 2)); i++) load[i] = load[i]! * (ev.factor ?? 2);
      continue;
    }
    if (ev.type === 'bucket-probe') {
      if (bp.s3Public) {
        breached = true;
        fire('s3-public-leak', ev.day, ev.label);
        penalty += 5 * profitPerVisit * plan.visitsPerDay;
      } else fire('s3-presigned-private', ev.day, ev.label);
      continue;
    }
    if (ev.type === 'audit') {
      if (bp.credential === 'access-key') {
        breached = true; // 審査で重大な指摘を受けた
        fire('cred-access-key', ev.day, ev.label);
        penalty += 3 * profitPerVisit * plan.visitsPerDay;
      } else if (bp.credential === 'role-full') fire('cred-role-broad', ev.day, ev.label);
      else fire('cred-role-scoped', ev.day, ev.label);
      continue;
    }
    if (ev.type === 'probe') {
      if (dbExposed(bp)) {
        breached = true;
        fire('db-exposed', ev.day, ev.label);
        penalty += 5 * profitPerVisit * plan.visitsPerDay;
      } else fire('db-private', ev.day, ev.label);
      continue;
    }
    const db = dbFailure(bp);
    fire(db.rule, ev.day, ev.label);
    penalty += db.penaltyDays * profitPerVisit * plan.visitsPerDay;
    let outage = db.down;
    if (ev.type === 'az-outage') {
      // AZ-a の障害。AZ-c のサーバーにアクセスが届く構成なら、Web は止まらない
      const survives = bp.slots['app-c'] !== null && (bp.slots.public !== null || bp.slots['app-a'] === null);
      if (survives) {
        if (bp.slots['app-a']) fire('web-multi-az-survive', ev.day, ev.label);
      } else {
        fire('web-single-az-outage', ev.day, ev.label);
        outage = Math.max(outage, AZ_OUTAGE_DAYS);
      }
    }
    addDown(ev.day, outage);
  }

  const base = baseCapacity(bp);
  const asg = scalingActive(bp);
  const cap: number[] = [], served: number[] = [], slow: boolean[] = [], scalingByDay: number[] = [], earnedByDay: number[] = [];
  for (let i = 0; i < DAYS; i++) {
    const l = load[i]!;
    let extra = 0;
    if (asg && l > base * SLOW_RATIO) {
      extra = Math.min(ASG_MAX_EXTRA, Math.ceil((l / SLOW_RATIO - base) / EC2_CAPACITY));
      fire('asg-scale-out', i + 1, 'アクセスの増加');
    }
    const c = base + extra * EC2_CAPACITY;
    cap.push(c);
    scalingByDay.push(extra * ASG_COST_PER_DAY);
    served.push(l <= c ? 1 : c / l);
    slow.push(l > c * SLOW_RATIO);
    if (l > c) fire(web.effective <= 1 ? 'web-single-overload' : 'web-fixed-overload', i + 1, 'アクセスの増加');
    else if (l > EC2_CAPACITY && web.effective >= 2 && !asg) fire('web-alb-spread', i + 1, 'アクセスの増加');
    earnedByDay.push(profitPerVisit * l * (1 - down[i]!) * served[i]!);
  }

  // 月末の請求で見つかる、構成そのものの無駄
  if (web.count === 2 && !bp.slots.public) fire('web-second-without-alb', DAYS, '今月の請求書');
  if (bp.slots.public && web.count === 1 && !bp.autoScaling) fire('alb-single-ec2', DAYS, '今月の請求書');

  const up = down.map((d) => 1 - d);
  const potential = load.reduce((sum, l) => sum + profitPerVisit * l, 0);
  const earned = earnedByDay.reduce((a, b) => a + b, 0);
  const fixed = fixedCost(bp);
  const cost = fixed + scalingByDay.reduce((a, b) => a + b, 0);
  const uptime = up.reduce((a, b) => a + b, 0) / DAYS;
  const slowDays = slow.filter(Boolean).length;
  const kpi = { budget: cost <= plan.budget, uptime: uptime >= plan.uptimeTarget, performance: slowDays <= SLOW_DAYS_ALLOWED, security: !breached };
  const met = Number(kpi.budget) + Number(kpi.uptime) + Number(kpi.performance) + Number(kpi.security);
  const grade: Grade = met === 4 ? 'best' : met === 3 ? 'good' : met === 2 ? 'fair' : 'fail';

  return {
    load, cap, up, served, slow, earnedByDay, scalingByDay,
    events: events.map((e) => ({ day: e.day, label: e.label })),
    fired: fired.sort((a, b) => a.day - b.day),
    fixedCost: fixed, cost, earned, lost: potential - earned + penalty, net: earned - penalty - cost,
    uptime, slowDays, kpi, grade,
  };
}
