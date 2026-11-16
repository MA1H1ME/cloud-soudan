// コンテンツ（content/*.yaml）を検証し、src/generated/content.json に書き出す。
// 仕様書（v3）「10. データ構造とコンテンツの置き場」に対応する。
//
//   npm run content          公開用：確認済み（verified）のルールと用語だけを含める。不足はすべてエラー
//   npm run content:draft    開発用：下書きも含める。網羅性の不足は警告にとどめる
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { z } from 'zod';
import { conceptSchema, customerSchema, glossarySchema, type ContentBundle } from '../src/content/schema';
import { ruleSchema, simCustomerSchema, type SimCustomer } from '../src/sim/schema';
import { RULE_IDS } from '../src/sim/engine';
import { judgeSpot, spotSchema } from '../src/sim/spot';
import { jobTemplatesSchema } from '../src/sim/generator';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const contentDir = join(root, 'content');
const outFile = join(root, 'src/generated/content.json');

export interface Report {
  errors: string[];
  warnings: string[];
  bundle: ContentBundle;
}

function load<T>(file: string, schema: z.ZodType<T>, errors: string[]): T | undefined {
  const result = schema.safeParse(parse(readFileSync(file, 'utf8')));
  if (result.success) return result.data;
  for (const issue of result.error.issues) {
    errors.push(`${file.replace(root + '/', '')}: ${issue.path.join('.') || '(root)'}: ${issue.message}`);
  }
  return undefined;
}

export function validate(dir: string, allowDraft: boolean): Report {
  const errors: string[] = [];
  const warnings: string[] = [];

  const concepts = load(join(dir, 'concepts.yaml'), z.array(conceptSchema), errors) ?? [];
  const customers = load(join(dir, 'customers.yaml'), z.array(customerSchema), errors) ?? [];
  const dup = (kind: string, ids: string[]) => {
    const seen = new Set<string>();
    for (const id of ids) {
      if (seen.has(id)) errors.push(`${kind} の id が重複しています: ${id}`);
      seen.add(id);
    }
    return seen;
  };
  const conceptIds = dup('concept', concepts.map((c) => c.id));
  const customerIds = dup('customer', customers.map((c) => c.id));

  // 運用シム：ルールとお客さんごとの月次計画
  const rules = load(join(dir, 'rules.yaml'), z.array(ruleSchema), errors) ?? [];
  const ruleIds = dup('rule', rules.map((r) => r.id));
  for (const id of RULE_IDS) if (!ruleIds.has(id)) errors.push(`rules.yaml: エンジンが使うルール ${id} がありません`);
  for (const r of rules) {
    if (!conceptIds.has(r.conceptId)) errors.push(`rule ${r.id}: 存在しない学習項目 ${r.conceptId}`);
    if (r.review.status === 'verified' && r.sources.length === 0) errors.push(`rule ${r.id}: 確認済みなのに出典がありません`);
  }
  const simDir = join(dir, 'sim');
  let sim: SimCustomer[] = [];
  for (const f of readdirSync(simDir).filter((n) => n.endsWith('.yaml')).sort()) {
    const c = load(join(simDir, f), simCustomerSchema, errors);
    if (!c) continue;
    if (!customerIds.has(c.customerId)) errors.push(`sim/${f}: 存在しないお客さん ${c.customerId}`);
    c.months.forEach((m, i) => {
      if (m.month !== i + 1) errors.push(`sim/${f}: months は1から順に並べてください（${i + 1}番目が month ${m.month}）`);
    });
    if (c.hearing) {
      const reqIds = new Set(c.hearing.requirements.map((r) => r.id));
      for (const q of c.hearing.questions) if (q.reveals && !reqIds.has(q.reveals)) errors.push(`sim/${f}: 質問 ${q.id} の reveals が存在しない要件 ${q.reveals} を指しています`);
      for (const r of c.hearing.requirements) {
        if (!r.given && !c.hearing.questions.some((q) => q.reveals === r.id)) errors.push(`sim/${f}: 要件 ${r.id} を聞き出せる質問がありません`);
      }
    }
    sim.push(c);
  }
  // スポット案件（復習用）
  let spots = load(join(dir, 'spots.yaml'), z.array(spotSchema), errors) ?? [];
  dup('spot', spots.map((x) => x.id));
  for (const sp of spots) {
    if (!conceptIds.has(sp.conceptId)) errors.push(`spot ${sp.id}: 存在しない学習項目 ${sp.conceptId}`);
    for (const a of sp.avoid) if (!ruleIds.has(a)) errors.push(`spot ${sp.id}: avoid に存在しないルール ${a}`);
    const pass = sp.options.filter((o) => judgeSpot(sp, o.id).passed).length;
    if (pass === 0 || pass === sp.options.length) errors.push(`spot ${sp.id}: 合格する選択肢と不合格の選択肢の両方が必要です（合格 ${pass} 件）`);
  }
  for (const c of new Set(rules.map((r) => r.conceptId))) {
    const n = spots.filter((x) => x.conceptId === c).length;
    if (n < 2) (allowDraft ? warnings : errors).push(`concept ${c}: スポット案件が${n}件です（2件以上必要）`);
  }
  const draftRules = rules.filter((r) => r.review.status !== 'verified').length;
  if (!allowDraft && draftRules > 0) {
    // 照合前のルールが残っている間は、運用シムを公開用ビルドに含めない
    warnings.push(`下書きのルールが ${draftRules} 件あるため、運用シムは公開用ビルドから除外しました`);
    sim = [];
    spots = [];
  }


  // 用語図鑑：照合済みのものだけ公開する
  let glossary = load(join(dir, 'glossary.yaml'), z.array(glossarySchema), errors) ?? [];
  dup('glossary', glossary.map((g) => g.id));
  if (!allowDraft) glossary = glossary.filter((g) => g.review.status === 'verified');

  const jobs = load(join(dir, 'jobs.yaml'), jobTemplatesSchema, errors);

  return { errors, warnings, bundle: { concepts, customers, rules, sim, spots, glossary, jobs: jobs! } };
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const allowDraft = process.argv.includes('--allow-draft');
  const { errors, warnings, bundle } = validate(contentDir, allowDraft);
  for (const w of warnings) console.warn(`warning: ${w}`);
  for (const e of errors) console.error(`error: ${e}`);
  if (errors.length > 0) {
    console.error(`\nコンテンツの検証に失敗しました（エラー ${errors.length} 件）`);
    process.exit(1);
  }
  mkdirSync(dirname(outFile), { recursive: true });
  writeFileSync(outFile, JSON.stringify(bundle));
  console.log(`content: ルール ${bundle.rules.length} 件・お客さん ${bundle.sim.length} 人・用語 ${bundle.glossary.length} 語を書き出しました（${allowDraft ? '下書きを含む' : '確認済みのみ'}）`);
}
