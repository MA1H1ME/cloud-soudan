// 用語図鑑：ゲームに出てくる用語の一覧。説明は公式ドキュメントと照合済み。
import { content } from '../content';
import { PrimaryButton, Screen } from '../components/ui';
import { Term } from '../components/Term';
import { go } from '../router';

export function Glossary() {
  return (
    <Screen title="用語図鑑" footer={<PrimaryButton onClick={() => history.length > 1 ? history.back() : go({ name: 'floor' })}>戻る</PrimaryButton>}>
      <p className="text-xs text-slate-600">用語をタップすると、説明と出典が出ます。ゲームの中でも、点線の下線がついた言葉はタップできます。</p>
      <ul className="divide-y divide-slate-200 rounded-xl border border-slate-300">
        {content.glossary.map((g) => (
          <li key={g.id} className="px-3 py-2 text-sm">
            <Term id={g.id} />
            <span className="block text-xs text-slate-600">{g.short}</span>
          </li>
        ))}
      </ul>
    </Screen>
  );
}
