// コンテンツ（content/*.yaml）を検証し、src/generated/content.json に書き出す。
// 仕様書「9. データ構造 — ビルド時の検証」に対応する。
//
//   npm run content          公開用：確認済み（verified）の相談だけを含める。不足はすべてエラー
//   npm run content:draft    開発用：下書きも含める。網羅性の不足は警告にとどめる
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { z } from 'zod';
import {
  PILLARS,
  cardSchema,
  conceptSchema,
  customerSchema,
  scenarioSchema,
  type Condition,
  type ContentBundle,
  type Scenario,
} from '../src/content/schema';

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

function conditionRefs(c: Condition): { scenarios: string[]; flags: [string, string][] } {
  switch (c.type) {
    case 'completed':
    case 'daysSince':
      return { scenarios: [c.scenarioId], flags: [] };
    case 'flag':
      return { scenarios: [], flags: [[c.key, c.equals]] };
    case 'all':
    case 'any': {
      const parts = c.of.map(conditionRefs);
      return { scenarios: parts.flatMap((p) => p.scenarios), flags: parts.flatMap((p) => p.flags) };
    }
  }
}

export function validate(dir: string, allowDraft: boolean): Report {
  const errors: string[] = [];
  const warnings: string[] = [];

  const cards = load(join(dir, 'cards.yaml'), z.array(cardSchema), errors) ?? [];
  const concepts = load(join(dir, 'concepts.yaml'), z.array(conceptSchema), errors) ?? [];
  const customers = load(join(dir, 'customers.yaml'), z.array(customerSchema), errors) ?? [];
  const scenarioDir = join(dir, 'scenarios');
  const all: Scenario[] = [];
  for (const f of readdirSync(scenarioDir).filter((n) => n.endsWith('.yaml')).sort()) {
    const s = load(join(scenarioDir, f), scenarioSchema, errors);
    if (!s) continue;
    if (`${s.id}.yaml` !== f) errors.push(`scenarios/${f}: ファイル名と id（${s.id}）が一致しません`);
    all.push(s);
  }

  const dup = (kind: string, ids: string[]) => {
    const seen = new Set<string>();
    for (const id of ids) {
      if (seen.has(id)) errors.push(`${kind} の id が重複しています: ${id}`);
      seen.add(id);
    }
    return seen;
  };
  const cardIds = dup('card', cards.map((c) => c.id));
  const conceptIds = dup('concept', concepts.map((c) => c.id));
  const customerIds = dup('customer', customers.map((c) => c.id));
  const scenarioIds = dup('scenario', all.map((s) => s.id));

  // フラグは「どこかの選択肢が立てる値」だけを条件に使える
  const flagValues = new Set(all.flatMap((s) => s.decisions.flatMap((d) => d.options.flatMap((o) => Object.entries(o.setFlags).map(([k, v]) => `${k}=${v}`)))));

  const selected = allowDraft ? all : all.filter((s) => s.review.status === 'verified');
  const drafts = all.length - all.filter((s) => s.review.status === 'verified').length;

  for (const s of all) {
    const at = `scenario ${s.id}`;
    const weightSum = PILLARS.reduce((sum, p) => sum + s.weights[p], 0);
    if (Math.abs(weightSum - 1) > 1e-6) errors.push(`${at}: 重みの合計が1.0ではありません（${weightSum.toFixed(3)}）`);
    if (!customerIds.has(s.customerId)) errors.push(`${at}: 存在しないお客さん ${s.customerId}`);
    for (const u of s.unlocks) if (!cardIds.has(u)) errors.push(`${at}: unlocks に存在しないカード ${u}`);

    const reqIds = new Set(s.requirements.map((r) => r.id));
    for (const d of s.decisions) {
      const dat = `${at}/${d.id}`;
      if (!conceptIds.has(d.conceptId)) errors.push(`${dat}: 存在しない学習項目 ${d.conceptId}`);
      if (!d.options.some((o) => o.violates.length === 0)) errors.push(`${dat}: 必須条件に違反しない選択肢がありません（◎が存在しない）`);
      dup(`${dat} の選択肢`, d.options.map((o) => o.id));
      for (const o of d.options) {
        for (const v of o.violates) if (!reqIds.has(v)) errors.push(`${dat}/${o.id}: violates に存在しない必須条件 ${v}`);
        for (const svc of o.services) if (!cardIds.has(svc)) errors.push(`${dat}/${o.id}: 存在しないカード ${svc}`);
      }
    }

    const conds = [...s.prerequisites, ...s.intros.flatMap((i) => (i.when ? [i.when] : []))];
    for (const c of conds) {
      const refs = conditionRefs(c);
      for (const id of refs.scenarios) if (!scenarioIds.has(id)) errors.push(`${at}: 条件が存在しない相談 ${id} を参照しています`);
      for (const [k, v] of refs.flags) if (!flagValues.has(`${k}=${v}`)) errors.push(`${at}: 条件のフラグ ${k}=${v} を立てる選択肢がありません`);
    }

    if (s.review.status === 'verified') {
      if (s.sources.length === 0) errors.push(`${at}: 確認済みなのに出典（sources）がありません`);
      if (!s.review.verifiedAt) errors.push(`${at}: 確認済みなのに確認日（review.verifiedAt）がありません`);
    }
  }

  // 網羅性：公開する相談が問う学習項目には、復習用の相談が2件以上必要
  const coverage = allowDraft ? warnings : errors;
  const usedConcepts = new Set(selected.flatMap((s) => s.decisions.map((d) => d.conceptId)));
  for (const c of concepts) {
    for (const r of c.requires) if (!cardIds.has(r)) errors.push(`concept ${c.id}: requires に存在しないカード ${r}`);
    for (const id of c.reviewScenarioIds) if (!scenarioIds.has(id)) errors.push(`concept ${c.id}: 存在しない復習用の相談 ${id}`);
    if (!usedConcepts.has(c.id)) continue;
    if (c.reviewScenarioIds.length < 2) coverage.push(`concept ${c.id}: 復習用の相談が${c.reviewScenarioIds.length}件です（2件以上必要）`);
    const allowed = new Set(c.requires);
    for (const id of c.reviewScenarioIds) {
      const rs = all.find((s) => s.id === id);
      const outside = rs?.decisions.flatMap((d) => d.options.flatMap((o) => o.services)).filter((x) => !allowed.has(x)) ?? [];
      if (outside.length) coverage.push(`concept ${c.id}: 復習用の相談 ${id} が requires 外のカードを使っています（${[...new Set(outside)].join(', ')}）`);
    }
  }

  if (!allowDraft && drafts > 0) warnings.push(`下書きの相談 ${drafts} 件は公開用ビルドから除外しました`);

  return { errors, warnings, bundle: { scenarios: selected, concepts, customers, cards } };
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
  console.log(`content: 相談 ${bundle.scenarios.length} 件を書き出しました（${allowDraft ? '下書きを含む' : '確認済みのみ'}）`);
}
