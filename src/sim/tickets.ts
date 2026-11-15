// 先月の結果から、今月のチケット（未解決の課題）を作る。
import type { MonthResult } from './engine';
import type { Rule } from './schema';

export interface Ticket { id: string; kind: 'incident' | 'performance' | 'billing' | 'security'; voice: string; ruleId?: string }

export const TICKET_KIND_LABELS: Record<Ticket['kind'], string> = {
  incident: 'インシデント',
  performance: '性能',
  billing: '請求',
  security: 'セキュリティ',
};

export function ticketsFrom(result: MonthResult, rules: Map<string, Rule>): Ticket[] {
  const tickets: Ticket[] = result.fired.flatMap((f) => {
    const rule = rules.get(f.ruleId);
    return rule?.tone === 'bad' && rule.ticket ? [{ id: f.ruleId, kind: rule.ticket.kind, voice: rule.ticket.voice, ruleId: f.ruleId }] : [];
  });
  if (!result.kpi.budget) tickets.push({ id: 'over-budget', kind: 'billing', voice: '先月の請求が予算を超えていました。どこか削れませんか？' });
  return tickets;
}
