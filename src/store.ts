// セーブデータ。端末の localStorage に保存する。
// 結果は保存せず、「その月に使った構成」だけを残して毎回計算し直す（計算は決定的）。
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { conceptById, content, ruleById, simByCustomer } from './content';
import { addDays, enqueue, gameDate, INTERVAL_DAYS, onReviewAnswered, pickDueReviews, type ReviewItem } from './engine/review';
import { DAYS, runMonth, type Grade, type MonthResult } from './sim/engine';
import { LOCKED_SLOTS } from './sim/parts';
import type { Responses } from './sim/incidents';
import { UNLOCK_MONTH } from './guide';
import type { Blueprint, MonthPlan, PartType, SimCustomer, Slot } from './sim/schema';

export const START_CASH = 300000;
export const BEST_BONUS = 10000;
export const SPOT_REWARD = 5000;
/** チュートリアルを兼ねる最初のお客さん */
export const FIRST_CUSTOMER = 'kashiwagi';

export const today = () => gameDate(new Date());

export interface CustomerSave {
  month: number;
  blueprint: Blueprint;
  /** 月を始めたときに確定した構成。月の途中は変えられない */
  running: Blueprint | null;
  /** 月の中の経過日数（0〜30） */
  day: number;
  history: { month: number; blueprint: Blueprint; responses?: Responses }[];
  /** 今月の障害対応で選んだもの（出来事の番号 → 選択肢） */
  responses?: Responses;
  /** 最初の案件の進み具合。運用に入ったら 'operate' のまま */
  phase: Phase;
  /** ヒアリングで聞いた質問のID */
  asked: string[];
}

export type Phase = 'hearing' | 'design' | 'build' | 'verify' | 'operate';

export interface Company { name: string; cash: number }

interface SaveState {
  company: Company | null;
  customers: Record<string, CustomerSave>;
  /** 依頼を受けたお客さん */
  accepted: string[];
  /** フロアで担当中のお客さん */
  active: string | null;
  accept: (customerId: string) => void;
  setActive: (customerId: string) => void;
  setCredential: (customerId: string, value: Blueprint['credential']) => void;
  setSite: (customerId: string, value: Blueprint['site']) => void;
  /** conceptId → 復習の状態（忘却曲線に沿って間隔を広げる） */
  review: Record<string, ReviewItem>;
  /** これまでに出会ったルール */
  seenRules: string[];
  /** 閉じた先輩の案内 */
  tips: string[];
  dismissTip: (id: string) => void;
  /** 案内をもう一度はじめから出す */
  resetTips: () => void;
  answerSpot: (spotId: string, passed: boolean, firedRuleIds: string[], practice: boolean) => void;
  newGame: (name: string) => void;
  setSlot: (customerId: string, slot: Slot, part: PartType | null) => void;
  setSetting: (customerId: string, key: 'backup' | 'autoScaling' | 'dbPublic' | 'dbSgOpen' | 's3Public' | 'lifecycle', value: boolean) => void;
  ask: (customerId: string, questionId: string) => void;
  setPhase: (customerId: string, phase: Phase) => void;
  startMonth: (customerId: string) => void;
  setDay: (customerId: string, day: number) => void;
  respond: (customerId: string, key: string, optionId: string) => void;
  next: (customerId: string, grade: Grade) => void;
}

function initial(sim: SimCustomer): CustomerSave {
  return { month: 1, blueprint: sim.start, running: null, day: 0, history: [], phase: sim.hearing ? 'hearing' : 'operate', asked: [] };
}

export function customerSave(state: Pick<SaveState, 'customers'>, customerId: string): CustomerSave | undefined {
  const sim = simByCustomer.get(customerId);
  if (!sim) return undefined;
  const saved = state.customers[customerId];
  if (!saved) return initial(sim);
  // 設定項目が増えたとき、古いセーブには初期値を補う
  return { ...saved, blueprint: { ...sim.start, ...saved.blueprint }, running: saved.running ? { ...sim.start, ...saved.running } : null };
}

