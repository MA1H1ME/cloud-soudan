// スポット案件：復習用の短い案件。構成を見て、1手だけ直す。
import { useState } from 'react';
import { ruleById, spotById } from '../content';
import { BlueprintView } from '../components/BlueprintView';
import { StaticView } from '../components/StaticView';
import { RuleSources } from '../components/RuleSources';
import { Senpai } from '../components/Senpai';
import { Face, PrimaryButton, Screen, Stamp, pct, yen } from '../components/ui';
import { go } from '../router';
import { fixedCost } from '../sim/engine';
import { applyPatch, judgeSpot } from '../sim/spot';
import { SPOT_REWARD, useSave } from '../store';

export function SpotScreen({ spotId, practice }: { spotId: string; practice: boolean }) {
  const answerSpot = useSave((s) => s.answerSpot);
  const spot = spotById.get(spotId);
  const [choice, setChoice] = useState<string | null>(null);
  const [answered, setAnswered] = useState(false);
  const back = () => go({ name: practice ? 'record' : 'floor' });
  if (!spot) return <Screen title="案件が見つかりません"><PrimaryButton onClick={back}>戻る</PrimaryButton></Screen>;

  const option = spot.options.find((o) => o.id === choice);
  const bp = option ? applyPatch(spot.start, option.patch) : spot.start;
  const outcome = answered && choice ? judgeSpot(spot, choice) : undefined;
  const submit = () => {
    if (!choice) return;
    const o = judgeSpot(spot, choice);
    answerSpot(spot.id, o.passed, o.result.fired.map((f) => f.ruleId), practice);
    setAnswered(true);
    window.scrollTo(0, 0);
  };

  return (
    <Screen
      title={`スポット案件：${spot.guest}`}
      right={practice ? <span className="text-xs text-slate-500">練習</span> : undefined}
      footer={outcome ? <PrimaryButton onClick={back}>{practice ? '記録に戻る' : 'フロアに戻る'}</PrimaryButton> : <PrimaryButton onClick={submit} disabled={!choice}>この対応で1か月を回す</PrimaryButton>}
    >
      {!outcome && <Senpai tip="spot" />}
      {outcome && (
        <section className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <p className="text-lg font-bold text-slate-900">{outcome.passed ? '解決！' : 'うまくいかなかった'}</p>
              <p className="text-sm text-slate-600">
                {outcome.passed ? (practice ? '練習なので報酬はありません' : `報酬 +${yen(SPOT_REWARD)}。この項目は、間隔をあけてまた届きます`) : `${outcome.reasons.join('、')}。${practice ? '' : '明日、似た案件がまた届きます'}`}
              </p>
            </div>
            <Stamp grade={outcome.passed ? 'best' : 'fail'} />
          </div>
          <p className="text-sm text-slate-700">稼働率 {pct(outcome.result.uptime, 2)}／月額 {yen(outcome.result.cost)}（予算 {yen(spot.plan.budget)}）</p>
          <ul className="space-y-2">
            {outcome.result.fired.map((f) => {
              const rule = ruleById.get(f.ruleId);
              if (!rule) return null;
              const good = rule.tone === 'good';
              return (
                <li key={f.ruleId} className={`rounded-xl border px-3 py-2 text-sm ${good ? 'border-emerald-300' : 'border-red-300'}`}>
                  <p className="font-bold text-slate-900"><span className={good ? 'text-emerald-700' : 'text-red-700'}>{good ? '＋' : '−'}</span> {rule.headline}</p>
                  <p className="mt-1 text-slate-800">{rule.explanation}</p>
                  <p className="mt-1 rounded bg-slate-100 px-2 py-1 text-xs text-slate-700"><b>試験では：</b>{rule.examPoint}</p>
                  <RuleSources rule={rule} />
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <div className="flex items-start gap-2">
        <Face mood={outcome ? (outcome.passed ? 'happy' : 'troubled') : 'normal'} />
        <p className="flex-1 rounded-2xl rounded-tl-sm bg-slate-100 px-3 py-2 text-sm text-slate-900">
          <span className="mb-0.5 block text-[11px] text-slate-500">{spot.guest}（{spot.business}）</span>
          {spot.voice}
        </p>
      </div>
      <p className="rounded-lg border border-amber-400 bg-amber-50 px-3 py-2 text-sm text-slate-900"><b>目標：</b>{spot.goal}</p>

      {bp.site !== 'none' ? <StaticView blueprint={bp} /> : <BlueprintView blueprint={bp} />}
      <p className="text-center text-xs text-slate-500">
        月額 {yen(fixedCost(bp, spot.month))}／予算 {yen(spot.plan.budget)}
        {bp.site === 'none' && bp.dbPublic && '・DBのパブリックアクセスあり'}{bp.site === 'none' && bp.dbSgOpen && '・0.0.0.0/0 を許可'}{bp.site === 'none' && !bp.backup && '・自動バックアップなし'}
        {spot.files && (bp.s3Public ? '・バケット公開' : '・バケット非公開')}
        {spot.files && { 'access-key': '・アクセスキーを保存', 'role-full': '・IAMロール（フルアクセス）', 'role-scoped': '・IAMロール（必要な分だけ）' }[bp.credential]}
      </p>

      <section className="space-y-2">
        <h2 className="text-sm font-bold text-slate-900">どう対応する？（1つだけ）</h2>
        {spot.options.map((o) => (
          <button
            key={o.id} type="button" aria-pressed={choice === o.id} disabled={answered}
            onClick={() => setChoice(o.id)}
            className={`w-full rounded-lg px-3 py-2 text-left text-sm text-slate-900 ${choice === o.id ? 'border-2 border-blue-600 bg-blue-50 font-bold' : 'border border-slate-300'}`}
          >
            {o.label}
          </button>
        ))}
      </section>
    </Screen>
  );
}
