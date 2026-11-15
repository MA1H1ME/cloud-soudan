// セーブデータ。端末の localStorage に保存する。仕様書「9. データ構造 — セーブデータ」
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { conceptById, content, scenarioById } from './content';
import { checkAll } from './engine/conditions';
import { enqueue, gameDate, initialStage, onReviewAnswered, pickDueReviews, pickReviewScenario, type ReviewItem } from './engine/review';
import { TRUST_GAIN, evaluate, type Evaluation, type Grade } from './engine/scoring';

export interface PlayRecord {
  scenarioId: string;
  playedOn: string;
  choices: Record<string, string>;
  fit: number;
  grade: Grade;
  usedHint: boolean;
}

interface SaveState {
  version: 1;
  playerName: string;
  flags: Record<string, string>;
  trust: Record<string, number>;
  completedOn: Record<string, string>;
  history: PlayRecord[];
  review: Record<string, ReviewItem>;
  setPlayerName: (name: string) => void;
  submit: (scenarioId: string, choices: Record<string, string>, usedHint: boolean) => Evaluation;
  reset: () => void;
}

const initial = {
  version: 1 as const,
  playerName: '',
  flags: {},
  trust: {},
  completedOn: {},
  history: [],
  review: {},
};

export const today = () => gameDate(new Date());

export const useSave = create<SaveState>()(
  persist(
    (set, get) => ({
      ...initial,
      setPlayerName: (playerName) => set({ playerName }),
      reset: () => set(initial),
      submit: (scenarioId, choices, usedHint) => {
        const scenario = scenarioById.get(scenarioId);
        if (!scenario) throw new Error(`unknown scenario ${scenarioId}`);
        const result = evaluate(scenario, choices);
        const day = today();
        const state = get();

        const flags = { ...state.flags };
        const review = { ...state.review };
        for (const d of scenario.decisions) {
          const opt = d.options.find((o) => o.id === choices[d.id]);
          if (opt) Object.assign(flags, opt.setFlags);
          const prev = review[d.conceptId];
          if (scenario.kind === 'review' && prev) {
            review[d.conceptId] = onReviewAnswered(prev, result.grade, scenarioId, day);
          } else if (scenario.kind === 'story' && !prev) {
            const stage = initialStage(result.grade, usedHint, Boolean(opt?.misconception));
            review[d.conceptId] = enqueue(d.conceptId, scenarioId, stage, day);
          }
        }

        set({
          flags,
          review,
          trust: { ...state.trust, [scenario.customerId]: (state.trust[scenario.customerId] ?? 0) + TRUST_GAIN[result.grade] },
          completedOn: { ...state.completedOn, [scenarioId]: day },
          history: [...state.history, { scenarioId, playedOn: day, choices, fit: result.fit, grade: result.grade, usedHint }],
        });
        return result;
      },
    }),
    { name: 'cloud-soudan-save', version: 1 },
  ),
);

/** 今日の相談：復習（期限の古い順に最大3件）→ ストーリー1件。仕様書「6. 今日の相談の決め方」 */
export function todaysScenarios(state: Pick<SaveState, 'flags' | 'completedOn' | 'review'>, day: string): string[] {
  const reviews = pickDueReviews(Object.values(state.review), conceptById, day)
    .map((item) => {
      const concept = conceptById.get(item.conceptId);
      return concept ? pickReviewScenario(item, concept) : undefined;
    })
    .filter((id): id is string => Boolean(id && scenarioById.has(id)));

  // ストーリーは1日1件：今日すでに進めていれば、新しいエピソードは出さない
  const doneToday = content.scenarios.find((s) => s.kind !== 'review' && state.completedOn[s.id] === day);
  if (doneToday) return [...reviews, doneToday.id];

  const condState = { flags: state.flags, completedOn: state.completedOn, today: day };
  const story = content.scenarios.find(
    (s) => s.kind !== 'review' && !(s.id in state.completedOn) && checkAll(s.prerequisites, condState),
  );
  return [...reviews, ...(story ? [story.id] : [])];
}
