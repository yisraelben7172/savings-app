import type { Metadata } from "next";
import { TripForm } from "@/components/trip-planner";

export const metadata: Metadata = { title: "Plan a trip", description: "Hotel, flight and car from verified stores, with every total checked against your budget. You approve the plan, then book on the partner's site." };

export default function TripPage() {
  return (
    <div className="wrap">
      <header className="sp-head">
        <h1>Plan a trip</h1>
        <p>Tell us where and when. We put together a hotel, and a flight and car if you want them, from verified stores, total it against your budget, and you approve it. Then you finish each booking on the partner&apos;s site.</p>
      </header>
      <TripForm />
    </div>
  );
}
