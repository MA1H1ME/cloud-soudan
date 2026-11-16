// セーブデータ。端末の localStorage に保存する。
// 結果は保存せず、「その月に使った構成」だけを残して毎回計算し直す（計算は決定的）。
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { conceptById, content, ruleById } from './content';
import { MAIL_DAYS, mailsForDay, simFor } from './jobs';
import { addDays, enqueue, gameDate, INTERVAL_DAYS, onReviewAnswered, pickDueReviews, type ReviewItem } from './engine/review';
import { DAYS, runMonth, type Grade, type MonthResult } from './sim/engine';
import { verify } from './sim/verify';
import { setSoundEnabled, sfx } from './sound';
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
  /** 今の月を始めた日（会社の暦）。月の中の経過日数は dayOf で求める */
  startedOn?: number;
  /** 旧セーブとの互換用（使わない） */
  day?: number;
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

export type StaffKind = 'ops' | 'sales';
/** 社員。hire：雇う費用、salary：30日ごとの給料、rank：雇えるようになる売上の合計 */
export const STAFF: Record<StaffKind, { title: string; name: string; hire: number; salary: number; rank: number; desc: string }> = {
  ops: { title: '運用担当', name: '森', hire: 60000, salary: 20000, rank: 100000, desc: '一度あなたが正しく対応できた種類の障害は、時間を止めずに代わりに対応する' },
  sales: { title: '営業担当', name: '早瀬', hire: 40000, salary: 15000, rank: 60000, desc: '案件メールが1日1件増え、案件メールの報酬が2割増える' },
};
export const PAYDAY = 30;
export const payroll = (staff: { ops: boolean; sales: boolean }) => (staff.ops ? STAFF.ops.salary : 0) + (staff.sales ? STAFF.sales.salary : 0);

/** 会社のランク（受け取った契約料の合計で決まる） */
export const RANKS = [
  { min: 0, name: '個人事務所' },
  { min: 100000, name: '小さな会社' },
  { min: 300000, name: '町の頼れる会社' },
  { min: 600000, name: '評判の会社' },
  { min: 1000000, name: '業界の注目株' },
] as const;
export const rankOf = (revenue: number) => RANKS.reduce((acc, r, i) => (revenue >= r.min ? i : acc), 0);

export const RACK_PRICE = 50000;
export const MAX_RACKS = 6;
export const START_RACKS = 3;
/** 案件メールが届き始める段階（柏木さんの2か月目から） */
export const MAIL_STAGE = 2;
/** 届いたメールがこの件数になるまでは、1日1件にする（慣れるまで） */
export const EARLY_MAILS = 6;

interface SaveState {
  company: Company | null;
  /** 会社の暦（何日目か） */
  clock: number;
  racks: number;
  /** 届いた案件メール */
  mailLog: { id: string; day: number }[];
  /** メールへの返事 */
  mailStatus: Record<string, 'accepted' | 'declined'>;
  setClock: (day: number) => void;
  acceptMail: (id: string) => boolean;
  declineMail: (id: string) => void;
  buyRack: () => void;
  /** 雇った社員 */
  staff: { ops: boolean; sales: boolean };
  hire: (kind: StaffKind) => void;
  /** 正しく対応できた障害の種類（運用担当に任せられる） */
  learned: string[];
  /** これまでに受け取った契約料の合計（会社のランク） */
  revenue: number;
  endingSeen: boolean;
  seeEnding: () => void;
  /** お祝いを見せたランク（ランクアップの演出に使う） */
  seenRank?: number;
  setSeenRank: (rank: number) => void;
  /** 直近の給料日（フロアで知らせる） */
  lastPay: { day: number; amount: number } | null;
  /** フロアに戻ったときに出す入金の知らせ（一度出したら消す） */
  income: string | null;
  notifyIncome: (text: string | null) => void;
  /** 効果音 */
  sound: boolean;
  setSound: (on: boolean) => void;
  /** セーブを丸ごと読み込む（引き継ぎ用） */
  importSave: (data: Partial<SaveState>) => void;
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
  respond: (customerId: string, key: string, optionId: string, learn?: { type: string; good: boolean }) => void;
  next: (customerId: string, grade: Grade) => void;
}

function initial(sim: SimCustomer): CustomerSave {
  return { month: 1, blueprint: sim.start, running: null, history: [], phase: sim.hearing ? 'hearing' : 'operate', asked: [] };
}

/** 今の月の経過日数（0〜30） */
export function dayOf(save: CustomerSave | undefined, clock: number): number {
  if (!save?.running || save.startedOn === undefined) return 0;
  return Math.max(0, Math.min(DAYS, clock - save.startedOn));
}

/** 契約の月をすべて終えたか */
export function finished(id: string, save: CustomerSave | undefined): boolean {
  const sim = simFor(id);
  return !sim || !save || !sim.months.some((m) => m.month === save.month);
}