export const useSave = create<SaveState>()(
  persist(
    (set, get) => {
      const update = (customerId: string, fn: (c: CustomerSave) => CustomerSave) => {
        const current = customerSave(get(), customerId);
        if (current) set({ customers: { ...get().customers, [customerId]: fn(current) } });
      };
      return {
        company: null,
        customers: {},
        accepted: [],
        active: null,
        accept: (customerId) => set({ accepted: [...new Set([...get().accepted, customerId])], active: customerId }),
        setActive: (customerId) => get().accepted.includes(customerId) && set({ active: customerId }),
        setSite: (customerId, value) => update(customerId, (c) => (c.running ? c : { ...c, blueprint: { ...c.blueprint, site: value } })),
        setCredential: (customerId, value) => update(customerId, (c) => (c.running ? c : { ...c, blueprint: { ...c.blueprint, credential: value } })),
        review: {},
        seenRules: [],
        tips: [],
        dismissTip: (id) => set({ tips: [...new Set([...get().tips, id])] }),
        resetTips: () => set({ tips: [] }),
        newGame: (name) => set({ company: { name, cash: START_CASH }, customers: {}, accepted: [], active: null, review: {}, seenRules: [], tips: [] }),
        answerSpot: (spotId, passed, firedRuleIds, practice) => {
          const spot = content.spots.find((x) => x.id === spotId);
          const st = get();
          if (!spot) return;
          const seenRules = [...new Set([...st.seenRules, ...firedRuleIds])];
          if (practice) return set({ seenRules });
          const day = today();
          const prev = st.review[spot.conceptId] ?? enqueue(spot.conceptId, spotId, 1, day);
          const item = onReviewAnswered(prev, passed ? 'best' : 'fail', spotId, day);
          set({
            seenRules,
            review: { ...st.review, [spot.conceptId]: item },
            company: st.company && passed ? { ...st.company, cash: st.company.cash + SPOT_REWARD } : st.company,
          });
        },
        setSlot: (customerId, slot, part) =>
          update(customerId, (c) => {
            if (LOCKED_SLOTS.includes(slot) || c.running) return c;
            if (part && !partUnlocked(get(), part)) return c;
            const slots = { ...c.blueprint.slots, [slot]: part };
            // Auto Scaling は ALB がある構成でだけ使える
            return { ...c, blueprint: { ...c.blueprint, slots, autoScaling: c.blueprint.autoScaling && slots.public !== null } };
          }),
        setSetting: (customerId, key, value) =>
          update(customerId, (c) => (c.running ? c : { ...c, blueprint: { ...c.blueprint, [key]: value } })),
        ask: (customerId, questionId) =>
          update(customerId, (c) => {
            const max = simByCustomer.get(customerId)?.hearing?.maxQuestions ?? 0;
            return c.asked.includes(questionId) || c.asked.length >= max ? c : { ...c, asked: [...c.asked, questionId] };
          }),
        setPhase: (customerId, phase) => update(customerId, (c) => ({ ...c, phase })),
        startMonth: (customerId) => update(customerId, (c) => (c.running ? c : { ...c, running: c.blueprint, day: 0, responses: {} })),
        respond: (customerId, key, optionId) =>
          update(customerId, (c) => (c.running && !(key in (c.responses ?? {})) ? { ...c, responses: { ...c.responses, [key]: optionId } } : c)),
        setDay: (customerId, day) => update(customerId, (c) => ({ ...c, day: Math.min(DAYS, day) })),
        next: (customerId, grade) => {
          const sim = simByCustomer.get(customerId);
          const company = get().company;
          if (sim && company && grade !== 'fail') {
            set({ company: { ...company, cash: company.cash + sim.contractFee + (grade === 'best' ? BEST_BONUS : 0) } });
          }
          const save = customerSave(get(), customerId);
          const result = sim && save ? runningResult(sim, save) : undefined;
          if (result) {
            const day = today();
            const review = { ...get().review };
            const byConcept = new Map<string, boolean>();
            for (const f of result.fired) {
              const rule = ruleById.get(f.ruleId);
              if (rule) byConcept.set(rule.conceptId, (byConcept.get(rule.conceptId) ?? false) || rule.tone === 'bad');
            }
            for (const [conceptId, bad] of byConcept) {
              const prev = review[conceptId];
              // つまずいた項目は翌日、うまくいった項目は1週間後に確認する
              if (!prev) review[conceptId] = enqueue(conceptId, `${customerId}-m${save!.month}`, bad ? 1 : 3, day);
              else if (bad && !prev.mastered) review[conceptId] = { ...prev, stage: 1, lapses: prev.lapses + 1, dueOn: addDays(day, INTERVAL_DAYS[1]) };
            }
            set({ review, seenRules: [...new Set([...get().seenRules, ...result.fired.map((f) => f.ruleId)])] });
          }
          update(customerId, (c) =>
            c.running
              ? { ...c, month: c.month + 1, running: null, day: 0, responses: {}, history: [...c.history, { month: c.month, blueprint: c.running, responses: c.responses ?? {} }] }
              : c,
          );
        },
      };
    },
    { name: 'cloud-soudan-company-2', version: 3,
      migrate: (old) => {
        const o = old as { customers?: Record<string, unknown> };
        const had = Object.keys(o.customers ?? {});
        return { review: {}, seenRules: [], accepted: had, active: had[0] ?? null, ...o };
      }, },
  ),
);

