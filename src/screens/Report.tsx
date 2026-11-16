// 月次レポート：目標の達成度、収支、発動したルールの解説。学習の本体。
import { ruleById } from '../content';
import { nameFor, simFor } from '../jobs';
import { GRADE_TEXT, PrimaryButton, Screen, Stamp, Voice, pct, yen } from '../components/ui';
import { RuleSources } from '../components/RuleSources';
import { useEffect } from 'react';
import { sfx } from '../sound';
import { Senpai } from '../components/Senpai';
import { Term } from '../components/Term';
import { go } from '../router';
import { radarScores } from '../sim/radar';
import { Radar } from '../components/Radar';
import { SLOW_DAYS_ALLOWED } from '../sim/parts';
import { modelAnswer } from '../sim/generator';
import { runMonth } from '../sim/engine';
import { BlueprintView } from '../components/BlueprintView';
import { StaticView } from '../components/StaticView';
import { unlockedAt } from '../jobs';
import { unlockStage } from '../store';
import { BEST_BONUS, MISSED_FACTOR, contractFeeFor, customerSave, missedRequirements, planFor, runningResult, useSave } from '../store';

export function Report({ customerId }: { customerId: string }) {
  const state = useSave();
  const sim = simFor(customerId);
  const save = customerSave(state, customerId);
  const plan = sim && save ? planFor(sim, save.month) : undefined;
  const result = sim && save ? runningResult(sim, save) : undefined;
  const grade = result?.grade;
  useEffect(() => {
    if (!grade) return;
    const t = setTimeout(() => (grade === 'best' ? sfx.fanfare() : grade === 'fail' ? sfx.bad() : sfx.stamp()), 450);
    return () => clearTimeout(t);
  }, [grade]);
  if (!sim || !save || !plan || !result) return <Screen title="レポートがありません"><PrimaryButton onClick={() => go({ name: 'floor' })}>フロアに戻る</PrimaryButton></Screen>;

  const name = nameFor(customerId);
  const kpis = [
    { ok: result.kpi.budget, label: '予算内', detail: `${yen(result.cost)}／${yen(plan.budget)}` },
    { ok: result.kpi.uptime, label: '稼働率', detail: `${pct(result.uptime, 2)}／目標 ${pct(plan.uptimeTarget)}` },
    { ok: result.kpi.performance, label: '重くない', detail: `重かった日 ${result.slowDays}日／${SLOW_DAYS_ALLOWED}日まで` },
    { ok: result.kpi.security, label: 'セキュリティ', detail: result.kpi.security ? '事故・指摘なし' : '問題が起きた' },
  ];
  const fee = contractFeeFor(state, customerId, result.grade);
  const missed = missedRequirements(sim, save);
  const next = () => {
    if (fee > 0) state.notifyIncome(`💰 ${name}さんから入金 +${yen(fee + (result.grade === 'best' ? BEST_BONUS : 0))}`);
    state.next(customerId, result.grade);
    go({ name: 'floor' });
  };

  return (
    <Screen title={`月次レポート：${name}さん ${save.month}か月目`} back={false} footer={
      <div className="space-y-1">
        <p className="text-center text-xs text-slate-600">
          {result.grade !== 'fail' ? <>入金：契約料 <b className="text-slate-900">+{yen(fee)}</b>{result.grade === 'best' && <>　ボーナス <b className="text-slate-900">+{yen(BEST_BONUS)}</b></>}</> : '目標を達成できなかったので、今月の契約料は入りません'}
        </p>
        <PrimaryButton onClick={next}>{planFor(sim, save.month + 1) ? '翌月へ' : '契約を完了する'}</PrimaryButton>
      </div>
    }>
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <Voice name={name} mood={result.grade === 'best' ? 'happy' : result.grade === 'good' ? 'normal' : 'troubled'}>{sim.comments[result.grade]}</Voice>
        </div>
        <Stamp grade={result.grade} />
      </div>
      <p className="text-center text-sm font-bold text-slate-900">{GRADE_TEXT[result.grade]}</p>
      <Senpai tip="report" />

      {missed.length > 0 && (
        <section className="border-2 border-amber-500 bg-amber-50 px-3 py-2 text-sm text-slate-900">
          <p className="font-bold">ヒアリングの聞き漏らし</p>
          <p className="mt-1">「最初に聞いてくれれば、伝えたのに…」 聞かなかった要件を満たせていませんでした。信頼が下がり、今月の契約料は{Math.round(MISSED_FACTOR * 100)}%になります。</p>
          <ul className="mt-1 text-xs text-amber-900">{missed.map((m) => <li key={m.id}>・{m.label}</li>)}</ul>
        </section>
      )}

      <section>
        <h2 className="mb-2 text-sm font-bold text-slate-700">今月の目標</h2>
        <ul className="divide-y divide-slate-200 rounded-xl border border-slate-300 text-sm">
          {kpis.map((k) => (
            <li key={k.label} className="flex items-center justify-between px-3 py-2">
              <span className="font-bold text-slate-900"><span className={k.ok ? 'text-emerald-700' : 'text-red-700'}>{k.ok ? '✓' : '✗'}</span> {k.label}</span>
              <span className="tabular-nums text-slate-600">{k.detail}</span>
            </li>
          ))}
        </ul>
      </section>

      {result.incidents.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-bold text-slate-700">あなたの障害対応</h2>
          <ul className="space-y-2">
            {result.incidents.map(({ incident, option }) => (
              <li key={incident.key} className={`border px-3 py-2 text-sm ${option.good ? 'border-emerald-300' : 'border-red-300'}`}>
                <p className="text-[11px] text-slate-500">{incident.day}日目</p>
                <p className="font-bold text-slate-900"><span className={option.good ? 'text-emerald-700' : 'text-red-700'}>{option.good ? '◎' : '×'}</span> {option.label}</p>
                <p className="mt-1 text-slate-800">{option.result}</p>
                {!option.good && <p className="mt-1 text-xs text-slate-600">良い対応：{incident.options.find((o) => o.good)?.label}</p>}
                <p className="mt-1 text-xs">関係する用語：<Term id={incident.termId} /></p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {save.running && <Radar scores={radarScores(save.running, plan, sim.features.includes('files'))} priority={sim.priority} />}

      <section>
        <h2 className="mb-2 text-sm font-bold text-slate-700">今月の収支（{name}さん）</h2>
        <dl className="rounded-xl border border-slate-300 px-3 py-2 text-sm tabular-nums">
          <div className="flex justify-between py-0.5"><dt>もうけ</dt><dd>{yen(result.earned)}</dd></div>
          <div className="flex justify-between py-0.5 text-slate-500"><dt>（止まる・重いで逃したもうけ）</dt><dd>{yen(result.lost)}</dd></div>
          <div className="flex justify-between py-0.5"><dt>AWSの請求額</dt><dd className="text-red-700">−{yen(result.cost)}</dd></div>
          <div className="mt-1 flex justify-between border-t border-slate-200 pt-1.5 font-bold"><dt>手元に残った額</dt><dd className="text-base">{yen(result.net)}</dd></div>
        </dl>
      </section>

      {result.grade !== 'best' && save.running && (() => {
        const kind = save.running.site !== 'none' ? 'static' : 'web';
        const model = modelAnswer(sim.profitPerVisit, plan, kind, unlockedAt(unlockStage(state)));
        if (!model) return null;
        const m = runMonth(sim.profitPerVisit, plan, { ...save.running, ...model });
        return (
          <details className="rounded-xl border border-emerald-400 px-3 py-2 text-sm">
            <summary className="cursor-pointer font-bold text-emerald-800">模範の構成を見る（目標をすべて満たす、いちばん安い例）</summary>
            <div className="mt-2 space-y-2">
              {kind === 'static' ? <StaticView blueprint={model} /> : <BlueprintView blueprint={model} />}
              <p className="text-xs text-slate-700">
                月額 {yen(m.cost)}／予算 {yen(plan.budget)}・稼働率 {pct(m.uptime, 2)}・重かった日 {m.slowDays}日
                {kind === 'web' && `・自動バックアップ ${model.backup ? 'あり' : 'なし'}${model.autoScaling ? '・Auto Scaling あり' : ''}・DB は外から届かない設定`}
              </p>
              <p className="text-[11px] text-slate-500">いま使える部品の中で、エンジンが総当たりで探した例です。正解は1つではありません。</p>
            </div>
          </details>
        );
      })()}

      <section>
        <h2 className="mb-2 text-sm font-bold text-slate-700">今月起きたことと、その理由</h2>
        {result.fired.length === 0 && <p className="text-sm text-slate-500">特別な出来事はありませんでした。</p>}
        <ul className="space-y-2">
          {result.fired.map((f) => {
            const rule = ruleById.get(f.ruleId);
            if (!rule) return null;
            const good = rule.tone === 'good';
            return (
              <li key={f.ruleId}>
                <details open={!good} className={`border-2 px-3 py-2 text-sm ${good ? 'border-emerald-300' : 'border-red-300'}`}>
                  <summary className="cursor-pointer list-none">
                    <span className="block text-[11px] text-slate-500">{f.day}日目・{f.label}　<span className="text-cyan-700">▼ 理由</span></span>
                    <span className="font-bold text-slate-900"><span className={good ? 'text-emerald-700' : 'text-red-700'}>{good ? '＋' : '−'}</span> {rule.headline}</span>
                  </summary>
                  <p className="mt-1 text-slate-800">{rule.explanation}</p>
                  <p className="mt-1 rounded bg-slate-100 px-2 py-1 text-xs text-slate-700"><b>試験では：</b>{rule.examPoint}</p>
                  <RuleSources rule={rule} />
                </details>
              </li>
            );
          })}
        </ul>
      </section>
      <p className="text-center text-[11px] text-slate-400">金額はゲーム内の値です。</p>
    </Screen>
  );
}
