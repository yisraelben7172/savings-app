import { getMeta } from "@/lib/api";

/** Shown while the catalog is sample data, so no one mistakes example prices for live store prices. */
export async function DemoNotice() {
  const meta = await getMeta().catch(() => null);
  if (!meta?.demoData) return null;
  return (
    <div className="demo-bar" role="note">
      Preview: the deals, prices and price history shown here are samples. Live store prices are coming soon.
    </div>
  );
}
