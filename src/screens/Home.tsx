// S2 ホーム（デスク）。復習もストーリーも同じ「相談」として並べる。
import { customerById, scenarioById } from '../content';
import { go } from '../router';
import { today, todaysScenarios, useSave } from '../store';
import { Screen } from '../components/ui';

export function Home() {
  const save = useSave();
  const day = today();
  const ids = todaysScenarios(save, day);
  const doneToday = new Set(save.history.filter((h) => h.playedOn === day).map((h) => h.scenarioId));
  const pending = ids.filter((id) => !doneToday.has(id));

  return (
    <Screen title="デスク">
      <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-slate-800">
        <span className="mb-0.5 block text-[11px] text-slate-500">鷹野先輩</span>
        {pending.length > 0 ? '今日の相談が届いてるよ。お客さんが一番守りたいものから考えよう。' : '今日の相談はおしまい。おつかれさま！'}
      </p>

      <section>
        <h2 className="mb-2 text-sm font-bold text-slate-700">今日の相談</h2>
        {pending.length === 0 ? (
          <p className="text-sm text-slate-500">
            {scenarioById.size === 0 ? '公開済みの相談はまだありません。' : '明日また相談が届きます。'}
          </p>
        ) : (
          <ul className="space-y-2">
            {pending.map((id) => {
              const s = scenarioById.get(id)!;
              const c = customerById.get(s.customerId);
              return (
                <li key={id}>
                  <button
                    type="button"
                    onClick={() => go({ name: 'consult', scenarioId: id })}
                    className="w-full rounded-xl border border-slate-300 px-4 py-3 text-left active:bg-slate-50"
                  >
                    <span className="block text-xs text-slate-500">{c?.name}（{c?.business}）</span>
                    <span className="font-bold text-slate-900">{s.title}</span>
                    {s.review.status === 'draft' && <span className="ml-2 rounded bg-slate-200 px-1.5 text-[10px] text-slate-600">下書き</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <p className="pt-6 text-center text-[11px] text-slate-400">AWS SAA-C03 の学習用に作られた非公式のゲームです。</p>
    </Screen>
  );
}
