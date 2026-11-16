// 学習記録：分野ごとの進み具合、復習の予定、出会ったルールの読み返し、練習。
import { useState } from 'react';
import { content, ruleById } from '../content';
import { RuleSources } from '../components/RuleSources';
import { PrimaryButton, Screen } from '../components/ui';
import { INTERVAL_DAYS } from '../engine/review';
import { go } from '../router';
import { today, useSave } from '../store';

const DOMAINS = [
  { id: 'secure', label: 'セキュアな設計' },
  { id: 'resilient', label: '回復力のある設計' },
  { id: 'performant', label: '高パフォーマンスな設計' },
  { id: 'cost', label: 'コスト最適化' },
] as const;

export function Record() {
  const state = useSave();
  const [open, setOpen] = useState<string | null>(null);
  const day = today();
  const simConcepts = content.concepts.filter((c) => content.rules.some((r) => r.conceptId === c.id));

  return (
    <Screen title="学習記録" footer={<PrimaryButton onClick={() => go({ name: 'floor' })}>フロアに戻る</PrimaryButton>}>
      <section>
        <h2 className="mb-2 text-sm font-bold text-slate-700">試験の分野ごとの進み具合</h2>
        <ul className="space-y-2">
          {DOMAINS.map((d) => {
            const concepts = simConcepts.filter((c) => c.domain === d.id);
            const met = concepts.filter((c) => state.review[c.id]).length;
            const mastered = concepts.filter((c) => state.review[c.id]?.mastered).length;
            return (
              <li key={d.id} className="text-sm">
                <div className="flex justify-between text-slate-900"><span>{d.label}</span><span className="text-slate-500">{concepts.length === 0 ? '準備中' : `出会った ${met}／${concepts.length}・定着 ${mastered}`}</span></div>
                <div className="mt-1 h-2 rounded bg-slate-200"><div className="h-2 rounded bg-teal-600" style={{ width: `${concepts.length ? (met / concepts.length) * 100 : 0}%` }} /></div>
              </li>
            );
          })}
        </ul>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-bold text-slate-700">学習項目と復習の予定</h2>
        <ul className="space-y-2">
          {simConcepts.map((c) => {
            const item = state.review[c.id];
            const spots = content.spots.filter((s) => s.conceptId === c.id);
            return (
              <li key={c.id} className="rounded-xl border border-slate-300 px-3 py-2 text-sm">
                <p className="font-bold text-slate-900">{c.title}</p>
                <p className="text-xs text-slate-500">
                  {!item ? 'まだ出会っていません' : item.mastered ? '定着' : `段階 ${item.stage}／5（次は${INTERVAL_DAYS[item.stage]}日あけて確認）・${item.dueOn <= day ? '今日届いています' : `${item.dueOn} に届く予定`}`}
                </p>
                {item && spots.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-2">
                    {spots.map((s) => (
                      <button key={s.id} type="button" onClick={() => go({ name: 'spot', spotId: s.id, practice: true })} className="rounded-full border border-slate-300 px-2 py-0.5 text-xs text-slate-700">
                        練習：{s.business}
                      </button>
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-bold text-slate-700">出会ったルール（{state.seenRules.length}／{content.rules.length}）</h2>
        {state.seenRules.length === 0 && <p className="text-sm text-slate-500">1か月を回すと、起きたことの解説がここにたまります。</p>}
        <ul className="space-y-2">
          {state.seenRules.map((id) => {
            const rule = ruleById.get(id);
            if (!rule) return null;
            const good = rule.tone === 'good';
            return (
              <li key={id} className="rounded-xl border border-slate-300 text-sm">
                <button type="button" aria-expanded={open === id} onClick={() => setOpen(open === id ? null : id)} className="w-full px-3 py-2 text-left font-bold text-slate-900">
                  <span className={good ? 'text-emerald-700' : 'text-red-700'}>{good ? '＋' : '−'}</span> {rule.headline}
                </button>
                {open === id && (
                  <div className="border-t border-slate-200 px-3 py-2">
                    <p className="text-slate-800">{rule.explanation}</p>
                    <p className="mt-1 rounded bg-slate-100 px-2 py-1 text-xs text-slate-700"><b>試験では：</b>{rule.examPoint}</p>
                    <RuleSources rule={rule} />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    </Screen>
  );
}
