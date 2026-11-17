// 会社のお金まわり：社員、給料、利息、ラックの値段、設備。UI や保存に依存しない純粋な定義と計算。
// 金額はすべてゲーム内の値で、実際の相場ではない。

export type StaffKind = 'ops' | 'sales';
/** 社員の等級（0＝雇っていない） */
export type StaffLevels = Record<StaffKind, number>;

export interface StaffDef {
  title: string;
  name: string;
  /** 雇う費用 */
  hire: number;
  /** 雇えるようになる契約料の合計 */
  rank: number;
  maxLevel: number;
  /** 30日ごとの給料（添え字＝等級） */
  salary: number[];
  /** その等級に上げる研修の費用（添え字＝等級） */
  train: number[];
  /** 等級ごとの説明（添え字＝等級） */
  desc: string[];
}

export const STAFF: Record<StaffKind, StaffDef> = {
  ops: {
    title: '運用担当', name: '森', hire: 60000, rank: 100000, maxLevel: 2,
    salary: [0, 20000, 28000], train: [0, 0, 80000],
    desc: ['', 'あなたが正しく対応できた種類の障害を、時間を止めずに代わりに対応する', 'あなたが出会ったことのある種類の障害まで、代わりに対応する（間違えた種類も、森さんが見て覚える）'],
  },
  sales: {
    title: '営業担当', name: '早瀬', hire: 40000, rank: 60000, maxLevel: 3,
    salary: [0, 15000, 20000, 26000], train: [0, 0, 50000, 90000],
    desc: ['', '案件メールが1日1件増え、案件メールの報酬が2割増える', '案件メールの報酬が3割増える', '案件メールがさらに1日1件増え、報酬が4割増える'],
  },
};

export const payroll = (staff: StaffLevels) => STAFF.ops.salary[staff.ops]! + STAFF.sales.salary[staff.sales]!;
export const salesFeeMult = (level: number) => [1, 1.2, 1.3, 1.4][level] ?? 1;
export const salesMailBonus = (level: number) => [0, 1, 1, 2][level] ?? 0;

export const PAYDAY = 30;
export const START_CASH = 150000;
export const START_RACKS = 3;
export const MAX_RACKS = 6;
/** 4台目、5台目、6台目の値段。増やすほど高くなる */
const RACK_PRICES = [50000, 80000, 120000];
export const rackPrice = (racks: number) => RACK_PRICES[racks - START_RACKS] ?? Number.POSITIVE_INFINITY;

/** 資金がマイナスのとき、給料日ごとにマイナス額にかかる利息の割合 */
export const INTEREST_RATE = 0.1;
/** ここまで資金が減ると倒産（再建画面になる） */
export const BANKRUPT_LIMIT = -150000;
export const isBankrupt = (cash: number) => cash < BANKRUPT_LIMIT;
/** 再建のときに残る資金 */
export const REBUILD_CASH = 50000;

/** 給料日を迎えた回数ぶん、給料と利息を引く */
export function settlePayday(cash: number, staff: StaffLevels, paydays: number): { cash: number; salary: number; interest: number } {
  let c = cash, salary = 0, interest = 0;
  for (let i = 0; i < paydays; i++) {
    const s = payroll(staff);
    c -= s;
    salary += s;
    if (c < 0) {
      const it = Math.round((-c * INTEREST_RATE) / 100) * 100;
      c -= it;
      interest += it;
    }
  }
  return { cash: c, salary, interest };
}

export interface GearDef { title: string; price: number; rank: number; desc: string }
/** 設備。一度買えばずっと効く */
export const GEAR: Record<string, GearDef> = {
  monitor: { title: '監視モニター', price: 70000, rank: 60000, desc: '壁の大きな画面で、今月の障害の予兆を日ごとに予報する。身構えて月を始められる' },
};
export const GEAR_IDS = Object.keys(GEAR);
