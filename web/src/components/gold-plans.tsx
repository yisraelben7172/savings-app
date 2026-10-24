"use client";

import { Check } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

const PRICES = {
  m: { amt: "$14.99", per: " / month", sub: "Cancel anytime", fine: "Billed monthly. Cancel in two taps from your account." },
  y: { amt: "$119", per: " / year", sub: "$9.92 a month, save $60 compared with monthly", fine: "Billed once a year. Cancel anytime; Gold stays on until your year ends." },
};

const FREE = ["All public deals", "20 AI assistant chats a day", "Daily deal alerts", "Save up to 10 deals"];
const GOLD: [string, string][] = [
  ["Early access:", " new deals 24 hours before free members"],
  ["Gold-only deals", " and deeper discounts"],
  ["Instant price-drop alerts", " on anything you watch"],
  ["Unlimited AI assistant", " with smarter comparisons"],
  ["", "Unlimited saved deals and price watches"],
  ["", "No ads"],
];

export function GoldPlans({ headingLevel = 2 }: { headingLevel?: 1 | 2 }) {
  const [period, setPeriod] = useState<"m" | "y">("m");
  const p = PRICES[period];
  const Heading = headingLevel === 1 ? "h1" : "h2";

  return (
    <section className="gold-sec" id="gold">
      <div className="gold-intro">
        <Heading className={headingLevel === 1 ? "page-title" : undefined}>Get the best deals first with Gold</Heading>
        <p>Gold members see new deals 24 hours before everyone else, unlock Gold-only prices, and get alerts the moment a price drops.</p>
        <div className="bill" role="radiogroup" aria-label="Billing period">
          <button type="button" role="radio" aria-checked={period === "m"} onClick={() => setPeriod("m")}>
            Monthly
          </button>
          <button type="button" role="radio" aria-checked={period === "y"} onClick={() => setPeriod("y")}>
            Yearly <span className="save">Save $60</span>
          </button>
        </div>
      </div>
      <div className="plans">
        <div className="plan free">
          <h3>Free</h3>
          <div className="amt">$0</div>
          <div className="sub">Always free</div>
          <ul>
            {FREE.map((f) => (
              <li key={f}>
                <Check size={18} strokeWidth={2.4} aria-hidden />
                {f}
              </li>
            ))}
          </ul>
          <Link className="btn" href="/signin">
            Create free account
          </Link>
        </div>
        <div className="plan gold">
          <span className="pop">Best value</span>
          <h3>Gold</h3>
          <div className="amt">
            {p.amt}
            <small>{p.per}</small>
          </div>
          <div className="sub">{p.sub}</div>
          <ul>
            {GOLD.map(([b, rest]) => (
              <li key={b + rest}>
                <Check size={18} strokeWidth={2.4} aria-hidden />
                <span>
                  {b && <b>{b}</b>}
                  {rest}
                </span>
              </li>
            ))}
          </ul>
          {/* TODO: Stripe checkout once accounts exist. */}
          <Link className="btn goldbtn" href={`/signin?next=gold&plan=${period === "m" ? "monthly" : "yearly"}`}>
            Start Gold
          </Link>
          <div className="fine">{p.fine}</div>
        </div>
      </div>
    </section>
  );
}
