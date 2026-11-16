// ルールの出典（照合した公式ドキュメント）と確認日。
import type { Rule } from '../sim/schema';

export function RuleSources({ rule }: { rule: Rule }) {
  if (rule.review.status === 'draft') return <p className="mt-1 text-[11px] text-slate-400">下書き（公式ドキュメントとの照合前）</p>;
  return (
    <p className="mt-1 text-[11px] text-slate-500">
      出典（{rule.review.verifiedAt} 確認）：
      {rule.sources.map((s, i) => (
        <span key={s.url}>
          {i > 0 && '、'}
          <a href={s.url} target="_blank" rel="noreferrer" className="underline">{s.title}</a>
        </span>
      ))}
    </p>
  );
}
