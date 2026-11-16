// ビルド時に検証済みのコンテンツ（scripts/validate-content.ts が生成）
import raw from '../generated/content.json';
import type { ContentBundle } from './schema';

export const content = raw as unknown as ContentBundle;

export const scenarioById = new Map(content.scenarios.map((s) => [s.id, s]));
export const customerById = new Map(content.customers.map((c) => [c.id, c]));
export const conceptById = new Map(content.concepts.map((c) => [c.id, c]));
export const cardById = new Map(content.cards.map((c) => [c.id, c]));
export const ruleById = new Map(content.rules.map((r) => [r.id, r]));
export const simByCustomer = new Map(content.sim.map((s) => [s.customerId, s]));
export const spotById = new Map(content.spots.map((s) => [s.id, s]));
