// 模擬試験：スポット案件から10問を選び、時間内に答える。終わったあとに、分野ごとの正答率と間違えた問題の解説を見る。
// 問題は新しく作らない。合否は運用シムの計算で決まる（選択肢ごとの正誤は持たない）。
import { useEffect, useMemo, useRef, useState } from 'react';
import { conceptById, content, ruleById, spotById } from '../content';
import { BlueprintView } from '../components/BlueprintView';
import { RuleSources } from '../components/RuleSources';
import { StaticView } from '../components/StaticView';
import { Screen, PrimaryButton, pct, yen } from '../components/ui';
import {
  EXAM_DOMAINS, EXAM_SIZE, PASS_LINE, SECONDS_PER_QUESTION, pickQuestions, scoreExam, shuffle, type Answered, type DomainId,
} from '../exam';
import { go } from '../router';
import { fixedCost } from '../sim/engine';
import { applyPatch, judgeSpot, type SpotOutcome } from '../sim/spot';
import { sfx } from '../sound';
import { today, useSave } from '../store';

const domainOf = (conceptId: string): DomainId | undefined => conceptById.get(conceptId)?.domain as DomainId | undefined;
const mmss = (sec: number) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
/** 今日の種（日付から決まる）。同じ日に開き直しても同じ問題になる。「別の問題で」を押すと変わる */
const seedFor = (round: number) => Number(today().replace(/-/g, '')) + round * 1000;

interface Record { spotId: string; choice: string; outcome: SpotOutcome }

