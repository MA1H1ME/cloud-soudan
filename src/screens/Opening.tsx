// オープニング：先輩の話を聞き、社名を決める。
import { useState } from 'react';
import { go } from '../router';
import { useSave } from '../store';
import { Person, PX, Tiles } from '../components/pixel';

const LINES = [
  'ようこそ！ 今日から君が、この小さな会社の担当だ。',
  'うちの仕事は、お客さんのシステムをAWSで預かって、毎月ちゃんと動かすこと。',
  'お客さんごとに、予算と「止めていい長さ」が違う。何を一番守りたいのかを、いつも考えるんだ。',
  'まずは社名を決めよう。',
];

export function Opening() {
  const newGame = useSave((s) => s.newGame);
  const [line, setLine] = useState(0);
  const [name, setName] = useState('ハレノヒ・クラウド');
  const asking = line >= LINES.length - 1;
  const decide = () => {
    const n = name.trim();
    if (!n) return;
    newGame(n.slice(0, 16));
    go({ name: 'floor' });
  };

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col" style={{ background: PX.night }}>
      <svg viewBox="0 0 272 208" className="pixel w-full" aria-hidden="true">
        <Tiles x={0} y={0} cols={17} rows={13} a={PX.f1} b={PX.f2} />
        <rect width="272" height="20" fill={PX.wall} />
        <g className="bob"><Person x={70} y={80} shirt="#2f7d5b" s={3} /></g>
        <Person x={170} y={92} shirt="#4f7fd8" s={2.5} />
        <text x="85" y="170" textAnchor="middle" fontSize="11" fill={PX.ink}>鷹野先輩</text>
        <text x="182" y="170" textAnchor="middle" fontSize="11" fill={PX.ink}>あなた</text>
      </svg>
      <div className="flex flex-1 flex-col gap-4 px-4 py-4">
        <button
          type="button" onClick={() => !asking && setLine(line + 1)}
          className="min-h-28 w-full border-2 border-white px-4 py-3 text-left text-white" style={{ background: PX.box }}
          aria-live="polite"
        >
          <span className="block text-xs font-bold text-yellow-300">鷹野</span>
          <span className="mt-1 block leading-relaxed">{LINES[line]}</span>
          {!asking && <span className="bob mt-1 block text-right text-xs text-yellow-300">▼ タップで続き</span>}
        </button>
        {asking && (
          <div className="space-y-3">
            <label className="block text-sm text-white">
              社名
              <input
                value={name} onChange={(e) => setName(e.target.value)} maxLength={16}
                className="mt-1 block w-full border-2 border-yellow-300 bg-white px-3 py-2 text-slate-900"
              />
            </label>
            <button type="button" onClick={decide} disabled={!name.trim()} className="w-full py-3 font-bold text-white disabled:opacity-50" style={{ background: PX.btn }}>
              決定
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
