// 先輩の吹き出し。見たら「わかった」で閉じる。閉じた案内は記録に残り、二度は出ない。
import { useState } from 'react';
import { TIPS } from '../guide';
import { useSave } from '../store';
import { rich } from './Term';

export function SenpaiFace({ size = 40 }: { size?: number }) {
  return (
    <svg viewBox="0 0 10 10" width={size} height={size} className="pixel shrink-0" aria-hidden="true">
      <rect width="10" height="10" fill="#2f7d5b" />
      <rect x="2" y="1" width="6" height="2" fill="#3a2a1a" />
      <rect x="2" y="3" width="6" height="4" fill="#f2c9a0" />
      <rect x="3" y="4" width="1" height="1" fill="#1b2333" /><rect x="6" y="4" width="1" height="1" fill="#1b2333" />
      <rect x="4" y="6" width="2" height="1" fill="#b4533a" />
      <rect x="1" y="8" width="8" height="2" fill="#e8eef7" />
    </svg>
  );
}

/** 一言だけの案内（閉じられない）。「次にやること」などに使う */
export function SenpaiLine({ children, dark = false }: { children: React.ReactNode; dark?: boolean }) {
  return (
    <div className={`flex items-center gap-2 px-3 py-2 text-sm ${dark ? 'text-white' : 'text-slate-900'}`}>
      <SenpaiFace size={28} />
      <p className={`flex-1 rounded-lg px-2 py-1 ${dark ? 'bg-slate-700' : 'bg-emerald-50'}`}>{children}</p>
    </div>
  );
}

export function Senpai({ tip }: { tip: string }) {
  const seen = useSave((s) => s.tips.includes(tip));
  const dismiss = useSave((s) => s.dismissTip);
  const [line, setLine] = useState(0);
  const t = TIPS[tip];
  if (!t || seen) return null;
  const last = line >= t.lines.length - 1;
  return (
    <section className="border-2 border-emerald-700 bg-emerald-50 px-3 py-2 text-sm text-slate-900" aria-live="polite">
      <div className="flex items-start gap-2">
        <SenpaiFace />
        <div className="flex-1">
          <p className="text-[11px] font-bold text-emerald-800">鷹野先輩</p>
          <p className="leading-relaxed">{rich(t.lines[line]!)}</p>
        </div>
      </div>
      <div className="mt-2 flex justify-end gap-2">
        {t.lines.length > 1 && <span className="self-center text-[11px] text-slate-500">{line + 1}／{t.lines.length}</span>}
        <button
          type="button"
          onClick={() => (last ? dismiss(tip) : setLine(line + 1))}
          className="min-h-11 min-w-20 rounded bg-emerald-700 px-4 py-2 text-sm font-bold text-white"
        >
          {last ? 'わかった' : '次へ ▶'}
        </button>
      </div>
    </section>
  );
}
