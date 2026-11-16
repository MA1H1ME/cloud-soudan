// 用語のリンクと、タップで下から出る説明シート。
// 文中では [[id|表示名]] と書くと用語リンクになる（rich 関数）。
import { Fragment, type ReactNode } from 'react';
import { create } from 'zustand';
import { termById } from '../content';
import { go } from '../router';

const useTerm = create<{ open: string | null; show: (id: string | null) => void }>((set) => ({
  open: null,
  show: (id) => set({ open: id }),
}));

export function Term({ id, children }: { id: string; children?: ReactNode }) {
  const show = useTerm((s) => s.show);
  const t = termById.get(id);
  if (!t) return <>{children}</>;
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); show(id); }}
      className="inline font-bold text-cyan-700 underline decoration-dotted underline-offset-2"
    >
      {children ?? t.term}
    </button>
  );
}

/** [[id|表示名]] または [[id]] を用語リンクに変える */
export function rich(text: string): ReactNode {
  const parts = text.split(/(\[\[[^\]]+\]\])/);
  return parts.map((p, i) => {
    const m = /^\[\[([^|\]]+)(?:\|([^\]]+))?\]\]$/.exec(p);
    return m ? <Term key={i} id={m[1]!}>{m[2]}</Term> : <Fragment key={i}>{p}</Fragment>;
  });
}

/** リンクの記法を外した文字列 */
export const plain = (text: string) => text.replace(/\[\[([^|\]]+)(?:\|([^\]]+))?\]\]/g, (_, id: string, label?: string) => label ?? termById.get(id)?.term ?? id);

export function TermSheet() {
  const { open, show } = useTerm();
  const t = open ? termById.get(open) : undefined;
  if (!t) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50" onClick={() => show(null)} role="presentation">
      <div
        role="dialog" aria-modal="true" aria-label={t.term}
        onClick={(e) => e.stopPropagation()}
        className="sheet-in w-full max-w-md space-y-2 rounded-t-2xl bg-white px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 text-sm text-slate-900"
      >
        <div className="flex items-start justify-between gap-2">
          <h2 className="text-base font-bold">{t.term}</h2>
          <button type="button" onClick={() => show(null)} className="px-2 text-slate-500" aria-label="閉じる">✕</button>
        </div>
        <p className="rounded bg-cyan-50 px-2 py-1 font-bold text-cyan-900">ひとことで：{t.short}</p>
        <p className="leading-relaxed">{t.body}</p>
        <p className="rounded bg-amber-50 px-2 py-1 text-xs text-slate-800"><b>このゲームでは：</b>{t.play}</p>
        <ul className="space-y-0.5 text-[11px] text-slate-500">
          {t.sources.map((s) => (
            <li key={s.url}>出典：<a href={s.url} target="_blank" rel="noreferrer" className="underline">{s.title}</a>（{s.checkedAt} 確認）</li>
          ))}
        </ul>
        <button type="button" onClick={() => { show(null); go({ name: 'glossary' }); }} className="text-xs text-cyan-700 underline">用語図鑑を開く</button>
      </div>
    </div>
  );
}
