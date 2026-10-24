import { money } from "@/lib/api";

/** Simple price line for the last few months; the latest point is highlighted. */
export function PriceHistory({ points }: { points: { price: number; date: string }[] }) {
  if (points.length < 2) return <p className="hist" style={{ color: "var(--muted)" }}>Not enough price history yet.</p>;

  const W = 560, H = 180, PX = 8, PY = 16;
  const prices = points.map((p) => p.price);
  const lo = Math.min(...prices), hi = Math.max(...prices);
  const span = hi - lo || 1;
  const x = (i: number) => PX + (i / (points.length - 1)) * (W - PX * 2);
  const y = (v: number) => PY + (1 - (v - lo) / span) * (H - PY * 2);
  const line = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.price).toFixed(1)}`).join(" ");
  const area = `${line} L${x(points.length - 1).toFixed(1)},${H} L${x(0).toFixed(1)},${H} Z`;
  const last = points[points.length - 1];
  const isLowest = last.price <= lo;
  const fmt = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

  return (
    <div className="hist">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Price went from ${money(points[0].price)} to ${money(last.price)} since ${fmt(points[0].date)}.`}>
        <path d={area} fill="var(--mint)" opacity=".7" />
        <path d={line} fill="none" stroke="var(--save)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={x(points.length - 1)} cy={y(last.price)} r="6" fill="var(--save)" stroke="var(--card)" strokeWidth="3" />
      </svg>
      <div className="legend">
        <span>{fmt(points[0].date)}</span>
        <span>
          High {money(hi)} · Low {money(lo)}
          {isLowest ? " · lowest price right now" : ""}
        </span>
        <span>{fmt(last.date)}</span>
      </div>
    </div>
  );
}
