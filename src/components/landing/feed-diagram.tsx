/**
 * "Many into one": loose transactions on the left, squeezed into one ribbon, out as neat rows of
 * findings on the right. Drawn with the page's one shape, a small square board.
 */

const W = 1400;
const H = 300;
const SIZE = 12;
const COUNT = 144;
const SCATTER = 48;
const RIBBON = 72;

/** Deterministic pseudo-random numbers, so server and browser draw the same picture. */
function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1_103_515_245 + 12_345) % 2_147_483_648;
    return s / 2_147_483_648;
  };
}

interface Sq {
  x: number;
  y: number;
  fill: string;
  d: number;
}

function layout(): Sq[] {
  const rand = seeded(7);
  const squares: Sq[] = [];
  for (let i = 0; i < SCATTER; i++) {
    squares.push({ x: 20 + rand() * 400, y: 20 + rand() * (H - 40), fill: rand() > 0.5 ? "#cbd5e1" : "#94a3b8", d: rand() * 500 });
  }
  for (let i = 0; i < RIBBON; i++) {
    const col = Math.floor(i / 3);
    squares.push({ x: 470 + col * 19, y: H / 2 - 22 + (i % 3) * 16, fill: "#64748b", d: 500 + col * 14 });
  }
  const rows = 4;
  const perRow = Math.ceil((COUNT - SCATTER - RIBBON) / rows);
  for (let i = 0; i < COUNT - SCATTER - RIBBON; i++) {
    const r = Math.floor(i / perRow);
    const c = i % perRow;
    squares.push({ x: 1000 + c * 64, y: 66 + r * 48, fill: "#0f766e", d: 1000 + i * 25 });
  }
  return squares;
}

const SQUARES = layout();

export function FeedDiagram({ className = "" }: { className?: string }) {
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={`feed block h-auto w-full ${className}`} data-reveal role="img" aria-label="Many loose transactions squeezed into one stream and sorted into a few rows of findings">
      {SQUARES.map((s, i) => (
        <rect key={i} x={s.x.toFixed(1)} y={s.y.toFixed(1)} width={SIZE} height={SIZE} fill={s.fill} style={{ "--d": Math.round(s.d) } as React.CSSProperties} />
      ))}
    </svg>
  );
}
