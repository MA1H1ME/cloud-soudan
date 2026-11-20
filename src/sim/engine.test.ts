import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { RULE_IDS, fixedCost, monthIncidents, runMonth, webServers } from './engine';
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

describe('氷室さん：セキュリティ最優先', () => {
  const h = simCustomerSchema.parse(parse(readFileSync(join(dir, 'sim/himuro.yaml'), 'utf8')));
  const runH = (n: number, b: Blueprint) => runMonth(h.profitPerVisit, h.months.find((m) => m.month === n)!, b);
  it('前の業者の構成のままだと、検査結果が漏れ、審査でも指摘される', () => {
    const r = runH(1, h.start);
    expect(ids(r)).toEqual(expect.arrayContaining(['s3-public-leak', 'cred-access-key']));
    expect(r.kpi.security).toBe(false);
  });
  it('非公開＋絞ったロールなら◎。フルアクセスのロールは指摘を受ける', () => {
    const fixed = { ...h.start, s3Public: false, credential: 'role-scoped' as const };
    const r = runH(1, fixed);
    expect(r.grade).toBe('best');
    expect(ids(r)).toEqual(expect.arrayContaining(['s3-presigned-private', 'cred-role-scoped']));
    expect(ids(runH(1, { ...fixed, credential: 'role-full' }))).toContain('cred-role-broad');
  });
  it('2か月目・3か月目は、可用性と性能も整えると◎', () => {
    const full = { ...h.start, s3Public: false, credential: 'role-scoped' as const, autoScaling: true, slots: { ...h.start.slots, public: 'alb' as const, 'app-c': 'ec2' as const, 'data-c': 'rds-standby' as const } };
    expect(runH(2, full).grade).toBe('best');
    expect(runH(3, full).grade).toBe('best');
  });
});

describe('灯さん：コスト最優先の静的サイト', () => {
  const a = simCustomerSchema.parse(parse(readFileSync(join(dir, 'sim/akari.yaml'), 'utf8')));
  const runA = (n: number, b: Blueprint) => runMonth(a.profitPerVisit, a.months.find((m) => m.month === n)!, b);
  it('借り物のサーバーのままだと、拡散で落ち、予算も超える', () => {
    const r = runA(1, a.start);
    expect(ids(r)).toEqual(expect.arrayContaining(['static-ec2-overload', 'static-on-ec2']));
    expect(r.kpi.budget).toBe(false);
  });
  it('S3 のウェブサイト機能だけだと安いが、HTTPS にできない', () => {
    const r = runA(1, { ...a.start, site: 's3-website' });
    expect(r.kpi.budget).toBe(true);
    expect(ids(r)).toContain('s3-website-no-https');
    expect(r.kpi.security).toBe(false);
  });
  it('S3＋CloudFront で◎。3か月目はライフサイクルルールがないと予算を超える', () => {
    const cf = { ...a.start, site: 's3-cloudfront' as const };
    expect(runA(1, cf).grade).toBe('best');
    expect(runA(2, cf).grade).toBe('best');
    expect(runA(3, cf).kpi.budget).toBe(false);
    expect(ids(runA(3, cf))).toContain('s3-no-lifecycle');
    expect(runA(3, { ...cf, lifecycle: true }).grade).toBe('best');
  });
});

