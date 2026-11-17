// 設計図（ブループリント）。紺の方眼紙に、リージョン → VPC → AZ → サブネットの入れ子で描く。
// アイコンは自作の線画。AWSの公式アイコンは使わない。
import { PARTS } from '../sim/parts';
import type { Blueprint, Slot } from '../sim/schema';

const N = '#0b2545', G = '#1d4e89', L = '#d6ecff', C = '#5ad1ff', M = '#8fb3d9';
const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace';
const W = 328, H = 392;

const BOX: Record<Slot, { x: number; y: number; w: number; h: number }> = {
  public: { x: 44, y: 120, w: 240, h: 34 },
  'app-a': { x: 46, y: 204, w: 92, h: 40 },
  'app-c': { x: 190, y: 204, w: 92, h: 40 },
  'data-a': { x: 46, y: 304, w: 92, h: 40 },
  'data-c': { x: 190, y: 304, w: 92, h: 40 },
};
const SHORT: Record<string, string> = { alb: 'ALB', ec2: 'EC2', rds: 'RDS', 'rds-standby': 'スタンバイ', 'rds-replica': 'レプリカ' };

export function BlueprintView({ blueprint, selected, onSelect }: { blueprint: Blueprint; selected?: Slot | null; onSelect?: (slot: Slot) => void }) {
  const s = blueprint.slots;
  const mid = (slot: Slot) => BOX[slot].x + BOX[slot].w / 2;
  const wire = (d: string, dashed = false) => <path key={d} d={d} fill="none" stroke={L} strokeWidth={1.25} strokeDasharray={dashed ? '4 3' : undefined} markerEnd="url(#bp-arrow)" />;
  const wires = [];
  if (s.public) {
    wires.push(wire(`M164 34V${BOX.public.y - 2}`));
    if (s['app-a']) wires.push(wire(`M${mid('app-a')} ${BOX.public.y + 34}V${BOX['app-a'].y - 2}`));
    if (s['app-c']) wires.push(wire(`M${mid('app-c')} ${BOX.public.y + 34}V${BOX['app-c'].y - 2}`));
  } else if (s['app-a']) wires.push(wire(`M164 34V60H${mid('app-a')}V${BOX['app-a'].y - 2}`));
  else if (s['app-c']) wires.push(wire(`M164 34V60H${mid('app-c')}V${BOX['app-c'].y - 2}`));
  if (s['app-a']) wires.push(wire(`M${mid('app-a')} ${BOX['app-a'].y + 40}V${BOX['data-a'].y - 2}`));
  if (s['app-c'] && (s.public || !s['app-a'])) wires.push(wire(`M${mid('app-c')} ${BOX['app-c'].y + 40}V274H${mid('data-a') + 14}V${BOX['data-a'].y - 2}`));
  if (s['data-c']) wires.push(wire(`M${BOX['data-a'].x + 92} 324H${BOX['data-c'].x - 2}`, s['data-c'] === 'rds-replica'));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full rounded-lg" role="group" aria-label="構成の設計図">
      <defs>
        <marker id="bp-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M0 0L10 5L0 10z" fill={L} />
        </marker>
        <pattern id="bp-grid" width="16" height="16" patternUnits="userSpaceOnUse">
          <path d="M16 0H0V16" fill="none" stroke={G} strokeOpacity="0.55" strokeWidth="0.5" />
        </pattern>
      </defs>
      <rect width={W} height={H} fill={N} />
      <rect width={W} height={H} fill="url(#bp-grid)" />
      <circle cx="164" cy="14" r="5" fill="none" stroke={L} strokeWidth="1.25" />
      <path d="M155 30a9 7 0 0 1 18 0" fill="none" stroke={L} strokeWidth="1.25" />
      <text x="178" y="26" fontSize="10.5" fill={M} fontFamily={MONO}>利用者</text>
      <rect x="8" y="44" width="312" height="340" rx="6" fill="none" stroke={M} strokeDasharray="6 4" />
      <text x="16" y="58" fontSize="10.5" fill={M} fontFamily={MONO}>東京リージョン</text>
      <rect x="16" y="66" width="296" height="310" rx="6" fill="none" stroke={L} strokeOpacity="0.8" strokeDasharray="2 3" />
      <text x="24" y="80" fontSize="10.5" fill={L} fontFamily={MONO}>VPC</text>
      {[24, 168].map((x, i) => (
        <g key={x}>
          <rect x={x} y="86" width="136" height="282" rx="4" fill="none" stroke={M} strokeDasharray="4 3" />
          <text x={x + 68} y="100" textAnchor="middle" fontSize="10.5" fill={M} fontFamily={MONO}>{i === 0 ? 'AZ-a' : 'AZ-c'}</text>
          {[{ y: 106, h: 58 }, { y: 178, h: 80 }, { y: 278, h: 80 }].map((r) => (
            <rect key={r.y} x={x + 8} y={r.y} width="120" height={r.h} rx="4" fill="none" stroke={M} strokeWidth="0.75" />
          ))}
        </g>
      ))}
      <text x="36" y="117" fontSize="9.5" fill={M} fontFamily={MONO}>パブリック</text>
      <text x="36" y="190" fontSize="9.5" fill={M} fontFamily={MONO}>プライベート（アプリ）</text>
      <text x="36" y="290" fontSize="9.5" fill={M} fontFamily={MONO}>プライベート（データ）</text>
      {wires}
      {(Object.keys(BOX) as Slot[]).map((slot) => {
        const b = BOX[slot];
        const part = s[slot];
        const on = selected === slot;
        return (
          <g
            key={slot}
            role={onSelect ? 'button' : undefined}
            tabIndex={onSelect ? 0 : undefined}
            aria-label={`${slot}：${part ? PARTS[part].label : '空き'}`}
            onClick={onSelect ? () => onSelect(slot) : undefined}
            onKeyDown={onSelect ? (e) => (e.key === 'Enter' || e.key === ' ') && onSelect(slot) : undefined}
            style={{ cursor: onSelect ? 'pointer' : undefined }}
          >
            <rect
              x={b.x} y={b.y} width={b.w} height={b.h} rx="6"
              fill={part ? N : on ? C : 'transparent'} fillOpacity={part ? 1 : on ? 0.18 : 1}
              stroke={part ? (on ? C : L) : C} strokeWidth={on ? 2.5 : 1.25} strokeDasharray={part ? undefined : '4 3'}
            />
            <text x={b.x + b.w / 2} y={b.y + b.h / 2 + 4} textAnchor="middle" fontSize={part ? 12 : 15} fontWeight="600" fill={part ? L : C} fontFamily={MONO}>
              {part ? SHORT[part] : onSelect ? '+' : ''}
            </text>
          </g>
        );
      })}
      {blueprint.backup && <text x={mid('data-a')} y={BOX['data-a'].y + 54} textAnchor="middle" fontSize="9.5" fill={C} fontFamily={MONO}>自動バックアップ</text>}
      {blueprint.encryptDb && <text x={mid('data-a')} y={BOX['data-a'].y + 66} textAnchor="middle" fontSize="9.5" fill={C} fontFamily={MONO}>暗号化</text>}
      {s['data-c'] && (
        <text x="164" y="318" textAnchor="middle" fontSize="9" fill={M} fontFamily={MONO}>{s['data-c'] === 'rds-standby' ? '同期' : '非同期'}</text>
      )}
      {blueprint.autoScaling && s.public && <text x="164" y="170" textAnchor="middle" fontSize="9.5" fill={C} fontFamily={MONO}>Auto Scaling 有効</text>}
    </svg>
  );
}
