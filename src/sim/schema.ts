// 運用シム（仕様書16章）のコンテンツの形。
import { z } from 'zod';

export const SLOTS = ['public', 'app-a', 'app-c', 'data-a', 'data-c'] as const;
export const slotSchema = z.enum(SLOTS);
export type Slot = z.infer<typeof slotSchema>;

export const PART_TYPES = ['alb', 'ec2', 'rds', 'rds-standby', 'rds-replica'] as const;
export const partTypeSchema = z.enum(PART_TYPES);
export type PartType = z.infer<typeof partTypeSchema>;

const part = partTypeSchema.nullable();
export const blueprintSchema = z.object({
  slots: z.object({ public: part, 'app-a': part, 'app-c': part, 'data-a': part, 'data-c': part }),
  backup: z.boolean(),
  autoScaling: z.boolean(),
});
export type Blueprint = z.infer<typeof blueprintSchema>;

export const eventTypeSchema = z.enum(['spike', 'db-failure', 'az-outage']);
export type EventType = z.infer<typeof eventTypeSchema>;

export const monthPlanSchema = z.object({
  month: z.number().int().min(1),
  visitsPerDay: z.number().min(0),
  budget: z.number().min(0),
  uptimeTarget: z.number().min(0).max(1),
  brief: z.string().min(1), // 月初のお客さんの声
  events: z.array(
    z.object({
      day: z.number().int().min(1).max(30),
      type: eventTypeSchema,
      label: z.string().min(1),
      factor: z.number().min(1).optional(), // spike：アクセスが何倍になるか
      days: z.number().int().min(1).optional(), // spike：何日続くか
    }),
  ),
});
export type MonthPlan = z.infer<typeof monthPlanSchema>;

export const simCustomerSchema = z.object({
  customerId: z.string().min(1),
  profitPerVisit: z.number().min(0), // 1訪問あたりのもうけ（ゲーム内の値）
  contractFee: z.number().min(0).default(30000), // 自社に入る月の契約料（ゲーム内の値）
  start: blueprintSchema,
  months: z.array(monthPlanSchema).min(1),
  comments: z.object({ best: z.string(), good: z.string(), fair: z.string(), fail: z.string() }),
});
export type SimCustomer = z.infer<typeof simCustomerSchema>;

// ルール＝知識の単位。公式ドキュメントとの照合対象。
export const ruleSchema = z.object({
  id: z.string().min(1),
  conceptId: z.string().min(1),
  tone: z.enum(['good', 'bad']),
  headline: z.string().min(1),
  explanation: z.string().min(1),
  examPoint: z.string().min(1),
  ticket: z.object({ kind: z.enum(['incident', 'performance', 'billing', 'security']), voice: z.string().min(1) }).optional(),
  sources: z.array(z.object({ title: z.string(), url: z.url(), checkedAt: z.string() })).default([]),
  review: z.object({ status: z.enum(['draft', 'verified']), verifiedAt: z.string().optional() }),
});
export type Rule = z.infer<typeof ruleSchema>;
