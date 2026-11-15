import type { ReactNode } from 'react';
import type { Line } from '../content/schema';

export function Screen({ title, children, footer }: { title: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col bg-white">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur">
        <h1 className="text-base font-bold text-slate-900">{title}</h1>
      </header>
      <main className="flex-1 space-y-4 px-4 py-4">{children}</main>
      {footer && <footer className="sticky bottom-0 border-t border-slate-200 bg-white px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">{footer}</footer>}
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

const SPEAKER: Record<Line['speaker'], string> = {
  customer: '',
  senpai: '鷹野先輩',
  player: 'あなた',
  narration: '',
};

export function Lines({ lines, customerName }: { lines: Line[]; customerName: string }) {
  return (
    <ul className="space-y-2">
      {lines.map((l, i) => (
        <li
          key={i}
          className={
            l.speaker === 'senpai'
              ? 'ml-6 rounded-2xl rounded-tr-sm bg-amber-50 px-3 py-2 text-sm text-slate-800'
              : l.speaker === 'narration'
                ? 'text-center text-xs text-slate-500'
                : 'mr-6 rounded-2xl rounded-tl-sm bg-slate-100 px-3 py-2 text-sm text-slate-900'
          }
        >
          {l.speaker !== 'narration' && (
            <span className="mb-0.5 block text-[11px] text-slate-500">{l.speaker === 'customer' ? customerName : SPEAKER[l.speaker]}</span>
          )}
          {l.text}
        </li>
      ))}
    </ul>
  );
}
