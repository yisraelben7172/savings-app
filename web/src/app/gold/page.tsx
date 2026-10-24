import type { Metadata } from "next";
import { GoldPlans } from "@/components/gold-plans";

export const metadata: Metadata = { title: "Gold membership" };

const ROWS: [string, string, string][] = [
  ["Public deals from verified stores", "Yes", "Yes"],
  ["See new deals", "When they go public", "24 hours early"],
  ["Gold-only deals", "No", "Yes"],
  ["Price-drop alerts", "Daily summary", "Instant"],
  ["AI deal assistant", "20 chats a day", "Unlimited"],
  ["Saved deals and price watches", "Up to 10", "Unlimited"],
  ["Ads", "Some", "None"],
];

export default function GoldPage() {
  return (
    <div className="wrap">
      <GoldPlans headingLevel={1} />
      <div className="panel" style={{ maxWidth: 860, margin: "48px auto 0" }}>
        <h2>Free vs Gold</h2>
        <div className="table-wrap" style={{ padding: "0 10px 10px" }}>
          <table className="compare">
            <thead>
              <tr>
                <th scope="col">
                  <span className="sr">Feature</span>
                </th>
                <th scope="col">Free</th>
                <th scope="col" style={{ color: "var(--gold-d)" }}>
                  Gold
                </th>
              </tr>
            </thead>
            <tbody>
              {ROWS.map(([f, free, gold]) => (
                <tr key={f}>
                  <th scope="row" style={{ fontWeight: 500 }}>
                    {f}
                  </th>
                  <td style={{ color: "var(--muted)" }}>{free}</td>
                  <td style={{ fontWeight: 600 }}>{gold}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <p className="disclosure" style={{ textAlign: "center" }}>
        $14.99 a month or $119 a year. On the website you pay by card; in the app you pay through the App Store or Google Play.
      </p>
    </div>
  );
}