describe('障害対応', () => {
  const secure = { dbPublic: false, dbSgOpen: false, backup: true };
  const key = (n: number, b: Blueprint, type: string) => monthIncidents(month(n), b).find((x) => month(n).events.slice().sort((p, q) => p.day - q.day)[Number(x.key)]!.type === type)!.key;

  it('選ぶ前は、対応による補正をかけない', () => {
    const b = bp({}, secure);
    expect(runMonth(k.profitPerVisit, month(1), b, {}).uptime).toBe(run(1, b).uptime);
  });
  it('バックアップからの復元：新しいインスタンスを作れば半日、上書きを待つと1日止まる', () => {
    const b = bp({}, secure);
    const kk = key(1, b, 'db-failure');
    const good = runMonth(k.profitPerVisit, month(1), b, { [kk]: 'restore' });
    const bad = runMonth(k.profitPerVisit, month(1), b, { [kk]: 'overwrite' });
    expect(good.uptime).toBeGreaterThan(bad.uptime);
    expect(good.kpi.uptime).toBe(true);
    expect(bad.kpi.uptime).toBe(false);
  });
  it('マルチAZなら判断は要らない', () => {
    const b = bp({ 'data-c': 'rds-standby' }, secure);
    expect(monthIncidents(month(1), b).some((x) => x.key === key(1, bp({}, secure), 'db-failure'))).toBe(false);
  });
  it('ALB があれば、手で1台足すと混雑がやわらぐ', () => {
    const b = bp({ public: 'alb' }, secure);
    const kk = key(1, b, 'spike');
    const added = runMonth(k.profitPerVisit, month(1), b, { [kk]: 'add' });
    const waited = runMonth(k.profitPerVisit, month(1), b, { [kk]: 'wait' });
    expect(added.slowDays).toBeLessThan(waited.slowDays);
    expect(added.cost).toBeGreaterThan(waited.cost);
  });
  it('ALB がなければ、2台目を起動しても混雑は変わらない', () => {
    const b = bp({}, secure);
    const kk = key(1, b, 'spike');
    const added = runMonth(k.profitPerVisit, month(1), b, { [kk]: 'add' });
    expect(added.slowDays).toBe(runMonth(k.profitPerVisit, month(1), b, { [kk]: 'wait' }).slowDays);
  });
  it('外から届くDB：接続元を絞れば損害が小さくなる', () => {
    const b = bp({}, { backup: true, dbPublic: true, dbSgOpen: true });
    const kk = key(1, b, 'probe');
    const sg = runMonth(k.profitPerVisit, month(1), b, { [kk]: 'sg' });
    const pw = runMonth(k.profitPerVisit, month(1), b, { [kk]: 'password' });
    expect(sg.net).toBeGreaterThan(pw.net);
  });
});

describe('読み込みの急増', () => {
  const plan = { ...month(1), events: [{ day: 20, type: 'read-surge' as const, label: '月末の集計', days: 3 }] };
  it('リードレプリカがあれば重くならない', () => {
    const r = runMonth(k.profitPerVisit, plan, bp({ 'data-c': 'rds-replica' }));
    expect(ids(r)).toContain('db-replica-read');
    expect(r.slowDays).toBe(0);
  });
  it('スタンバイは読み取りに使えないので、3日間重くなる', () => {
    const r = runMonth(k.profitPerVisit, plan, bp({ 'data-c': 'rds-standby' }));
    expect(ids(r)).toContain('db-read-bottleneck');
    expect(r.slowDays).toBe(3);
    expect(r.kpi.performance).toBe(false);
  });
});

describe('保管時の暗号化の審査', () => {
  const plan = { ...month(1), events: [{ day: 15, type: 'encryption-audit' as const, label: '審査' }] };
  it('暗号化していれば、そのまま通過する', () => {
    const r = runMonth(k.profitPerVisit, plan, bp({}, { encryptDb: true }));
    expect(ids(r)).toContain('db-encrypted');
    expect(r.kpi.security).toBe(true);
  });
  it('暗号化していなければ、指摘を受けて損害が出る', () => {
    const on = runMonth(k.profitPerVisit, plan, bp({}, { encryptDb: true }));
    const off = runMonth(k.profitPerVisit, plan, bp({}, { encryptDb: false }));
    expect(ids(off)).toContain('db-unencrypted');
    expect(off.kpi.security).toBe(false);
    expect(off.net).toBeLessThan(on.net);
  });
});

describe('久我さん（速さ最優先）', () => {
  const kuga = simCustomerSchema.parse(parse(readFileSync(join(dir, 'sim/kuga.yaml'), 'utf8')));
  const good = { ...kuga.start, encryptDb: true, slots: { ...kuga.start.slots, public: 'alb' as const, 'app-c': 'ec2' as const, 'data-c': 'rds-replica' as const } };
  it('ALB・2台・リードレプリカ・暗号化で、どの月も◎を取れる', () => {
    for (const m of kuga.months) expect(runMonth(kuga.profitPerVisit, m, good, { '0': 'promote' }).grade, `month ${m.month}`).toBe('best');
  });
  it('最初の構成のままでは、どの月も◎にならない', () => {
    for (const m of kuga.months) expect(runMonth(kuga.profitPerVisit, m, kuga.start).grade).not.toBe('best');
  });
});
