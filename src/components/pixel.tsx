// ドット絵の部品。すべて自作。四角の組み合わせだけで描く。
export const PX = {
  f1: '#e9dcc3', f2: '#e1d2b5', wall: '#8a6f55', desk: '#b07b4f', deskD: '#8c5f3a', pc: '#5b6b7a', scr: '#7fd3ff',
  skin: '#f2c9a0', hair: '#3b2a1e', s1: '#3a4256', s2: '#343b4e', rack: '#1c2230', slot: '#2d3546',
  g: '#4dff88', y: '#ffd84d', r: '#ff4d4d', smoke: '#c9cdd6', w: '#ffffff', ink: '#1b1b1b',
  night: '#1b2a4a', night2: '#22335a', bld: '#2c3e66', bld2: '#34497a', winOff: '#41557f', box: '#14203a', btn: '#2b4c7e',
  plant: '#3f9b4b', pot: '#a0522d', cloud: '#7fd3ff',
};
export const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace';

export function Person({ x, y, shirt, s = 1 }: { x: number; y: number; shirt: string; s?: number }) {
  return (
    <g>
      <rect x={x} y={y} width={10 * s} height={4 * s} fill={PX.hair} />
      <rect x={x + s} y={y + 4 * s} width={8 * s} height={7 * s} fill={PX.skin} />
      <rect x={x + 3 * s} y={y + 6 * s} width={s} height={2 * s} fill={PX.ink} />
      <rect x={x + 6 * s} y={y + 6 * s} width={s} height={2 * s} fill={PX.ink} />
      <rect x={x} y={y + 11 * s} width={10 * s} height={9 * s} fill={shirt} />
      <rect x={x + s} y={y + 20 * s} width={3 * s} height={4 * s} fill={PX.hair} />
      <rect x={x + 6 * s} y={y + 20 * s} width={3 * s} height={4 * s} fill={PX.hair} />
    </g>
  );
}

export function Desk({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <rect x={x} y={y} width="48" height="18" fill={PX.desk} />
      <rect x={x} y={y + 18} width="48" height="3" fill={PX.deskD} />
      <rect x={x + 17} y={y + 2} width="14" height="10" fill={PX.pc} />
      <rect x={x + 19} y={y + 4} width="10" height="6" fill={PX.scr} />
    </g>
  );
}

export function Tiles({ x, y, cols, rows, a, b }: { x: number; y: number; cols: number; rows: number; a: string; b: string }) {
  const out = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) out.push(<rect key={`${r}-${c}`} x={x + c * 16} y={y + r * 16} width="16" height="16" fill={(r + c) % 2 ? a : b} />);
  return <g>{out}</g>;
}