export function Exam() {
  const finishExam = useSave((s) => s.finishExam);
  const exams = useSave((s) => s.exams);
  const [phase, setPhase] = useState<'intro' | 'run' | 'result'>('intro');
  const [round, setRound] = useState(0);
  const [index, setIndex] = useState(0);
  const [choice, setChoice] = useState<string | null>(null);
  const [records, setRecords] = useState<Record[]>([]);
  const [left, setLeft] = useState(0);
  const finished = useRef(false);

  const ids = useMemo(() => pickQuestions(content.spots, domainOf, seedFor(round)), [round]);
  const total = ids.length;
  const limit = total * SECONDS_PER_QUESTION;

  const finish = (recs: Record[]) => {
    if (finished.current) return;
    finished.current = true;
    const answered: Answered[] = ids.map((id) => {
      const r = recs.find((x) => x.spotId === id);
      return { spotId: id, conceptId: spotById.get(id)!.conceptId, passed: Boolean(r?.outcome.passed) };
    });
    const score = scoreExam(answered, domainOf);
    finishExam(
      score,
      answered.filter((a) => !a.passed).map((a) => a.conceptId),
      recs.flatMap((r) => r.outcome.result.fired.map((f) => f.ruleId)),
    );
    setRecords(recs);
    setPhase('result');
    sfx.fanfare();
    window.scrollTo(0, 0);
  };

  // 制限時間
  useEffect(() => {
    if (phase !== 'run') return;
    const started = Date.now();
    const t = setInterval(() => {
      const rest = limit - Math.floor((Date.now() - started) / 1000);
      setLeft(Math.max(0, rest));
      if (rest <= 0) { clearInterval(t); setRecords((r) => { finish(r); return r; }); }
    }, 500);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const start = () => {
    finished.current = false;
    setRecords([]);
    setIndex(0);
    setChoice(null);
    setLeft(limit);
    setPhase('run');
  };

  if (phase === 'intro') {
    const last = exams.at(-1);
    return (
      <Screen title="模擬試験">
        <p className="text-sm leading-relaxed text-slate-800">
          お客さんの相談（構成を見て、1手選ぶ）を{Math.min(EXAM_SIZE, content.spots.length)}問、時間内に解きます。選んだあとにすぐ答えは出ません。最後に、分野ごとの正答率と、間違えた問題の解説を見ます。
        </p>
        <ul className="space-y-1 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800">
          <li>・問題数：{Math.min(EXAM_SIZE, content.spots.length)}問（4つの分野から順に出ます）</li>
          <li>・制限時間：{mmss(Math.min(EXAM_SIZE, content.spots.length) * SECONDS_PER_QUESTION)}（1問 {SECONDS_PER_QUESTION}秒の目安）</li>
          <li>・合格の目安：{Math.round(PASS_LINE * 100)}%以上（本番の合格ラインを参考にしたゲーム内の目安です）</li>
          <li>・お金は増えません。間違えた項目は、明日の復習に入ります</li>
        </ul>
        {last && <p className="text-xs text-slate-600">前回（{last.day}）：{last.score.correct}／{last.score.total}問</p>}
        <PrimaryButton onClick={start}>試験を始める</PrimaryButton>
        {exams.length > 0 && (
          <section>
            <h2 className="mb-1 text-sm font-bold text-slate-700">これまでの成績</h2>
            <ul className="space-y-1 text-sm">
              {[...exams].reverse().slice(0, 5).map((e, i) => (
                <li key={`${e.day}-${i}`} className="flex justify-between rounded border border-slate-200 px-3 py-1">
                  <span>{e.day}</span>
                  <span className="tabular-nums">{e.score.correct}／{e.score.total}（{pct(e.score.correct / Math.max(1, e.score.total), 0)}）</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </Screen>
    );
  }

  if (phase === 'run') {
    const spot = spotById.get(ids[index]!)!;
    const options = shuffle(spot.options, seedFor(round) + index * 7);
    const picked = options.find((o) => o.id === choice);
    const bp = picked ? applyPatch(spot.start, picked.patch) : spot.start;
    const next = () => {
      if (!choice) return;
      const outcome = judgeSpot(spot, choice);
      const recs = [...records, { spotId: spot.id, choice, outcome }];
      sfx.click();
      if (index + 1 >= total) finish(recs);
      else { setRecords(recs); setIndex(index + 1); setChoice(null); window.scrollTo(0, 0); }
    };
    return (
      <Screen
        title={`模擬試験 ${index + 1}／${total}`}
        back={() => confirm('試験をやめますか？ここまでの答えは記録されません。') && setPhase('intro')}
        right={<span className={`tabular-nums font-bold ${left <= 60 ? 'text-red-300' : 'text-yellow-300'}`} aria-label="残り時間">⏱ {mmss(left)}</span>}
        footer={<PrimaryButton onClick={next} disabled={!choice}>{index + 1 >= total ? '採点する' : '次の問題へ'}</PrimaryButton>}
      >
        <div className="h-1.5 rounded bg-slate-200"><div className="h-1.5 rounded bg-teal-600" style={{ width: `${(index / total) * 100}%` }} /></div>
        <p className="text-xs text-slate-500">{spot.guest}（{spot.business}）</p>
        <p className="rounded-2xl bg-slate-100 px-3 py-2 text-sm text-slate-900">{spot.voice}</p>
        <p className="rounded-lg border border-amber-400 bg-amber-50 px-3 py-2 text-sm text-slate-900"><b>目標：</b>{spot.goal}</p>
        <section className="space-y-2">
          <h2 className="text-sm font-bold text-slate-900">どう対応する？（1つだけ）</h2>
          {options.map((o) => (
            <button key={o.id} type="button" aria-pressed={choice === o.id} onClick={() => setChoice(o.id)}
              className={`min-h-11 w-full rounded-lg px-3 py-2 text-left text-sm text-slate-900 ${choice === o.id ? 'border-2 border-blue-600 bg-blue-50 font-bold' : 'border border-slate-300'}`}>
              {o.label}
            </button>
          ))}
        </section>
        {bp.site !== 'none' ? <StaticView blueprint={bp} /> : <BlueprintView blueprint={bp} />}
        <p className="text-center text-xs text-slate-500">月額 {yen(fixedCost(bp, spot.month))}／予算 {yen(spot.plan.budget)}</p>
      </Screen>
    );
  }

  // 結果
  const answered: Answered[] = ids.map((id) => ({ spotId: id, conceptId: spotById.get(id)!.conceptId, passed: Boolean(records.find((r) => r.spotId === id)?.outcome.passed) }));
  const score = scoreExam(answered, domainOf);
  const rate = score.correct / Math.max(1, score.total);
  const missed = ids.filter((id) => !answered.find((a) => a.spotId === id)?.passed);
  return (
    <Screen title="模擬試験の結果" back={() => go({ name: 'floor' })}
      footer={<div className="space-y-2">
        <PrimaryButton onClick={() => { setRound(round + 1); setPhase('intro'); }}>別の問題でもう一度</PrimaryButton>
        <button type="button" onClick={() => go({ name: 'record' })} className="min-h-11 w-full text-sm text-cyan-700 underline">学習記録を見る</button>
      </div>}>
      <section className={`rounded-xl border-2 px-3 py-3 text-center ${rate >= PASS_LINE ? 'border-emerald-500 bg-emerald-50' : 'border-red-400 bg-red-50'}`}>
        <p className="text-xs text-slate-600">正答</p>
        <p className="text-3xl font-bold tabular-nums text-slate-900">{score.correct}<span className="text-lg">／{score.total}問</span></p>
        <p className="text-sm font-bold">{pct(rate, 0)}　{rate >= PASS_LINE ? '合格の目安に届きました' : `合格の目安（${Math.round(PASS_LINE * 100)}%）まであと少し`}</p>
      </section>
      <section>
        <h2 className="mb-2 text-sm font-bold text-slate-700">分野ごとの正答率</h2>
        <ul className="space-y-2">
          {EXAM_DOMAINS.map((d) => {
            const s = score.byDomain[d.id];
            const r = s.total ? s.correct / s.total : 0;
            return (
              <li key={d.id} className="text-sm">
                <div className="flex justify-between text-slate-900"><span>{d.label}</span><span className="tabular-nums text-slate-600">{s.total ? `${s.correct}／${s.total}（${pct(r, 0)}）` : '出題なし'}</span></div>
                <div className="mt-1 h-2 rounded bg-slate-200"><div className={`h-2 rounded ${r >= PASS_LINE ? 'bg-emerald-600' : 'bg-red-500'}`} style={{ width: `${r * 100}%` }} /></div>
              </li>
            );
          })}
        </ul>
      </section>
      {missed.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-bold text-slate-700">間違えた問題（{missed.length}問）</h2>
          <ul className="space-y-3">
            {missed.map((id) => {
              const spot = spotById.get(id)!;
              const rec = records.find((r) => r.spotId === id);
              const mine = spot.options.find((o) => o.id === rec?.choice);
              const good = spot.options.filter((o) => judgeSpot(spot, o.id).passed);
              const fired = rec?.outcome.result.fired ?? [];
              return (
                <li key={id} className="space-y-1 border-2 border-red-300 px-3 py-2 text-sm">
                  <p className="text-xs text-slate-500">{spot.guest}（{spot.business}）</p>
                  <p className="text-slate-900">{spot.voice}</p>
                  <p className="text-xs"><b className="text-red-700">あなたの答え：</b>{mine?.label ?? '（時間切れ・未回答）'}{rec && rec.outcome.reasons.length > 0 && <span className="text-slate-600">（{rec.outcome.reasons.join('、')}）</span>}</p>
                  <p className="text-xs"><b className="text-emerald-700">合格する答え：</b>{good.map((o) => o.label).join(' ／ ')}</p>
                  {fired.map((f) => {
                    const rule = ruleById.get(f.ruleId);
                    return rule ? (
                      <details key={f.ruleId} className="rounded bg-slate-50 px-2 py-1">
                        <summary className="cursor-pointer text-xs font-bold text-slate-800">{rule.tone === 'good' ? '＋' : '−'} {rule.headline}</summary>
                        <p className="mt-1 text-xs text-slate-800">{rule.explanation}</p>
                        <p className="mt-1 rounded bg-slate-100 px-2 py-1 text-xs text-slate-700"><b>試験では：</b>{rule.examPoint}</p>
                        <RuleSources rule={rule} />
                      </details>
                    ) : null;
                  })}
                </li>
              );
            })}
          </ul>
          <p className="mt-2 text-xs text-slate-500">間違えた項目は、明日からの復習に入りました。</p>
        </section>
      )}
    </Screen>
  );
}
