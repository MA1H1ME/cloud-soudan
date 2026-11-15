// セーブデータ。端末の localStorage に保存する。
// 結果は保存せず、「その月に使った構成」だけを残して毎回計算し直す（計算は決定的）。
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { simByCustomer } from './content';
import { runMonth, type MonthResult } from './sim/engine';
import { LOCKED_SLOTS } from './sim/parts';
import type { Blueprint, MonthPlan, PartType, SimCustomer, Slot } from './sim/schema';

export interface CustomerSave {
  month: number;
  blueprint: Blueprint;
  /** 「今月を回す」を押してから「翌月へ」を押すまでの間、その月に使った構成 */
  running: Blueprint | null;
  history: { month: number; blueprint: Blueprint }[];
}

interface SaveState {
  customers: Record<string, CustomerSave>;
  setSlot: (customerId: string, slot: Slot, part: PartType | null) => void;
  setSetting: (customerId: string, key: 'backup' | 'autoScaling', value: boolean) => void;
  run: (customerId: string) => void;
  next: (customerId: string) => void;
  reset: () => void;
}

function initial(sim: SimCustomer): CustomerSave {
  return { month: 1, blueprint: sim.start, running: null, history: [] };
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
        customers: {},
        setSlot: (customerId, slot, part) =>
          update(customerId, (c) => {
            if (LOCKED_SLOTS.includes(slot)) return c;
            const slots = { ...c.blueprint.slots, [slot]: part };
            // Auto Scaling は ALB がある構成でだけ使える
            return { ...c, blueprint: { ...c.blueprint, slots, autoScaling: c.blueprint.autoScaling && slots.public !== null } };
          }),
        setSetting: (customerId, key, value) => update(customerId, (c) => ({ ...c, blueprint: { ...c.blueprint, [key]: value } })),
        run: (customerId) => update(customerId, (c) => ({ ...c, running: c.blueprint })),
        next: (customerId) =>
          update(customerId, (c) =>
            c.running ? { ...c, month: c.month + 1, running: null, history: [...c.history, { month: c.month, blueprint: c.running }] } : c,
          ),
        reset: () => set({ customers: {} }),
      };
    },
    { name: 'cloud-soudan-sim', version: 1 },
  ),
);

export function planFor(sim: SimCustomer, month: number): MonthPlan | undefined {
  return sim.months.find((m) => m.month === month);
}

/** 進行中の月（「今月を回す」を押した後）の結果 */
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
