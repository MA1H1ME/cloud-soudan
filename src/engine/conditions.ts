// 出現条件・帰結イベントの判定。仕様書「8. 連続ストーリーと過去の判断の帰結」に対応する。
// 確率は使わず、フラグと経過日数だけで決める。
import type { Condition } from '../content/schema';

export interface ConditionState {
  flags: Record<string, string>;
  /** scenarioId → 完了したゲーム内日付 */
  completedOn: Record<string, string>;
  today: string;
}

function daysBetween(from: string, to: string): number {
  const ms = Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`);
  return Math.round(ms / 86_400_000);
}

export function check(cond: Condition, state: ConditionState): boolean {
  switch (cond.type) {
    case 'completed':
      return cond.scenarioId in state.completedOn;
    case 'flag':
      return state.flags[cond.key] === cond.equals;
    case 'daysSince': {
      const on = state.completedOn[cond.scenarioId];
      return on !== undefined && daysBetween(on, state.today) >= cond.min;
    }
    case 'all':
      return cond.of.every((c) => check(c, state));
    case 'any':
      return cond.of.some((c) => check(c, state));
  }
}

export function checkAll(conds: Condition[], state: ConditionState): boolean {
  return conds.every((c) => check(c, state));
}
