import type { ReactNode } from 'react';
import type { Grade } from '../sim/engine';

export const yen = (n: number) => `¥${Math.round(n).toLocaleString('ja-JP')}`;
export const pct = (n: number, digits = 1) => `${(n * 100).toFixed(digits)}%`;

export const GRADE_MARK: Record<Grade, string> = { best: '◎', good: '○', fair: '△', fail: '×' };
export const GRADE_TEXT: Record<Grade, string> = {
  best: '目標をすべて達成',
  good: '目標をほぼ達成',
  fair: '目標の半分を達成',
  fail: '目標を達成できず',
};

export function Screen({ title, right, children, footer }: { title: string; right?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col overflow-x-clip bg-white">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur">
        <h1 className="text-base font-bold text-slate-900">{title}</h1>
        {right}
      </header>
      <main className="flex-1 space-y-4 px-4 py-4">{children}</main>
      {footer && <footer className="sticky bottom-0 z-10 border-t border-slate-200 bg-white px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">{footer}</footer>}
    </div>
  );
}

export function PrimaryButton({ children, onClick, disabled }: { children: ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="w-full rounded-full border-2 border-blue-600 bg-blue-50 py-3 font-bold text-slate-900 active:bg-blue-100 disabled:border-slate-300 disabled:bg-slate-50 disabled:text-slate-400"
    >
      {children}
    </button>
  );
}

export type Mood = 'normal' | 'happy' | 'troubled';

/** 顔アイコン。表情3種（通常／喜ぶ／困る） */
export function Face({ mood, size = 44 }: { mood: Mood; size?: number }) {
  const mouth = mood === 'happy' ? 'M14 25q8 8 16 0' : mood === 'troubled' ? 'M14 29q8 -7 16 0' : 'M15 27h14';
  return (
    <svg viewBox="0 0 44 44" width={size} height={size} aria-hidden="true" className="shrink-0">
      <circle cx="22" cy="22" r="21" className="fill-amber-100 stroke-amber-300" />
      <path d="M6 16q16 -18 32 0q-16 -6 -32 0z" className="fill-slate-600" />
      {mood === 'troubled' ? (
        <path d="M12 16l6 2M32 16l-6 2" className="stroke-slate-700" strokeWidth="1.5" strokeLinecap="round" />
      ) : null}
      <circle cx="16" cy="20" r="1.8" className="fill-slate-800" />
      <circle cx="28" cy="20" r="1.8" className="fill-slate-800" />
      <path d={mouth} className="fill-none stroke-slate-800" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function Voice({ name, mood, children }: { name: string; mood: Mood; children: ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <Face mood={mood} />
      <p className="flex-1 rounded-2xl rounded-tl-sm bg-slate-100 px-3 py-2 text-sm text-slate-900">
        <span className="mb-0.5 block text-[11px] text-slate-500">{name}</span>
        {children}
      </p>
    </div>
  );
}

export function Stamp({ grade }: { grade: Grade }) {
  const color = grade === 'best' || grade === 'good' ? 'border-red-600 text-red-600' : 'border-slate-500 text-slate-500';
  return (
    <div className={`stamp flex h-16 w-16 shrink-0 items-center justify-center rounded-full border-[3px] text-3xl font-bold ${color}`} role="img" aria-label={GRADE_TEXT[grade]}>
      {GRADE_MARK[grade]}
    </div>
  );
}
