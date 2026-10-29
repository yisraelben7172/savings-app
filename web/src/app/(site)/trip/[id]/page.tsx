import type { Metadata } from "next";
import { Suspense } from "react";
import { TripView } from "@/components/trip-planner";

type Props = PageProps<"/trip/[id]">;

// A trip plan is private to whoever has its link: never indexed.
export const metadata: Metadata = { title: "Your trip plan", robots: { index: false, follow: false } };

async function TripBody({ params }: Props) {
  const { id } = await params;
  return <TripView id={id} />;
}

export default function TripPlanPage(props: Props) {
  return (
    <div className="wrap">
      <header className="sp-head">
        <h1>Your trip plan</h1>
      </header>
      <Suspense fallback={<div className="sp-status" aria-busy="true"><p>Loading your trip plan…</p></div>}>
        <TripBody {...props} />
      </Suspense>
    </div>
  );
}
