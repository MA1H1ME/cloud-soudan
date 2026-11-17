// 実績と、いまの目標。会社の状態から計算する。達成すると、フロアで知らせる。
import { Screen } from '../components/ui';
import { ACHIEVEMENTS, currentGoals, doneIds } from '../achievements';
import { factsOf, useSave } from '../store';

export function Achievements() {
  const state = useSave();
  const facts = factsOf(state);
  const done = new Set(doneIds(facts));
  const goals = currentGoals(facts);
  const finals = ACHIEVEMENTS.filter((a) => a.goal);
  const normal = ACHIEVEMENTS.filter((a) => !a.goal);

  const row = (a: (typeof ACHIEVEMENTS)[number]) => {
    const ok = done.has(a.id);
    const p = a.progress ? a.progress(facts) : undefined;
    return (
      <li key={a.id} className={`rounded-lg border px-3 py-2 text-sm ${ok ? 'border-amber-400 bg-amber-50' : 'border-slate-300'}`}>
        <p className="font-bold text-slate-900">{ok ? '🏆' : '🔒'} {a.title}</p>
        <p className="text-xs text-slate-700">{a.desc}</p>
        {!ok && p !== undefined && (
          <div className="mt-1 h-1.5 rounded bg-slate-200" role="img" aria-label={`進み具合 ${Math.round(p * 100)}%`}><div className="h-1.5 rounded bg-teal-600" style={{ width: `${p * 100}%` }} /></div>
        )}
      </li>
    );
  };

  return (
    <Screen title="実績">
      <p className="text-sm text-slate-700">達成した実績：<b className="text-slate-900">{done.size}</b>／{ACHIEVEMENTS.length}</p>
      {goals.length > 0 && (
        <section className="space-y-2 rounded-xl border-2 border-teal-600 bg-teal-50 px-3 py-3">
          <h2 className="text-sm font-bold text-slate-900">いまの目標（近いものから）</h2>
          <ul className="space-y-2">{goals.map(row)}</ul>
        </section>
      )}
      <section className="space-y-2">
        <h2 className="text-sm font-bold text-slate-700">最終目標</h2>
        <ul className="space-y-2">{finals.map(row)}</ul>
      </section>
      <section className="space-y-2">
        <h2 className="text-sm font-bold text-slate-700">実績</h2>
        <ul className="space-y-2">{normal.map(row)}</ul>
      </section>
    </Screen>
  );
}
