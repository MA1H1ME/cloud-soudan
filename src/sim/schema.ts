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
  dbPublic: z.boolean().default(false), // データベースのパブリックアクセス
  dbSgOpen: z.boolean().default(false), // セキュリティグループがどこからでも接続を許可している
  s3Public: z.boolean().default(false), // ファイル用バケットを公開している
  // 静的サイトの置き場所。'none' 以外なら、サーバーとDBの構成ではなく静的サイトとして計算する
  site: z.enum(['none', 'ec2', 's3-website', 's3-cloudfront']).default('none'),
  lifecycle: z.boolean().default(false), // 古い写真を低頻度アクセス向けのストレージクラスへ移すルール
  credential: z.enum(['access-key', 'role-full', 'role-scoped']).default('role-scoped'), // アプリ（EC2）がS3を使うための権限の渡し方
});
export type Blueprint = z.infer<typeof blueprintSchema>;

export const eventTypeSchema = z.enum(['spike', 'db-failure', 'az-outage', 'probe', 'bucket-probe', 'audit', 'https-check', 'storage-review', 'invoice', 'read-surge']);
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

export const checkTypeSchema = z.enum(['budget', 'data', 'downtime', 'peak', 'secure-db', 's3-private', 'no-keys', 'least-privilege', 'https', 'storage', 'reads']);
export type CheckType = z.infer<typeof checkTypeSchema>;

// ヒアリング：用意した質問から選んで聞き、要件メモを埋める。会話は事前に作成したものだけ。
export const hearingSchema = z.object({
  opening: z.string().min(1), // お客さんの最初のひとこと
  maxQuestions: z.number().int().min(1),
  questions: z.array(z.object({ id: z.string().min(1), text: z.string().min(1), answer: z.string().min(1), reveals: z.string().optional() })).min(1),
  requirements: z.array(
    z.object({
      id: z.string().min(1),
      label: z.string().min(1), // 聞き出せたときに要件メモに書く文
      unknown: z.string().min(1), // 聞けていないときの表示
      check: checkTypeSchema, // 検証のしかた
      given: z.boolean().default(false), // 依頼の時点で分かっている
    }),
  ).min(1),
});
export type Hearing = z.infer<typeof hearingSchema>;

export const simCustomerSchema = z.object({
  customerId: z.string().min(1),
  profitPerVisit: z.number().min(0), // 1訪問あたりのもうけ（ゲーム内の値）
  contractFee: z.number().min(0).default(30000), // 自社に入る月の契約料（ゲーム内の値）
  priority: z.enum(['security', 'reliability', 'performance', 'cost']), // このお客さんが最も大事にする観点
  features: z.array(z.enum(['files'])).default([]), // 'files'：S3でファイルを配る。構築画面に S3 と IAM が出る
  request: z.object({ pitch: z.string().min(1), after: z.object({ customerId: z.string(), month: z.number().int() }).optional() }),
  start: blueprintSchema,
  hearing: hearingSchema.optional(),
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
