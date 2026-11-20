// セーブデータ。端末の localStorage に保存する。
// 結果は保存せず、「その月に使った構成」だけを残して毎回計算し直す（計算は決定的）。
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { conceptById, content, ruleById } from './content';
import { MAIL_DAYS, jobFor, mailsForDay, nameFor, referralId, simFor } from './jobs';
import { addDays, enqueue, gameDate, INTERVAL_DAYS, onReviewAnswered, pickDueReviews, type ReviewItem } from './engine/review';
import { DAYS, runMonth, type Grade, type MonthResult } from './sim/engine';
import { verify } from './sim/verify';
import { setSoundEnabled, sfx } from './sound';
import type { ExamScore } from './exam';
import { type Facts } from './achievements';
import { INCIDENT_TYPES } from './sim/incidents';
import { GRADE_FEE, REFERRAL_EXTRA_DAYS, REFERRAL_FEE, START_REPUTATION, nextReputation, tierIndex, tierOf } from './reputation';
import { GEAR, MAX_RACKS, PAYDAY, REBUILD_CASH, START_CASH, START_RACKS, STAFF, rackPrice, salesFeeMult, salesMailBonus, settlePayday, type StaffKind, type StaffLevels } from './economy';
import { LOCKED_SLOTS } from './sim/parts';
import type { Responses } from './sim/incidents';
import { UNLOCK_MONTH } from './guide';
import type { Blueprint, MonthPlan, PartType, SimCustomer, Slot } from './sim/schema';

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

export interface LedgerEntry { day: number; amount: number; label: string }
const LEDGER_MAX = 300;
const appendLedger = (ledger: LedgerEntry[] | undefined, ...entries: LedgerEntry[]) => [...(ledger ?? []), ...entries.filter((e) => e.amount !== 0)].slice(-LEDGER_MAX);

export { STAFF, GEAR, GEAR_IDS, PAYDAY, START_CASH, START_RACKS, MAX_RACKS, INTEREST_RATE, BANKRUPT_LIMIT, REBUILD_CASH, payroll, rackPrice, isBankrupt, salesFeeMult, salesMailBonus } from './economy';
export type { StaffKind, StaffLevels } from './economy';
export { TIERS, tierIndex, tierOf, REFERRAL_FEE } from './reputation';

