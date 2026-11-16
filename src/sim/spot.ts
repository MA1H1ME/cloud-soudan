// スポット案件：復習用の短い案件。ゲスト客の構成を預かり、1手だけ直して1か月を回す。
// 合否は運用シムと同じ計算で決める（選択肢ごとの正誤は持たない）。
import { z } from 'zod';
import { runMonth, type MonthResult, type RuleId } from './engine';
import { blueprintSchema, monthPlanSchema, partTypeSchema, type Blueprint } from './schema';

const patchSchema = z.object({
  slots: z.partialRecord(z.enum(['public', 'app-a', 'app-c', 'data-a', 'data-c']), partTypeSchema.nullable()).optional(),
  backup: z.boolean().optional(),
  autoScaling: z.boolean().optional(),
  dbPublic: z.boolean().optional(),
  dbSgOpen: z.boolean().optional(),
  s3Public: z.boolean().optional(),
  site: z.enum(['none', 'ec2', 's3-website', 's3-cloudfront']).optional(),
  lifecycle: z.boolean().optional(),
  credential: z.enum(['access-key', 'role-full', 'role-scoped']).optional(),
});

export const spotSchema = z.object({
  id: z.string().min(1),
  conceptId: z.string().min(1),
  guest: z.string().min(1),
  business: z.string().min(1),
  voice: z.string().min(1),
  goal: z.string().min(1),
  profitPerVisit: z.number().default(8),
  month: z.number().int().min(1).default(1), // 静的サイトの保存料は月で変わる
  plan: monthPlanSchema.omit({ month: true, brief: true }),
  start: blueprintSchema,
  files: z.boolean().default(false), // S3でファイルを配る構成か（画面の表示用）
  avoid: z.array(z.string()).default([]), // 発動したら不合格になるルール
  options: z.array(z.object({ id: z.string().min(1), label: z.string().min(1), patch: patchSchema })).min(2).max(4),
});
export type Spot = z.infer<typeof spotSchema>;

export function applyPatch(bp: Blueprint, patch: Spot['options'][number]['patch']): Blueprint {
  const { slots, ...rest } = patch;
  return { ...bp, ...rest, slots: { ...bp.slots, ...slots } };
}

export interface SpotOutcome { passed: boolean; result: MonthResult; reasons: string[] }

export function judgeSpot(spot: Spot, optionId: string): SpotOutcome {
  const option = spot.options.find((o) => o.id === optionId);
  if (!option) throw new Error(`選択肢がありません: ${spot.id}/${optionId}`);
  const plan = { ...spot.plan, month: spot.month, brief: spot.voice };
  const result = runMonth(spot.profitPerVisit, plan, applyPatch(spot.start, option.patch));
  const reasons: string[] = [];
  if (!result.kpi.budget) reasons.push('予算を超えた');
  if (!result.kpi.uptime) reasons.push('稼働率の目標を割った');
  if (!result.kpi.security) reasons.push('セキュリティの問題が起きた');
  if (result.fired.some((f) => (spot.avoid as RuleId[]).includes(f.ruleId))) reasons.push('防ぎたかった問題が起きた');
  return { passed: reasons.length === 0, result, reasons };
}
