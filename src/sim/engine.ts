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
  kpi: { budget: boolean; uptime: boolean; performance: boolean };
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

export function fixedCost(bp: Blueprint): number {
  const parts = Object.values(bp.slots).reduce((sum, p) => sum + (p ? PARTS[p].cost : 0), 0);
  return parts + (bp.backup ? BACKUP_COST : 0);
}

function dbFailure(bp: Blueprint): { rule: RuleId; down: number; penaltyDays: number } {
  const c = bp.slots['data-c'];
  if (c === 'rds-standby') return { rule: 'db-multi-az', down: 0.02, penaltyDays: 0 };
  if (c === 'rds-replica') return { rule: 'db-replica-manual', down: 0.25, penaltyDays: 0 };
  if (bp.backup) return { rule: 'db-single-backup', down: 0.5, penaltyDays: 0 };
  return { rule: 'db-no-backup', down: 1.5, penaltyDays: 3 };
}

export function runMonth(profitPerVisit: number, plan: MonthPlan, bp: Blueprint): MonthResult {
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
  const web = webServers(bp);
  const events = [...plan.events].sort((a, b) => a.day - b.day);

  for (const ev of events) {
    if (ev.type === 'spike') {
      for (let i = ev.day - 1; i < Math.min(DAYS, ev.day - 1 + (ev.days ?? 2)); i++) load[i] = load[i]! * (ev.factor ?? 2);
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
  const kpi = { budget: cost <= plan.budget, uptime: uptime >= plan.uptimeTarget, performance: slowDays <= SLOW_DAYS_ALLOWED };
  const met = Number(kpi.budget) + Number(kpi.uptime) + Number(kpi.performance);
  const grade: Grade = met === 3 ? 'best' : met === 2 ? 'good' : met === 1 ? 'fair' : 'fail';

  return {
    load, cap, up, served, slow, earnedByDay, scalingByDay,
    events: events.map((e) => ({ day: e.day, label: e.label })),
    fired: fired.sort((a, b) => a.day - b.day),
    fixedCost: fixed, cost, earned, lost: potential - earned + penalty, net: earned - penalty - cost,
    uptime, slowDays, kpi, grade,
  };
}
