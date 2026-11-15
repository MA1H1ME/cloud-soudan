// 案件の4ステップ（ヒアリング → 設計 → 構築 → 検証）の進み具合。
import { go } from '../router';
import type { Phase } from '../store';

const STEPS: { phase: Exclude<Phase, 'operate'>; label: string; route: 'hearing' | 'blueprint' | 'build' | 'verify' }[] = [
  { phase: 'hearing', label: '①ヒアリング', route: 'hearing' },
  { phase: 'design', label: '②設計', route: 'blueprint' },
  { phase: 'build', label: '③構築', route: 'build' },
  { phase: 'verify', label: '④検証', route: 'verify' },
];

export function StepBar({ customerId, current }: { customerId: string; current: Exclude<Phase, 'operate'> }) {
  return (
    <nav aria-label="案件の進み具合" className="flex gap-1 text-[11px]">
      {STEPS.map((s) => {
        const on = s.phase === current;
        return (
          <button
            key={s.phase} type="button" aria-current={on ? 'step' : undefined}
            onClick={() => go({ name: s.route, customerId })}
            className={`flex-1 rounded py-1.5 ${on ? 'bg-teal-700 font-bold text-white' : 'bg-slate-100 text-slate-600'}`}
          >
            {s.label}
          </button>
        );
      })}
    </nav>
  );
}
