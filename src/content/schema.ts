// コンテンツ（学習項目・お客さん・用語・案件のひな形）の形。
// 仕様書（v3）「10. データ構造」に対応する。型はこのスキーマから導出する。
import { z } from 'zod';
import type { Rule, SimCustomer } from '../sim/schema';
import type { Spot } from '../sim/spot';
import type { JobTemplates } from '../sim/generator';

export const examDomainSchema = z.enum(['secure', 'resilient', 'performant', 'cost']);
export type ExamDomain = z.infer<typeof examDomainSchema>;

const id = z.string().regex(/^[a-z0-9][a-z0-9.-]*$/, '英小文字・数字・ハイフン・ドットのみ');
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD');

export const sourceSchema = z.object({
  title: z.string().min(1),
  url: z.url(),
  checkedAt: isoDate,
});

export const conceptSchema = z.object({
  id,
  title: z.string().min(1),
  domain: examDomainSchema,
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
  jobs: JobTemplates;
  concepts: Concept[];
  customers: Customer[];
  rules: Rule[];
  sim: SimCustomer[];
  spots: Spot[];
}
