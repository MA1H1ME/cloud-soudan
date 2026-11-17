import { describe, expect, it } from 'vitest';
import { BANKRUPT_LIMIT, isBankrupt, payroll, rackPrice, salesFeeMult, salesMailBonus, settlePayday } from './economy';

describe('給料と利息', () => {
  it('雇っていなければ給料はかからない', () => {
    expect(payroll({ ops: 0, sales: 0 })).toBe(0);
    expect(settlePayday(100000, { ops: 0, sales: 0 }, 1)).toEqual({ cash: 100000, salary: 0, interest: 0 });
  });
  it('等級が上がると給料も上がる', () => {
    expect(payroll({ ops: 1, sales: 1 })).toBe(35000);
    expect(payroll({ ops: 2, sales: 3 })).toBe(54000);
  });
  it('資金が足りていれば利息はかからない', () => {
    expect(settlePayday(100000, { ops: 1, sales: 1 }, 1)).toEqual({ cash: 65000, salary: 35000, interest: 0 });
  });
  it('資金がマイナスになると、そのマイナス額の1割の利息がかかる', () => {
    // 20,000 − 35,000 = −15,000。利息 1,500
    expect(settlePayday(20000, { ops: 1, sales: 1 }, 1)).toEqual({ cash: -16500, salary: 35000, interest: 1500 });
  });
  it('給料日が複数回まとめて来たら、1回ずつ計算する', () => {
    const r = settlePayday(20000, { ops: 1, sales: 1 }, 2);
    expect(r.salary).toBe(70000);
    expect(r.interest).toBeGreaterThan(1500);
    expect(r.cash).toBe(20000 - 70000 - r.interest);
  });
  it('倒産の線', () => {
    expect(isBankrupt(BANKRUPT_LIMIT)).toBe(false);
    expect(isBankrupt(BANKRUPT_LIMIT - 100)).toBe(true);
  });
});

describe('値段と効果', () => {
  it('ラックは増やすほど高い。上限を超えたら買えない', () => {
    expect([3, 4, 5].map(rackPrice)).toEqual([50000, 80000, 120000]);
    expect(rackPrice(6)).toBe(Number.POSITIVE_INFINITY);
  });
  it('営業担当の等級で報酬とメールが増える', () => {
    expect([0, 1, 2, 3].map(salesFeeMult)).toEqual([1, 1.2, 1.3, 1.4]);
    expect([0, 1, 2, 3].map(salesMailBonus)).toEqual([0, 1, 1, 2]);
  });
});