/** 会社のランク（受け取った契約料の合計で決まる） */
export const RANKS = [
  { min: 0, name: '個人事務所' },
  { min: 100000, name: '小さな会社' },
  { min: 300000, name: '町の頼れる会社' },
  { min: 600000, name: '評判の会社' },
  { min: 1000000, name: '業界の注目株' },
] as const;
export const rankOf = (revenue: number) => RANKS.reduce((acc, r, i) => (revenue >= r.min ? i : acc), 0);

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
  mailLog: { id: string; day: number; referral?: boolean }[];
  /** 会社の評判（0〜100）。月次報告の結果で上下し、案件メールの数・報酬・紹介に効く */
  reputation: number;
  /** メールへの返事 */
  mailStatus: Record<string, 'accepted' | 'declined'>;
  setClock: (day: number) => void;
  acceptMail: (id: string) => boolean;
  declineMail: (id: string) => void;
  buyRack: () => void;
  /** 雇った社員の等級（0＝いない） */
  staff: StaffLevels;
  hire: (kind: StaffKind) => void;
  /** 研修で社員の等級を1つ上げる */
  train: (kind: StaffKind) => void;
  /** 買った設備 */
  gear: string[];
  buyGear: (id: string) => void;
  /** 倒産したあとの再建：資金を少し戻す代わりに、社員は全員辞める */
  rebuild: () => void;
  /** 正しく対応できた障害の種類（運用担当に任せられる） */
  learned: string[];
  /** これまでに出会った障害の種類（正解でも不正解でも）。運用担当が2等級になると任せられる */
  encountered: string[];
  /** これまでに受け取った契約料の合計（会社のランク） */
  revenue: number;
  endingSeen: boolean;
  seeEnding: () => void;
  /** お祝いを見せたランク（ランクアップの演出に使う） */
  seenRank?: number;
  setSeenRank: (rank: number) => void;
  /** 直近の給料日（フロアで知らせる） */
  lastPay: { day: number; amount: number; interest: number } | null;
  /** フロアに戻ったときに出す入金の知らせ（一度出したら消す） */
  income: string | null;
  notifyIncome: (text: string | null) => void;
  /** お金の出入り（会社の暦の日・金額・内容）。決算の画面で使う */
  ledger: LedgerEntry[];
  /** まだ見ていない決算（給料日に、それまでの30日分をまとめる） */
  pendingSettlement: { from: number; to: number } | null;
  closeSettlement: () => void;
  /** 祝った実績（古いセーブでは未設定。最初に開いたときに、いま達成済みのものを静かに記録する） */
  achieved?: string[];
  setAchieved: (ids: string[]) => void;
  /** 模擬試験の成績（新しいものが後ろ） */
  exams: { day: string; score: ExamScore }[];
  /** 模擬試験を終えた：間違えた学習項目は翌日の復習に入れ、出会ったルールを記録する */
  finishExam: (score: ExamScore, failedConceptIds: string[], firedRuleIds: string[]) => void;
  /** 効果音 */
  sound: boolean;
  setSound: (on: boolean) => void;
  /** BGM */
  music: boolean;
  setMusic: (on: boolean) => void;
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
  setSetting: (customerId: string, key: 'backup' | 'encryptDb' | 'autoScaling' | 'dbPublic' | 'dbSgOpen' | 's3Public' | 'lifecycle', value: boolean) => void;
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
        reputation: START_REPUTATION,
        mailStatus: {},
        setClock: (day) => {
          const st = get();
          if (day <= st.clock) return;
          const stage = unlockStage(st);
          const fresh = stage >= MAIL_STAGE
            ? Array.from({ length: day - st.clock }, (_, i) => st.clock + 1 + i).flatMap((d) => mailsForDay(d, Math.min(3, stage), salesMailBonus(st.staff.sales) + tierOf(st.reputation).mails, st.mailLog.length < EARLY_MAILS).map((id) => ({ id, day: d })))
            : [];
          // 古いメールは記録から落とす（受けたものは残す）
          const mailLog = [...st.mailLog, ...fresh].filter((m) => day - m.day < 30 || st.mailStatus[m.id] === 'accepted');
          // 30日ごとに給料を払う
          const paydays = Math.floor((day - 1) / PAYDAY) - Math.floor((st.clock - 1) / PAYDAY);
          const paid = st.company && paydays > 0 ? settlePayday(st.company.cash, st.staff, paydays) : null;
          // 給料日には、それまでの30日分の決算を出す
          const payday = paydays > 0 ? Math.floor((day - 1) / PAYDAY) * PAYDAY + 1 : 0;
          set({
            clock: day, mailLog,
            company: st.company && paid ? { ...st.company, cash: paid.cash } : st.company,
            lastPay: paid && paid.salary + paid.interest > 0 ? { day, amount: paid.salary, interest: paid.interest } : st.lastPay,
            ledger: paid ? appendLedger(st.ledger, { day: payday, amount: -paid.salary, label: '社員の給料' }, { day: payday, amount: -paid.interest, label: '借入の利息' }) : st.ledger,
            pendingSettlement: payday > 1 && st.company ? { from: payday - PAYDAY, to: payday } : st.pendingSettlement,
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
          const price = rackPrice(st.racks);
          if (!st.company || st.racks >= MAX_RACKS || st.company.cash < price) return;
          sfx.coin();
          set({ racks: st.racks + 1, company: { ...st.company, cash: st.company.cash - price }, ledger: appendLedger(st.ledger, { day: st.clock, amount: -price, label: 'ラックの増設' }) });
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
        staff: { ops: 0, sales: 0 },
        gear: [],
        encountered: [],
        learned: [],
        revenue: 0,
        endingSeen: false,
        seeEnding: () => set({ endingSeen: true }),
        setSeenRank: (rank) => set({ seenRank: rank }),
        lastPay: null,
        income: null,
        notifyIncome: (text) => set({ income: text }),
        setAchieved: (ids) => set({ achieved: ids }),
        ledger: [],
        pendingSettlement: null,
        closeSettlement: () => set({ pendingSettlement: null }),
        exams: [],
        finishExam: (score, failedConceptIds, firedRuleIds) => {
          const st = get();
          const day = today();
          const review = { ...st.review };
          for (const conceptId of new Set(failedConceptIds)) {
            const prev = review[conceptId];
            review[conceptId] = prev && !prev.mastered
              ? { ...prev, stage: 1, lapses: prev.lapses + 1, dueOn: addDays(day, INTERVAL_DAYS[1]) }
              : prev ?? enqueue(conceptId, 'exam', 1, day);
          }
          set({ review, seenRules: [...new Set([...st.seenRules, ...firedRuleIds])], exams: [...st.exams, { day, score }].slice(-30) });
        },
        sound: true,
        setSound: (on) => { setSoundEnabled(on); set({ sound: on }); },
        music: true,
        setMusic: (on) => set({ music: on }),
        hire: (kind) => {
          const st = get();
          const s = STAFF[kind];
          if (!st.company || st.staff[kind] > 0 || st.company.cash < s.hire || st.revenue < s.rank) return;
          sfx.fanfare();
          set({ staff: { ...st.staff, [kind]: 1 }, company: { ...st.company, cash: st.company.cash - s.hire }, ledger: appendLedger(st.ledger, { day: st.clock, amount: -s.hire, label: `雇用（${s.title}）` }) });
        },
        train: (kind) => {
          const st = get();
          const s = STAFF[kind];
          const next = st.staff[kind] + 1;
          if (!st.company || st.staff[kind] < 1 || next > s.maxLevel || st.company.cash < s.train[next]!) return;
          sfx.fanfare();
          set({ staff: { ...st.staff, [kind]: next }, company: { ...st.company, cash: st.company.cash - s.train[next]! }, ledger: appendLedger(st.ledger, { day: st.clock, amount: -s.train[next]!, label: `研修（${s.title}）` }) });
        },
        buyGear: (id) => {
          const st = get();
          const g = GEAR[id];
          if (!st.company || !g || st.gear.includes(id) || st.company.cash < g.price || st.revenue < g.rank) return;
          sfx.coin();
          set({ gear: [...st.gear, id], company: { ...st.company, cash: st.company.cash - g.price }, ledger: appendLedger(st.ledger, { day: st.clock, amount: -g.price, label: `設備（${g.title}）` }) });
        },
        rebuild: () => {
          const st = get();
          if (!st.company) return;
          set({ staff: { ops: 0, sales: 0 }, company: { ...st.company, cash: REBUILD_CASH }, lastPay: null, ledger: appendLedger(st.ledger, { day: st.clock, amount: REBUILD_CASH - st.company.cash, label: '再建（資金の立て直し）' }) });
        },
        importSave: (data) => set({ ...data }),
        newGame: (name) => set({ ledger: [], pendingSettlement: null, achieved: [], exams: [], reputation: START_REPUTATION, staff: { ops: 0, sales: 0 }, gear: [], encountered: [], learned: [], revenue: 0, endingSeen: false, seenRank: 0, lastPay: null, company: { name, cash: START_CASH }, clock: 1, racks: START_RACKS, mailLog: [], mailStatus: {}, customers: {}, accepted: [], active: null, review: {}, seenRules: [], tips: [] }),
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
            ledger: passed ? appendLedger(st.ledger, { day: st.clock, amount: SPOT_REWARD, label: 'スポット案件の報酬' }) : st.ledger,
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
          if (learn) set({ encountered: [...new Set([...get().encountered, learn.type])], learned: learn.good ? [...new Set([...get().learned, learn.type])] : get().learned });
        },
        next: (customerId, grade) => {
          const sim = simFor(customerId);
          const company = get().company;
          const fee = sim ? contractFeeFor(get(), customerId, grade) : 0;
          // 結果で評判が上下する。段階が変わったら知らせる。◎なら、お客さんが別の案件を紹介してくれる
          const before = get().reputation;
          const after = nextReputation(before, grade);
          const notes: string[] = [];
          if (tierIndex(after) !== tierIndex(before)) notes.push(`評判が「${tierOf(after).name}」になりました`);
          let mailLog = get().mailLog;
          if (grade === 'best' && sim) {
            const id = referralId(get().clock, Math.min(3, unlockStage(get())));
            if (!mailLog.some((m) => m.id === id)) {
              mailLog = [...mailLog, { id, day: get().clock, referral: true }];
              notes.push('🤝 お客さんが案件を紹介してくれました（メールを確認）');
            }
          }
          set({ reputation: after, mailLog, income: [get().income, ...notes].filter(Boolean).join('　') || null });
          if (company && fee > 0) sfx.coin();
          if (company && fee > 0) {
            set({
              company: { ...company, cash: company.cash + fee + (grade === 'best' ? BEST_BONUS : 0) },
              revenue: get().revenue + fee,
              ledger: appendLedger(get().ledger, { day: get().clock, amount: fee, label: `契約料（${nameFor(customerId)}さん）` }, { day: get().clock, amount: grade === 'best' ? BEST_BONUS : 0, label: '◎のボーナス' }),
            });
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
    { name: 'cloud-soudan-company-2', version: 6,
      migrate: (old, version) => {
        const o = old as { customers?: Record<string, CustomerSave> };
        const had = Object.keys(o.customers ?? {});
        const base = version < 3 ? { review: {}, seenRules: [], accepted: had, active: had[0] ?? null, ...o } : o;
        // v4：月の経過日数を、会社の暦（clock）と月を始めた日に置き換えた
        const customers = Object.fromEntries(Object.entries(o.customers ?? {}).map(([id, c]) => [id, { ...c, startedOn: c.running ? 1 - (c.day ?? 0) : undefined }]));
        // v5：社員を true/false から等級（0〜）に変えた
        const oldStaff = (base as { staff?: { ops?: boolean | number; sales?: boolean | number } }).staff ?? {};
        const staff = { ops: Number(oldStaff.ops ?? 0), sales: Number(oldStaff.sales ?? 0) };
        return { clock: 1, racks: START_RACKS, mailLog: [], mailStatus: {}, learned: [], revenue: 0, endingSeen: false, gear: [], encountered: [], reputation: START_REPUTATION, ...base, staff, customers };
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
export function contractFeeFor(state: Pick<SaveState, 'customers' | 'staff' | 'reputation' | 'mailLog'>, customerId: string, grade: Grade): number {
  const sim = simFor(customerId);
  const save = customerSave(state, customerId);
  if (!sim || !save || grade === 'fail') return 0;
  let fee = sim.contractFee * GRADE_FEE[grade];
  if (customerId.startsWith('job-')) fee = fee * jobFeeFactor(state, customerId);
  if (missedRequirements(sim, save).length > 0) fee *= MISSED_FACTOR;
  return Math.round(fee / 100) * 100;
}

/** 案件メールの報酬にかかる倍率（営業担当の等級・評判の段階・紹介） */
export function jobFeeFactor(state: Pick<SaveState, 'staff' | 'reputation' | 'mailLog'>, id: string): number {
  const referral = state.mailLog.some((m) => m.id === id && m.referral);
  return salesFeeMult(state.staff.sales) * tierOf(state.reputation).fee * (referral ? REFERRAL_FEE : 1);
}

/** 受信箱に出す、今の報酬の見込み */
export function jobFeeNow(state: Pick<SaveState, 'staff' | 'reputation' | 'mailLog'>, id: string): number {
  const job = jobFor(id);
  return job ? Math.round((job.sim.contractFee * jobFeeFactor(state, id)) / 100) * 100 : 0;
}

/** 受信箱の案件メール（期限内で、まだ返事をしていないもの。期限の近い順） */
export function inbox(state: Pick<SaveState, 'clock' | 'mailLog' | 'mailStatus'>): { id: string; day: number; left: number; referral: boolean }[] {
  const days = (m: { referral?: boolean }) => MAIL_DAYS + (m.referral ? REFERRAL_EXTRA_DAYS : 0);
  return state.mailLog
    .filter((m) => !state.mailStatus[m.id] && state.clock - m.day < days(m) && simFor(m.id))
    .map((m) => ({ ...m, referral: Boolean(m.referral), left: days(m) - (state.clock - m.day) }))
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

/** 運用担当が、その種類の障害を代わりに対応できるか（1等級：正しく対応できた種類／2等級：出会ったことのある種類） */
export function canOpsHandle(state: Pick<SaveState, 'staff' | 'learned' | 'encountered'>, type: string): boolean {
  if (state.staff.ops >= 2) return state.encountered.includes(type) || state.learned.includes(type);
  return state.staff.ops >= 1 && state.learned.includes(type);
}

/** 次の給料日（会社の暦で何日目か） */
export const nextPayday = (clock: number) => (Math.floor((clock - 1) / PAYDAY) + 1) * PAYDAY + 1;

/** 実績の判定に使う、会社の状態のまとめ */
export function factsOf(state: SaveState): Facts {
  let bestMonths = 0;
  let halfBudgetBest = false;
  for (const id of state.accepted) {
    const sim = simFor(id), save = customerSave(state, id);
    if (!sim || !save) continue;
    for (const p of pastResults(sim, save)) {
      if (p.result.grade !== 'best') continue;
      bestMonths++;
      const plan = planFor(sim, p.month);
      if (plan && p.result.cost <= plan.budget / 2) halfBudgetBest = true;
    }
  }
  return {
    bestMonths, halfBudgetBest,
    jobsAccepted: state.accepted.filter((id) => id.startsWith('job-')).length,
    learned: state.learned.length, learnedTotal: INCIDENT_TYPES.length,
    rank: rankOf(state.revenue), staff: state.staff,
    staffMax: { ops: STAFF.ops.maxLevel, sales: STAFF.sales.maxLevel },
    gear: state.gear.length, racks: state.racks, maxRacks: MAX_RACKS,
    reputation: state.reputation,
    examBest: state.exams.reduce((m, e) => Math.max(m, e.score.correct / Math.max(1, e.score.total)), 0),
    examCount: state.exams.length,
    seenRules: state.seenRules.length, rulesTotal: content.rules.length,
    ending: state.endingSeen, revenue: state.revenue,
  };
}
