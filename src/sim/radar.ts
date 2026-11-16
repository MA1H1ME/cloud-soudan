// 構成の特性を、Well-Architected の5つの観点で 0〜5 の目安にする。
// ゲーム内の目安で、AWSが公表している評価ではない。
import { baseCapacity, dbExposed, fixedCost, scalingActive, webServers } from './engine';
import { ASG_MAX_EXTRA, EC2_CAPACITY } from './parts';
import type { Blueprint, MonthPlan } from './schema';

export const AXES = ['security', 'reliability', 'performance', 'cost', 'operations'] as const;
export type Axis = (typeof AXES)[number];
export const AXIS_LABELS: Record<Axis, string> = { security: 'セキュリティ', reliability: '信頼性', performance: 'パフォーマンス', cost: 'コスト', operations: '運用' };

const clamp = (n: number) => Math.max(0, Math.min(5, n));

export function radarScores(bp: Blueprint, plan: MonthPlan, files: boolean): Record<Axis, number> {
  if (bp.site !== 'none') {
    const room = 1 - fixedCost(bp, plan.month) / plan.budget;
    const by = { ec2: [3, 2, 2, 1], 's3-website': [2, 4, 3, 4], 's3-cloudfront': [5, 5, 5, 4] }[bp.site];
    return {
      security: by[0]!, reliability: by[1]!, performance: by[2]!,
      cost: clamp(room >= 0.5 ? 5 : room >= 0.3 ? 4 : room >= 0.1 ? 3 : room >= 0 ? 2 : 0),
      operations: clamp(by[3]! + (bp.lifecycle ? 1 : 0)),
    };
  }
  const standby = bp.slots['data-c'] === 'rds-standby';
  const replica = bp.slots['data-c'] === 'rds-replica';
  const web = webServers(bp);
  const multiAzWeb = web.count === 2 && bp.slots.public !== null;
  const cap = baseCapacity(bp) + (scalingActive(bp) ? ASG_MAX_EXTRA * EC2_CAPACITY : 0);
  const ratio = plan.visitsPerDay > 0 ? cap / plan.visitsPerDay : 5;
  const headroom = 1 - fixedCost(bp) / plan.budget;
  let security = 5 - (dbExposed(bp) ? 2 : bp.dbPublic || bp.dbSgOpen ? 1 : 0);
  if (files) security -= (bp.s3Public ? 2 : 0) + (bp.credential === 'access-key' ? 2 : bp.credential === 'role-full' ? 1 : 0);
  return {
    security: clamp(security),
    reliability: clamp(1 + (bp.backup ? 1 : 0) + (standby ? 2 : replica ? 1 : 0) + (multiAzWeb ? 1 : 0)),
    performance: clamp(ratio >= 3 ? 5 : ratio >= 2 ? 4 : ratio >= 1.5 ? 3 : ratio >= 1 ? 2 : 1),
    cost: clamp(headroom >= 0.5 ? 5 : headroom >= 0.3 ? 4 : headroom >= 0.1 ? 3 : headroom >= 0 ? 2 : 0),
    operations: clamp(2 + (bp.backup ? 1 : 0) + (standby ? 1 : 0) + (scalingActive(bp) ? 1 : 0)),
  };
}
