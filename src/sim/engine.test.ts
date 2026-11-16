import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { RULE_IDS, fixedCost, runMonth, webServers } from './engine';
import { ruleSchema, simCustomerSchema, type Blueprint } from './schema';
import { z } from 'zod';

const dir = join(dirname(fileURLToPath(import.meta.url)), '../../content');
const k = simCustomerSchema.parse(parse(readFileSync(join(dir, 'sim/kashiwagi.yaml'), 'utf8')));
const rules = z.array(ruleSchema).parse(parse(readFileSync(join(dir, 'rules.yaml'), 'utf8')));
const month = (n: number) => k.months.find((m) => m.month === n)!;
const bp = (over: Partial<Blueprint['slots']> = {}, settings: Partial<Omit<Blueprint, 'slots'>> = {}): Blueprint => ({
  ...k.start, backup: true, dbPublic: false, dbSgOpen: false, ...settings, slots: { ...k.start.slots, ...over },
});
const run = (n: number, b: Blueprint) => runMonth(k.profitPerVisit, month(n), b);
const ids = (r: ReturnType<typeof run>) => r.fired.map((f) => f.ruleId);

describe('ルールの定義', () => {
  it('エンジンが発動させるルールは、すべて rules.yaml にある', () => {
    const defined = new Set(rules.map((r) => r.id));
    expect(RULE_IDS.filter((id) => !defined.has(id))).toEqual([]);
    expect(rules.filter((r) => !(RULE_IDS as readonly string[]).includes(r.id)).map((r) => r.id)).toEqual([]);
  });
});

describe('1か月目：コスト優先の小さな店', () => {
  it('何も足さなくても◎。半日止まるが、目標の範囲内', () => {
    const r = run(1, bp());
    expect(r.grade).toBe('best');
    expect(ids(r)).toContain('db-single-backup');
    expect(r.uptime).toBeCloseTo(1 - 0.5 / 30);
  });
  it('マルチAZにしても◎（正解は1つではない）が、手元に残る額はシングルAZのほうが多い', () => {
    const multi = run(1, bp({ 'data-c': 'rds-standby' }));
    expect(multi.grade).toBe('best');
    expect(ids(multi)).toContain('db-multi-az');
    expect(run(1, bp()).net).toBeGreaterThan(multi.net);
  });
  it('リードレプリカは自動で切り替わらない', () => {
    const r = run(1, bp({ 'data-c': 'rds-replica' }));
    expect(ids(r)).toContain('db-replica-manual');
    expect(r.uptime).toBeLessThan(run(1, bp({ 'data-c': 'rds-standby' })).uptime);
  });
  it('バックアップを切ると記録を失い、目標を割る', () => {
    const r = run(1, bp({}, { backup: false }));
    expect(ids(r)).toContain('db-no-backup');
    expect(r.kpi.uptime).toBe(false);
  });
});

describe('2か月目：アクセスが増える', () => {
  it('1台のままだと重い日が続く', () => {
    const r = run(2, bp());
    expect(r.kpi.performance).toBe(false);
    expect(ids(r)).toContain('web-single-overload');
  });
  it('2台＋ALBで◎', () => {
    const r = run(2, bp({ public: 'alb', 'app-c': 'ec2' }));
    expect(r.grade).toBe('best');
    expect(ids(r)).toContain('web-alb-spread');
  });
  it('ALBなしで2台にしても、2台目は使われない', () => {
    const b = bp({ 'app-c': 'ec2' });
    expect(webServers(b)).toEqual({ count: 2, effective: 1 });
    const r = run(2, b);
    expect(ids(r)).toContain('web-second-without-alb');
    expect(r.kpi.performance).toBe(false);
  });
  it('ALB＋Auto Scaling でも◎。増えた分の料金は動いた日だけ', () => {
    const b = bp({ public: 'alb' }, { autoScaling: true });
    const r = run(2, b);
    expect(r.grade).toBe('best');
    expect(ids(r)).toContain('asg-scale-out');
    expect(ids(r)).not.toContain('alb-single-ec2');
    expect(r.cost).toBeGreaterThan(fixedCost(b));
  });
});

describe('3か月目：止められない規模になる', () => {
  const full = bp({ public: 'alb', 'app-c': 'ec2', 'data-c': 'rds-standby' }, { autoScaling: true });
  it('Web層もDBも2つのAZに置き、Auto Scaling を入れると◎', () => {
    const r = run(3, full);
    expect(r.grade).toBe('best');
    expect(ids(r)).toEqual(expect.arrayContaining(['db-multi-az', 'web-multi-az-survive', 'asg-scale-out']));
  });
  it('1か月目の構成のままだと、AZの障害で稼働率の目標を割る', () => {
    const r = run(3, bp());
    expect(r.kpi.uptime).toBe(false);
    expect(ids(r)).toContain('web-single-az-outage');
  });
  it('台数を固定で増やしただけでは、テレビの急増に追いつけない', () => {
    const r = run(3, { ...full, autoScaling: false });
    expect(ids(r)).toContain('web-fixed-overload');
  });
  it('4か月目も同じ構成で◎', () => {
    expect(run(4, full).grade).toBe('best');
  });
});

describe('セキュリティ', () => {
  it('前任者の構成のまま（公開・接続元を絞らない）だと、不審なアクセスで情報が漏れる', () => {
    const r = run(1, k.start);
    expect(ids(r)).toContain('db-exposed');
    expect(r.kpi.security).toBe(false);
    expect(r.grade).not.toBe('best');
  });
  it('パブリックアクセスか接続元のどちらかを閉じていれば届かない', () => {
    expect(ids(run(1, bp({}, { dbPublic: true })))).toContain('db-private');
    expect(ids(run(1, bp({}, { dbSgOpen: true })))).toContain('db-private');
  });
});

describe('決定性', () => {
  it('同じ構成・同じ月は、必ず同じ結果になる', () => {
    expect(run(3, bp())).toEqual(run(3, bp()));
  });
});