/** ラックを使っているお客さん（受けて、まだ終わっていない） */
export function onRacks(state: Pick<SaveState, 'customers' | 'accepted'>): string[] {
  return state.accepted.filter((id) => !finished(id, customerSave(state, id)));
}

export function customerSave(state: Pick<SaveState, 'customers'>, customerId: string): CustomerSave | undefined {
  const sim = simFor(customerId);
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
        clock: 1,
        racks: START_RACKS,
        mailLog: [],
        mailStatus: {},
        setClock: (day) => {
          const st = get();
          if (day <= st.clock) return;
          const stage = unlockStage(st);
          const fresh = stage >= MAIL_STAGE
            ? Array.from({ length: day - st.clock }, (_, i) => st.clock + 1 + i).flatMap((d) => mailsForDay(d, Math.min(3, stage), st.staff.sales, st.mailLog.length < EARLY_MAILS).map((id) => ({ id, day: d })))
            : [];
          // 古いメールは記録から落とす（受けたものは残す）
          const mailLog = [...st.mailLog, ...fresh].filter((m) => day - m.day < 30 || st.mailStatus[m.id] === 'accepted');
          // 30日ごとに給料を払う
          const paydays = Math.floor((day - 1) / PAYDAY) - Math.floor((st.clock - 1) / PAYDAY);
          const salary = paydays * payroll(st.staff);
          set({
            clock: day, mailLog,
            company: st.company && salary ? { ...st.company, cash: st.company.cash - salary } : st.company,
            lastPay: salary ? { day, amount: salary } : st.lastPay,
          });
        },
        acceptMail: (id) => {
          const st = get();
          if (onRacks(st).length >= st.racks || !simFor(id)) return false;
          set({ accepted: [...new Set([...st.accepted, id])], active: id, mailStatus: { ...st.mailStatus, [id]: 'accepted' } });
          return true;
        },
        declineMail: (id) => set({ mailStatus: { ...get().mailStatus, [id]: 'declined' } }),
        buyRack: () => {
          const st = get();
          if (!st.company || st.racks >= MAX_RACKS || st.company.cash < RACK_PRICE) return;
          sfx.coin();
          set({ racks: st.racks + 1, company: { ...st.company, cash: st.company.cash - RACK_PRICE } });
        },
        customers: {},
        accepted: [],
        active: null,
        accept: (customerId) => {
          if (onRacks(get()).length < get().racks) set({ accepted: [...new Set([...get().accepted, customerId])], active: customerId });
        },
        setActive: (customerId) => get().accepted.includes(customerId) && set({ active: customerId }),
        setSite: (customerId, value) => update(customerId, (c) => (c.running ? c : { ...c, blueprint: { ...c.blueprint, site: value } })),
        setCredential: (customerId, value) => update(customerId, (c) => (c.running ? c : { ...c, blueprint: { ...c.blueprint, credential: value } })),
        review: {},
        seenRules: [],
        tips: [],
        dismissTip: (id) => set({ tips: [...new Set([...get().tips, id])] }),
        resetTips: () => set({ tips: [] }),
        staff: { ops: false, sales: false },
        learned: [],
        revenue: 0,
        endingSeen: false,
        seeEnding: () => set({ endingSeen: true }),
        setSeenRank: (rank) => set({ seenRank: rank }),
        lastPay: null,
        income: null,
        notifyIncome: (text) => set({ income: text }),
        sound: true,
        setSound: (on) => { setSoundEnabled(on); set({ sound: on }); },
        hire: (kind) => {
          const st = get();
          const s = STAFF[kind];
          if (!st.company || st.staff[kind] || st.company.cash < s.hire || st.revenue < s.rank) return;
          sfx.fanfare();
          set({ staff: { ...st.staff, [kind]: true }, company: { ...st.company, cash: st.company.cash - s.hire } });
        },
        importSave: (data) => set({ ...data }),
        newGame: (name) => set({ staff: { ops: false, sales: false }, learned: [], revenue: 0, endingSeen: false, seenRank: 0, lastPay: null, company: { name, cash: START_CASH }, clock: 1, racks: START_RACKS, mailLog: [], mailStatus: {}, customers: {}, accepted: [], active: null, review: {}, seenRules: [], tips: [] }),
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
            const max = simFor(customerId)?.hearing?.maxQuestions ?? 0;
            return c.asked.includes(questionId) || c.asked.length >= max ? c : { ...c, asked: [...c.asked, questionId] };
          }),
        setPhase: (customerId, phase) => update(customerId, (c) => ({ ...c, phase })),
        startMonth: (customerId) => update(customerId, (c) => (c.running ? c : { ...c, running: c.blueprint, startedOn: get().clock, responses: {} })),
        respond: (customerId, key, optionId, learn) => {
          update(customerId, (c) => (c.running && !(key in (c.responses ?? {})) ? { ...c, responses: { ...c.responses, [key]: optionId } } : c));
          if (learn?.good) set({ learned: [...new Set([...get().learned, learn.type])] });
        },
        next: (customerId, grade) => {
          const sim = simFor(customerId);
          const company = get().company;
          const fee = sim ? contractFeeFor(get(), customerId, grade) : 0;
          if (company && fee > 0) sfx.coin();
          if (company && fee > 0) set({ company: { ...company, cash: company.cash + fee + (grade === 'best' ? BEST_BONUS : 0) }, revenue: get().revenue + fee });
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
              ? { ...c, month: c.month + 1, running: null, startedOn: undefined, responses: {}, history: [...c.history, { month: c.month, blueprint: c.running, responses: c.responses ?? {} }] }
              : c,
          );
          // 契約が終わったら、担当をほかのお客さんに移す
          if (finished(customerId, customerSave(get(), customerId)) && get().active === customerId) {
            set({ active: onRacks(get())[0] ?? null });
          }
        },
      };
    },
    { name: 'cloud-soudan-company-2', version: 4,
      migrate: (old, version) => {
        const o = old as { customers?: Record<string, CustomerSave> };
        const had = Object.keys(o.customers ?? {});
        const base = version < 3 ? { review: {}, seenRules: [], accepted: had, active: had[0] ?? null, ...o } : o;
        // v4：月の経過日数を、会社の暦（clock）と月を始めた日に置き換えた
        const customers = Object.fromEntries(Object.entries(o.customers ?? {}).map(([id, c]) => [id, { ...c, startedOn: c.running ? 1 - (c.day ?? 0) : undefined }]));
        return { clock: 1, racks: START_RACKS, mailLog: [], mailStatus: {}, staff: { ops: false, sales: false }, learned: [], revenue: 0, endingSeen: false, ...base, customers };
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

/**
 * ヒアリングで聞かなかった要件のうち、構成が満たしていなかったもの（本編の最初の月だけ）。
 * 聞いていれば防げた失敗なので、お客さんの信頼が下がり、その月の契約料が減る。
 */
export function missedRequirements(sim: SimCustomer, save: CustomerSave): { id: string; label: string }[] {
  const h = sim.hearing;
  const plan = planFor(sim, save.month);
  if (!h || h.maxQuestions === 0 || save.month !== 1 || !save.running || !plan) return [];
  const revealed = new Set(h.questions.filter((q) => save.asked.includes(q.id) && q.reveals).map((q) => q.reveals!));
  const checks = verify(h, h.questions.map((q) => q.id), save.running, plan, sim.profitPerVisit);
  return h.requirements
    .filter((req) => !req.given && !revealed.has(req.id))
    .filter((req) => checks.find((c) => c.id === req.id)?.status === 'fail')
    .map((req) => ({ id: req.id, label: req.label }));
}
export const MISSED_FACTOR = 0.7;

/** その月に受け取る契約料（不合格なら0。聞き漏らし・営業担当で増減する） */
export function contractFeeFor(state: Pick<SaveState, 'customers' | 'staff'>, customerId: string, grade: Grade): number {
  const sim = simFor(customerId);
  const save = customerSave(state, customerId);
  if (!sim || !save || grade === 'fail') return 0;
  let fee = sim.contractFee;
  if (customerId.startsWith('job-') && state.staff.sales) fee *= 1.2;
  if (missedRequirements(sim, save).length > 0) fee *= MISSED_FACTOR;
  return Math.round(fee / 100) * 100;
}

/** 受信箱の案件メール（期限内で、まだ返事をしていないもの。期限の近い順） */
export function inbox(state: Pick<SaveState, 'clock' | 'mailLog' | 'mailStatus'>): { id: string; day: number; left: number }[] {
  return state.mailLog
    .filter((m) => !state.mailStatus[m.id] && state.clock - m.day < MAIL_DAYS && simFor(m.id))
    .map((m) => ({ ...m, left: MAIL_DAYS - (state.clock - m.day) }))
    // 期限の近い順（同じなら新しい順）
    .sort((a, b) => a.left - b.left || b.day - a.day);
}

/** まだ受けていない本編の依頼（条件を満たして届いているもの） */
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

// 保存してある設定を効果音に反映する
useSave.persist.onFinishHydration((st) => setSoundEnabled(st.sound));
setSoundEnabled(useSave.getState().sound);

/** 会社の暦を「○月○日」で表す。1日目＝4月1日、30日でひと月（給料日の区切りと同じ） */
export function calendar(clock: number): { year: number; month: number; date: number; label: string } {
  const m = Math.floor((clock - 1) / 30);
  const month = ((m + 3) % 12) + 1;
  const year = Math.floor((m + 3) / 12) + 1;
  const date = ((clock - 1) % 30) + 1;
  return { year, month, date, label: `${year}年目 ${month}月${date}日` };
}
