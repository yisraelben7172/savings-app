import type { Metadata } from "next";
import { PlanBuilder } from "@/components/plan-builder";

export const metadata: Metadata = { title: "Shopping plan", description: "List what you need, set a budget, and compare the best verified prices for all of it." };

export default function PlanPage() {
  return (
    <div className="wrap">
      <header className="sp-head">
        <h1>Shopping plan</h1>
        <p>List everything you need and set a budget. We find the best-fitting deal for each item from verified stores, keep the total under your budget where we can, and you approve the final list.</p>
      </header>
      <PlanBuilder />
    </div>
  );
}