export function planFor(sim: SimCustomer, month: number): MonthPlan | undefined {
  return sim.months.find((m) => m.month === month);
}

/** 進行中の月（構成を確定した後）の結果 */
export function runningResult(sim: SimCustomer, save: CustomerSave): MonthResult | undefined {
  const plan = planFor(sim, save.month);
  return plan && save.running ? runMonth(sim.profitPerVisit, plan, save.running, save.responses ?? {}) : undefined;
}

/** 過去の月の結果（古い順） */
export function pastResults(sim: SimCustomer, save: CustomerSave): { month: number; result: MonthResult }[] {
  return save.history.flatMap((h) => {
    const plan = planFor(sim, h.month);
    return plan ? [{ month: h.month, result: runMonth(sim.profitPerVisit, plan, h.blueprint, h.responses ?? {}) }] : [];
  });
}

/** 今日出すスポット案件（期限の古い順に最大3件）。学習項目ごとに、まだ見ていない案件を優先する。 */
export function dueSpots(state: Pick<SaveState, 'review'>): string[] {
  return pickDueReviews(Object.values(state.review), conceptById, today()).flatMap((item) => {
    const candidates = content.spots.filter((x) => x.conceptId === item.conceptId);
    const lastSeen = new Map(item.seen.map((x) => [x.scenarioId, x.seenOn]));
    const pick = candidates.find((x) => !lastSeen.has(x.id)) ?? [...candidates].sort((a, b) => (lastSeen.get(a.id) ?? '').localeCompare(lastSeen.get(b.id) ?? ''))[0];
    return pick ? [pick.id] : [];
  });
}

/** まだ受けていない依頼（条件を満たして届いているもの） */
export function pendingRequests(state: Pick<SaveState, 'customers' | 'accepted'>): SimCustomer[] {
  return content.sim.filter((sim) => {
    if (state.accepted.includes(sim.customerId)) return false;
    const after = sim.request.after;
    if (!after) return true;
    const other = customerSave(state, after.customerId);
    return state.accepted.includes(after.customerId) && Boolean(other && other.month > after.month);
  });
}

/** 部品の解禁の進み具合（最初のお客さん・柏木さんが何か月目まで進んだか） */
export function unlockStage(state: Pick<SaveState, 'customers' | 'accepted'>): number {
  const first = FIRST_CUSTOMER;
  if (!state.accepted.includes(first)) return 1;
  return customerSave(state, first)?.month ?? 1;
}

export function partUnlocked(state: Pick<SaveState, 'customers' | 'accepted'>, part: PartType): boolean {
  return unlockStage(state) >= (UNLOCK_MONTH[part] ?? 1);
}
