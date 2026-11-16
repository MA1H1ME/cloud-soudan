// セーブの引き継ぎ：セーブデータを文字列にして書き出し、別の端末で読み込む。サーバーには送らない。
import { useState } from 'react';
import { Screen } from '../components/ui';
import { go } from '../router';
import { useSave } from '../store';

const KEY = 'cloud-soudan-company-2';

const encode = (s: string) => btoa(String.fromCharCode(...new TextEncoder().encode(s)));
const decode = (s: string) => new TextDecoder().decode(Uint8Array.from(atob(s.trim()), (c) => c.charCodeAt(0)));

export function Transfer() {
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const hasSave = Boolean(useSave((s) => s.company));
  const exported = (() => {
    try { return hasSave ? encode(localStorage.getItem(KEY) ?? '') : ''; } catch { return ''; }
  })();

  const copy = async () => {
    try { await navigator.clipboard.writeText(exported); setMsg('コピーしました。別の端末のこの画面に貼り付けてください。'); }
    catch { setMsg('コピーできませんでした。下の文字列を長押しして、すべて選択してコピーしてください。'); }
  };
  const load = async () => {
    try {
      const json = decode(code);
      const data = JSON.parse(json) as { state?: { company?: unknown } };
      if (!data.state?.company) throw new Error('no company');
      if (hasSave && !confirm('いまのセーブデータを上書きします。よろしいですか？')) return;
      localStorage.setItem(KEY, json);
      await useSave.persist.rehydrate();
      setMsg('読み込みました。');
      go({ name: 'floor' });
    } catch {
      setMsg('読み込めませんでした。文字列が途中で切れていないか確かめてください。');
    }
  };

  return (
    <Screen title="セーブの引き継ぎ" back={hasSave ? undefined : () => go({ name: 'title' })}>
      <p className="text-sm text-slate-700">セーブデータはこの端末のブラウザの中にだけあります。機種変更やブラウザのデータ削除の前に、ここで書き出しておくと、別の端末で続きから遊べます。</p>
      {hasSave && (
        <section className="space-y-2">
          <h2 className="text-sm font-bold text-slate-900">書き出す</h2>
          <textarea readOnly value={exported} className="h-24 w-full rounded border border-slate-300 p-2 font-mono text-[10px]" onFocus={(e) => e.currentTarget.select()} aria-label="引き継ぎ用の文字列" />
          <button type="button" onClick={copy} className="w-full rounded bg-teal-700 py-2 font-bold text-white">コピーする</button>
        </section>
      )}
      <section className="space-y-2">
        <h2 className="text-sm font-bold text-slate-900">読み込む</h2>
        <textarea value={code} onChange={(e) => setCode(e.target.value)} placeholder="ここに貼り付け" className="h-24 w-full rounded border border-slate-300 p-2 font-mono text-[10px]" aria-label="読み込む文字列" />
        <button type="button" disabled={!code.trim()} onClick={load} className="w-full rounded border-2 border-teal-700 py-2 font-bold text-teal-800 disabled:opacity-40">読み込む</button>
      </section>
      {msg && <p className="rounded bg-amber-50 px-3 py-2 text-sm text-slate-900" role="status">{msg}</p>}
    </Screen>
  );
}
