// S6 解説：選ばなかった選択肢も含めてすべて解説する。最後までスクロールするとデスクに戻れる。
import { useEffect, useRef, useState } from 'react';
import { customerById, scenarioById } from '../content';
import { evaluate, GRADE_LABELS } from '../engine/scoring';
import { go } from '../router';
import { useSave } from '../store';
import { Lines, PrimaryButton, Screen } from '../components/ui';

export function Explain({ scenarioId }: { scenarioId: string }) {
  const scenario = scenarioById.get(scenarioId);
  const record = useSave((s) => s.history.findLast((h) => h.scenarioId === scenarioId));
  const end = useRef<HTMLDivElement>(null);
  const [readToEnd, setReadToEnd] = useState(false);

  useEffect(() => {
    const el = end.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => e?.isIntersecting && setReadToEnd(true));
    io.observe(el);
    return () => io.disconnect();
  }, []);

  if (!scenario || !record) return <Screen title="解説が見つかりません">{null}</Screen>;
  const name = customerById.get(scenario.customerId)?.name ?? '';

  return (
    <Screen title="解説" footer={<PrimaryButton onClick={() => go({ name: 'home' })} disabled={!readToEnd}>デスクに戻る</PrimaryButton>}>
      {scenario.decisions.map((d) => (
        <section key={d.id} className="space-y-3">
          <h2 className="font-bold text-slate-900">{d.prompt}</h2>
          <ul className="space-y-2">
            {d.options.map((o, i) => {
              const grade = evaluate(scenario, { ...record.choices, [d.id]: o.id }).grade;
              const mine = record.choices[d.id] === o.id;
              return (
                <li key={o.id} className={`rounded-xl px-4 py-3 text-sm ${mine ? 'border-2 border-blue-600' : 'border border-slate-200'}`}>
                  <p className="font-bold text-slate-900">
                    {String.fromCharCode(65 + i)}. {o.label}
                    {mine && <span className="ml-2 text-xs font-normal text-blue-700">あなたの提案</span>}
                  </p>
                  <p className="text-xs text-slate-500">{name}さんにとって：{GRADE_LABELS[grade]}</p>
                  <p className="mt-1 text-slate-800">{o.explanation}</p>
                </li>
              );
            })}
          </ul>
          <p className="rounded-xl bg-slate-100 px-3 py-2 text-sm text-slate-800">
            <span className="block text-[11px] text-slate-500">試験での問われ方</span>
            {d.examPoint}
          </p>
        </section>
      ))}

      {scenario.outro.length > 0 && <Lines lines={scenario.outro} customerName={name} />}

      <section className="text-xs text-slate-500">
        {scenario.sources.length > 0 ? (
          <ul className="space-y-1">
            {scenario.sources.map((s) => (
              <li key={s.url}>
                <a href={s.url} target="_blank" rel="noreferrer" className="underline">{s.title}</a>（確認日 {s.checkedAt}）
              </li>
            ))}
          </ul>
        ) : (
          <p>この相談は下書きです。公式ドキュメントとの照合前の内容を含みます。</p>
        )}
      </section>
      <div ref={end} className="h-1" />
    </Screen>
  );
}
