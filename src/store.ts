// セーブデータ。端末の localStorage に保存する。
// 結果は保存せず、「その月に使った構成」だけを残して毎回計算し直す（計算は決定的）。
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { simByCustomer } from './content';
import { DAYS, runMonth, type Grade, type MonthResult } from './sim/engine';
import { LOCKED_SLOTS } from './sim/parts';
import type { Blueprint, MonthPlan, PartType, SimCustomer, Slot } from './sim/schema';

export const START_CASH = 300000;
export const BEST_BONUS = 10000;

export interface CustomerSave {
  month: number;
  blueprint: Blueprint;
  /** 月を始めたときに確定した構成。月の途中は変えられない */
  running: Blueprint | null;
  /** 月の中の経過日数（0〜30） */
  day: number;
  history: { month: number; blueprint: Blueprint }[];
}

export interface Company { name: string; cash: number }

interface SaveState {
  company: Company | null;
  customers: Record<string, CustomerSave>;
  newGame: (name: string) => void;
  setSlot: (customerId: string, slot: Slot, part: PartType | null) => void;
  setSetting: (customerId: string, key: 'backup' | 'autoScaling', value: boolean) => void;
  startMonth: (customerId: string) => void;
  setDay: (customerId: string, day: number) => void;
  next: (customerId: string, grade: Grade) => void;
}

function initial(sim: SimCustomer): CustomerSave {
  return { month: 1, blueprint: sim.start, running: null, day: 0, history: [] };
}

export function customerSave(state: Pick<SaveState, 'customers'>, customerId: string): CustomerSave | undefined {
  const sim = simByCustomer.get(customerId);
  return sim ? (state.customers[customerId] ?? initial(sim)) : undefined;
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
        newGame: (name) => set({ company: { name, cash: START_CASH }, customers: {} }),
        setSlot: (customerId, slot, part) =>
          update(customerId, (c) => {
            if (LOCKED_SLOTS.includes(slot) || c.running) return c;
            const slots = { ...c.blueprint.slots, [slot]: part };
            // Auto Scaling は ALB がある構成でだけ使える
            return { ...c, blueprint: { ...c.blueprint, slots, autoScaling: c.blueprint.autoScaling && slots.public !== null } };
          }),
        setSetting: (customerId, key, value) =>
          update(customerId, (c) => (c.running ? c : { ...c, blueprint: { ...c.blueprint, [key]: value } })),
        startMonth: (customerId) => update(customerId, (c) => (c.running ? c : { ...c, running: c.blueprint, day: 0 })),
        setDay: (customerId, day) => update(customerId, (c) => ({ ...c, day: Math.min(DAYS, day) })),
        next: (customerId, grade) => {
          const sim = simByCustomer.get(customerId);
          const company = get().company;
          if (sim && company && grade !== 'fail') {
            set({ company: { ...company, cash: company.cash + sim.contractFee + (grade === 'best' ? BEST_BONUS : 0) } });
          }
          update(customerId, (c) =>
            c.running
              ? { ...c, month: c.month + 1, running: null, day: 0, history: [...c.history, { month: c.month, blueprint: c.running }] }
              : c,
          );
        },
      };
    },
    { name: 'cloud-soudan-company', version: 1 },
  ),
);

export function planFor(sim: SimCustomer, month: number): MonthPlan | undefined {
  return sim.months.find((m) => m.month === month);
}

/** 進行中の月（構成を確定した後）の結果 */
export function runningResult(sim: SimCustomer, save: CustomerSave): MonthResult | undefined {
  const plan = planFor(sim, save.month);
  return plan && save.running ? runMonth(sim.profitPerVisit, plan, save.running) : undefined;
}

/** 過去の月の結果（古い順） */
export function pastResults(sim: SimCustomer, save: CustomerSave): { month: number; result: MonthResult }[] {
  return save.history.flatMap((h) => {
    const plan = planFor(sim, h.month);
    return plan ? [{ month: h.month, result: runMonth(sim.profitPerVisit, plan, h.blueprint) }] : [];
  });
}
