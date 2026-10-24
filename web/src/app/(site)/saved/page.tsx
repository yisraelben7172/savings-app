import type { Metadata } from "next";
import Link from "next/link";
import { SavedDeals } from "@/components/saved-deals";

export const metadata: Metadata = { title: "Saved deals and alerts" };

export default function SavedPage() {
  return (
    <div className="wrap">
      <h1 className="page-title">Saved deals</h1>
      <p className="page-sub">Deals you save are kept on this device. Once accounts arrive they&apos;ll follow you to the app too.</p>
      <div style={{ marginTop: 28 }}>
        <SavedDeals />
      </div>

      <div className="row-head">
        <h2>Price alerts</h2>
      </div>
      <div className="empty">
        <h3>Price alerts are on the way</h3>
        <p>Soon you&apos;ll be able to watch any product and hear the moment its price drops. Gold members get instant alerts.</p>
        <Link className="btn goldbtn" href="/gold">
          See Gold
        </Link>
      </div>
    </div>
  );
}
