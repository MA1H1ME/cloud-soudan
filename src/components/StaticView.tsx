// 静的サイトの設計図。利用者 →（CloudFront）→ 置き場所。
import type { Blueprint } from '../sim/schema';

const N = '#0b2545', G = '#1d4e89', L = '#d6ecff', C = '#5ad1ff', M = '#8fb3d9';
const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace';

export function StaticView({ blueprint }: { blueprint: Blueprint }) {
  const cf = blueprint.site === 's3-cloudfront';
  const ec2 = blueprint.site === 'ec2';
  const box = (y: number, label: string, sub: string) => (
    <g>
      <rect x="84" y={y} width="160" height="44" rx="6" fill={N} stroke={L} strokeWidth="1.25" />
      <text x="164" y={y + 20} textAnchor="middle" fontSize="12" fontWeight="600" fill={L} fontFamily={MONO}>{label}</text>
      <text x="164" y={y + 35} textAnchor="middle" fontSize="9.5" fill={M} fontFamily={MONO}>{sub}</text>
    </g>
  );
  const arrow = (y1: number, y2: number, label?: string) => (
    <g>
      <path d={`M164 ${y1}V${y2}`} fill="none" stroke={L} strokeWidth="1.25" markerEnd="url(#sv-arrow)" />
      {label && <text x="172" y={(y1 + y2) / 2 + 3} fontSize="9.5" fill={C} fontFamily={MONO}>{label}</text>}
    </g>
  );
  return (
    <svg viewBox="0 0 328 260" className="w-full rounded-lg" role="img" aria-label="静的サイトの設計図">
      <defs>
        <marker id="sv-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill={L} /></marker>
        <pattern id="sv-grid" width="16" height="16" patternUnits="userSpaceOnUse"><path d="M16 0H0V16" fill="none" stroke={G} strokeOpacity="0.55" strokeWidth="0.5" /></pattern>
      </defs>
      <rect width="328" height="260" fill={N} /><rect width="328" height="260" fill="url(#sv-grid)" />
      <circle cx="164" cy="16" r="5" fill="none" stroke={L} strokeWidth="1.25" />
      <path d="M155 32a9 7 0 0 1 18 0" fill="none" stroke={L} strokeWidth="1.25" />
      <text x="178" y="28" fontSize="10.5" fill={M} fontFamily={MONO}>読者</text>
      {cf ? (
        <>
          {arrow(36, 62, 'HTTPS')}
          {box(64, 'Amazon CloudFront', 'エッジから配信')}
          {arrow(108, 158, 'OAC')}
          {box(160, 'Amazon S3', 'バケットは非公開')}
        </>
      ) : (
        <>
          {arrow(36, 110, ec2 ? 'HTTPS' : 'HTTP のみ')}
          {ec2 ? box(112, 'Amazon EC2', 'Webサーバー1台') : box(112, 'Amazon S3', 'ウェブサイト機能・公開')}
        </>
      )}
      {!ec2 && <text x="164" y="232" textAnchor="middle" fontSize="9.5" fill={blueprint.lifecycle ? C : M} fontFamily={MONO}>ライフサイクルルール：{blueprint.lifecycle ? 'あり（古い写真は低頻度アクセス向けへ）' : 'なし'}</text>}
    </svg>
  );
}
