import { money } from "@/lib/api";

type Point = { price: number; date: string };

export const fmtDay = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/** How many days the history covers, and whether today's price is the lowest in that window. */
export function priceFacts(points: Point[]) {
  const prices = points.map((p) => p.price);
  const lo = Math.min(...prices), hi = Math.max(...prices);
  const last = points[points.length - 1];
  const days = Math.round((new Date(last.date).getTime() - new Date(points[0].date).getTime()) / 864e5);
  return { lo, hi, last, days, isLowest: last.price <= lo };
}

/** The price line itself, with a soft green fill and the latest price marked. */
export function PriceLine({ points, height = 180, label }: { points: Point[]; height?: number; label: string }) {
  const W = 560, H = height, PX = 8, PY = 14;
  const { lo, hi } = priceFacts(points);
  const span = hi - lo || 1;
  const x = (i: number) => PX + (i / (points.length - 1)) * (W - PX * 2);
  const y = (v: number) => PY + (1 - (v - lo) / span) * (H - PY * 2);
  const line = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.price).toFixed(1)}`).join(" ");
  const area = `${line} L${x(points.length - 1).toFixed(1)},${H} L${x(0).toFixed(1)},${H} Z`;
  const lastY = y(points[points.length - 1].price);
  const id = `pl-${height}`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
      <defs>
        <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="var(--save)" stopOpacity=".18" />
          <stop offset="1" stopColor="var(--save)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <line x1={PX} x2={W - PX} y1={lastY} y2={lastY} stroke="var(--line-strong)" strokeDasharray="3 5" />
      <path d={area} fill={`url(#${id})`} />
      <path d={line} fill="none" stroke="var(--save)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(points.length - 1)} cy={lastY} r="6" fill="var(--save)" stroke="var(--card)" strokeWidth="3" />
    </svg>
  );
}

export function PriceHistory({ points }: { points: Point[] }) {
  if (points.length < 2) return <p className="hist" style={{ color: "var(--muted)" }}>Not enough price history yet.</p>;
  const { lo, hi, last, days, isLowest } = priceFacts(points);

  return (
    <div className="hist">
      <PriceLine points={points} label={`Price went from ${money(points[0].price)} to ${money(last.price)} since ${fmtDay(points[0].date)}.`} />
      <div className="legend">
        <span>{fmtDay(points[0].date)}</span>
        <span>
          High {money(hi)}, low {money(lo)}
          {isLowest ? `, lowest in ${days} days` : ""}
        </span>
        <span>{fmtDay(last.date)}</span>
      </div>
    </div>
  );
}
