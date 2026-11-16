// コンテンツ（シナリオ・学習項目・お客さん・図鑑カード）の形。
// 仕様書「9. データ構造」に対応する。型はこのスキーマから導出する。
import { z } from 'zod';
import type { Rule, SimCustomer } from '../sim/schema';
import type { Spot } from '../sim/spot';

export const PILLARS = ['security', 'reliability', 'performance', 'cost', 'operations'] as const;
export const PILLAR_LABELS: Record<Pillar, string> = {
  security: 'セキュリティ',
  reliability: '信頼性',
  performance: 'パフォーマンス',
  cost: 'コスト',
  operations: '運用',
};

export const pillarSchema = z.enum(PILLARS);
export type Pillar = z.infer<typeof pillarSchema>;

const score = z.number().min(0).max(5);
export const pillarScoresSchema = z.object({
  security: score,
  reliability: score,
  performance: score,
  cost: score,
  operations: score,
});
export type PillarScores = z.infer<typeof pillarScoresSchema>;

const weight = z.number().min(0).max(1);
export const pillarWeightsSchema = z.object({
  security: weight,
  reliability: weight,
  performance: weight,
  cost: weight,
  operations: weight,
});
export type PillarWeights = z.infer<typeof pillarWeightsSchema>;

export const examDomainSchema = z.enum(['secure', 'resilient', 'performant', 'cost']);
export type ExamDomain = z.infer<typeof examDomainSchema>;

const id = z.string().regex(/^[a-z0-9][a-z0-9.-]*$/, '英小文字・数字・ハイフン・ドットのみ');
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD');

export const sourceSchema = z.object({
  title: z.string().min(1),
  url: z.url(),
  checkedAt: isoDate,
});

export const lineSchema = z.object({
  speaker: z.enum(['customer', 'senpai', 'player', 'narration']),
  text: z.string().min(1),
  mood: z.enum(['normal', 'happy', 'troubled']).optional(),
});
export type Line = z.infer<typeof lineSchema>;

export type Condition =
  | { type: 'completed'; scenarioId: string }
  | { type: 'flag'; key: string; equals: string }
  | { type: 'daysSince'; scenarioId: string; min: number }
  | { type: 'all' | 'any'; of: Condition[] };

export const conditionSchema: z.ZodType<Condition> = z.lazy(() =>
  z.discriminatedUnion('type', [
    z.object({ type: z.literal('completed'), scenarioId: id }),
    z.object({ type: z.literal('flag'), key: z.string().min(1), equals: z.string().min(1) }),
    z.object({ type: z.literal('daysSince'), scenarioId: id, min: z.number().int().min(0) }),
    z.object({ type: z.literal('all'), of: z.array(conditionSchema).min(1) }),
    z.object({ type: z.literal('any'), of: z.array(conditionSchema).min(1) }),
  ]),
);

export const optionSchema = z.object({
  id,
  label: z.string().min(1),
  services: z.array(id),
  scores: pillarScoresSchema,
  scoreNotes: z.partialRecord(pillarSchema, z.string()).default({}),
  violates: z.array(id).default([]),
  misconception: z.string().optional(),
  setFlags: z.record(z.string(), z.string()).default({}),
  reaction: z.array(lineSchema).min(1),
  explanation: z.string().min(1),
});
export type Option = z.infer<typeof optionSchema>;

export const decisionSchema = z.object({
  id,
  conceptId: id,
  prompt: z.string().min(1),
  hint: z.string().min(1),
  options: z.array(optionSchema).min(2).max(4),
  examPoint: z.string().min(1),
});
export type Decision = z.infer<typeof decisionSchema>;

export const scenarioSchema = z.object({
  id,
  kind: z.enum(['tutorial', 'story', 'review']),
  customerId: id,
  chapter: z.number().int().min(0).optional(),
  title: z.string().min(1),
  weights: pillarWeightsSchema,
  requirements: z.array(z.object({ id, text: z.string().min(1) })).default([]),
  prerequisites: z.array(conditionSchema).default([]),
  intros: z.array(z.object({ when: conditionSchema.optional(), lines: z.array(lineSchema).min(1) })).min(1),
  decisions: z.array(decisionSchema).min(1).max(3),
  outro: z.array(lineSchema).default([]),
  unlocks: z.array(id).default([]),
  sources: z.array(sourceSchema).default([]),
  review: z.object({
    status: z.enum(['draft', 'verified']),
    verifiedAt: isoDate.optional(),
    reviewer: z.string().optional(),
  }),
});
export type Scenario = z.infer<typeof scenarioSchema>;

export const conceptSchema = z.object({
  id,
  title: z.string().min(1),
  domain: examDomainSchema,
  requires: z.array(id).default([]),
  reviewScenarioIds: z.array(id).default([]),
});
export type Concept = z.infer<typeof conceptSchema>;

export const customerSchema = z.object({
  id,
  name: z.string().min(1),
  business: z.string().min(1),
  kind: z.enum(['main', 'guest']),
  portrait: z.string().optional(),
});
export type Customer = z.infer<typeof customerSchema>;

export const cardSchema = z.object({
  id,
  name: z.string().min(1),
  summary: z.string().min(1),
  useWhen: z.string().min(1),
  misconception: z.string().optional(),
});
export type Card = z.infer<typeof cardSchema>;

export const glossarySchema = z.object({
  id,
  term: z.string().min(1),
  short: z.string().min(1),
  body: z.string().min(1),
  play: z.string().min(1),
  sources: z.array(sourceSchema).min(1),
  review: z.object({ status: z.enum(['draft', 'verified']), verifiedAt: isoDate.optional() }),
});
export type GlossaryTerm = z.infer<typeof glossarySchema>;

export interface ContentBundle {
  glossary: GlossaryTerm[];
  scenarios: Scenario[];
  concepts: Concept[];
  customers: Customer[];
  cards: Card[];
  rules: Rule[];
  sim: SimCustomer[];
  spots: Spot[];
}
