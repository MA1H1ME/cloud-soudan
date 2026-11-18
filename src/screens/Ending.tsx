// 本編クリア：本編のお客さん全員の契約を終えたときに一度だけ出る。そのあとも会社は続けられる。
import { content } from '../content';
import { PrimaryButton, Screen, yen } from '../components/ui';
import { SenpaiFace } from '../components/Senpai';
import { go } from '../router';
import { simFor, nameFor } from '../jobs';
import { RANKS, customerSave, pastResults, rankOf, tierOf, useSave } from '../store';
import { GRADE_MARK } from '../components/ui';

export function Ending() {
  const state = useSave();
  const company = state.company;
  if (!company) return null;
  // 出会った順（依頼の前提をたどった深さの順）に並べる
  const depth = (id: string): number => { const a = content.sim.find((s) => s.customerId === id)?.request.after; return a ? 1 + depth(a.customerId) : 0; };
  const story = content.sim.map((s) => s.customerId).sort((a, b) => depth(a) - depth(b));
  const jobs = state.accepted.filter((id) => id.startsWith('job-'));
  const grades = (id: string) => {
    const sim = simFor(id), save = customerSave(state, id);
    return sim && save ? pastResults(sim, save).map((p) => p.result.grade) : [];
  };
  const allGrades = state.accepted.flatMap(grades);
  const reviews = Object.values(state.review);
  const done = () => { state.seeEnding(); go({ name: 'floor' }); };

  return (
    <Screen title="本編クリア" back={false} footer={<PrimaryButton onClick={done}>このまま会社を続ける</PrimaryButton>}>
      <div className="flex items-start gap-2">
        <SenpaiFace size={48} />
        <p className="flex-1 rounded-2xl rounded-tl-sm bg-emerald-50 px-3 py-2 text-sm leading-relaxed text-slate-900">
          {story.map((id) => `${nameFor(id).split(' ')[0]}さん`).join('、')}。みんな、きみに任せてよかったと言っていたぞ。予算、止まらないこと、安全、速さ。どれを一番にするかはお客さんごとに違う。それを聞き出して、根拠のある構成で応えられるようになった。もう一人前だ。
        </p>
      </div>
      <section className="rounded-xl border border-slate-300 px-3 py-3 text-sm">
        <h2 className="mb-1 font-bold text-slate-900">{company.name}のあゆみ</h2>
        <dl className="space-y-0.5 tabular-nums">
          <div className="flex justify-between"><dt>営業日数</dt><dd>{state.clock}日</dd></div>
          <div className="flex justify-between"><dt>評判</dt><dd>{state.reputation}（{tierOf(state.reputation).name}）</dd></div>
          <div className="flex justify-between"><dt>会社のランク</dt><dd>{RANKS[rankOf(state.revenue)]!.name}</dd></div>
          <div className="flex justify-between"><dt>受け取った契約料</dt><dd>{yen(state.revenue)}</dd></div>
          <div className="flex justify-between"><dt>手元の資金</dt><dd>{yen(company.cash)}</dd></div>
          <div className="flex justify-between"><dt>受けた案件メール</dt><dd>{jobs.length}件</dd></div>
          <div className="flex justify-between"><dt>目標をすべて達成した月</dt><dd>{allGrades.filter((g) => g === 'best').length}／{allGrades.length}</dd></div>
          <div className="flex justify-between"><dt>出会った学習項目／定着</dt><dd>{reviews.length}／{reviews.filter((r) => r.mastered).length}</dd></div>
          <div className="flex justify-between"><dt>覚えた障害対応</dt><dd>{state.learned.length}種類</dd></div>
        </dl>
      </section>
      <section className="text-sm">
        <h2 className="mb-1 font-bold text-slate-700">本編のお客さん</h2>
        <ul className="space-y-1">
          {story.map((id) => <li key={id} className="flex justify-between rounded border border-slate-200 px-3 py-1"><span>{nameFor(id)}さん</span><span className="tracking-widest">{grades(id).map((g) => GRADE_MARK[g]).join('')}</span></li>)}
        </ul>
      </section>
      <p className="text-xs text-slate-600">このあとも、メールで届く案件を受け続けられます。復習のスポット案件は、間隔をあけて届きます。</p>
    </Screen>
  );
}
