// 検証：聞き出した要件と、組んだ構成を突き合わせる。
import { dbExposed, dbFailure, fixedCost, runMonth } from './engine';
import type { Blueprint, CheckType, Hearing, MonthPlan } from './schema';

export interface CheckResult {
  id: string;
  status: 'pass' | 'fail' | 'unknown';
  title: string;
  detail: string;
}

const yen = (n: number) => `¥${Math.round(n).toLocaleString('ja-JP')}`;

function judge(check: CheckType, bp: Blueprint, plan: MonthPlan, profitPerVisit: number): { ok: boolean; detail: string } {
  switch (check) {
    case 'budget': {
      const cost = fixedCost(bp);
      return { ok: cost <= plan.budget, detail: `月額の見積もり ${yen(cost)}／予算 ${yen(plan.budget)}` };
    }
    case 'data':
      return bp.backup || bp.slots['data-c'] === 'rds-standby'
        ? { ok: true, detail: bp.backup ? '自動バックアップが有効です' : 'マルチAZの待機系に複製しています' }
        : { ok: false, detail: '自動バックアップが無効で、障害のときに戻せる時点がありません' };
    case 'downtime': {
      const down = dbFailure(bp).down;
      return down <= 0.5
        ? { ok: true, detail: 'データベースの障害から半日以内に戻せる構成です' }
        : { ok: false, detail: 'データベースの障害から戻すのに、半日より長くかかります' };
    }
    case 'peak': {
      const r = runMonth(profitPerVisit, plan, bp);
      return r.kpi.performance
        ? { ok: true, detail: `ピークの日も含め、重くなる日は${r.slowDays}日の見込みです` }
        : { ok: false, detail: `処理能力が足りず、重くなる日が${r.slowDays}日ある見込みです` };
    }
    case 'secure-db':
      return dbExposed(bp)
        ? { ok: false, detail: 'パブリックアクセスが有効で、セキュリティグループが 0.0.0.0/0 からの接続を許可しています' }
        : { ok: true, detail: bp.dbPublic || bp.dbSgOpen ? '届きはしませんが、片方が開いたままです。両方閉じるのが基本です' : 'パブリックアクセスなし。接続元は Web サーバーだけです' };
  }
}

export function verify(hearing: Hearing, asked: string[], bp: Blueprint, plan: MonthPlan, profitPerVisit: number): CheckResult[] {
  const revealed = new Set(hearing.questions.filter((q) => asked.includes(q.id) && q.reveals).map((q) => q.reveals!));
  return hearing.requirements.map((req) => {
    if (!req.given && !revealed.has(req.id)) {
      return { id: req.id, status: 'unknown', title: req.unknown, detail: 'ヒアリングで聞いていないため、検証できません' };
    }
    const { ok, detail } = judge(req.check, bp, plan, profitPerVisit);
    return { id: req.id, status: ok ? 'pass' : 'fail', title: req.label, detail };
  });
}
