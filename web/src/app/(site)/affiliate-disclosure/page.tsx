import type { Metadata } from "next";
import Link from "next/link";
import { LEGAL_UPDATED, site } from "@/lib/site";

export const metadata: Metadata = { title: "Affiliate disclosure", description: "How Vault makes money, and why it doesn't change what we show you." };

export default function DisclosurePage() {
  return (
    <div className="wrap">
      <article className="prose">
        <h1>Affiliate disclosure</h1>
        <p className="updated">Last updated {LEGAL_UPDATED}</p>
        <p className="lead">
          {site.name} may earn a commission when you buy through some of the links on this site. It costs you nothing extra. This page explains how that works and, more importantly, what it
          doesn&apos;t change.
        </p>

        <div className="callout">
          <p>
            <b>In one sentence:</b> we may be paid by stores if you click a link and buy, and that never affects which deals we show or the order we show them in.
          </p>
        </div>

        <h2>How we make money</h2>
        <p>
          Many stores run affiliate programs, often through networks that track which website sent a shopper. When you click &ldquo;Go to&rdquo; a store and then make a purchase, the store may
          pay us a commission. The price you pay is the store&apos;s price; you don&apos;t pay extra for us to earn this.
        </p>
        <p>Not every link is an affiliate link. Where we don&apos;t have an affiliate relationship with a store, we still show its deals and link to it, and we earn nothing.</p>

        <h2>What a commission does not change</h2>
        <ul>
          <li>It does not decide which deals we show. Stores have to pass our checks, and only fresh prices from approved stores appear.</li>
          <li>It does not decide how deals are ranked. We rank by how well a deal fits what you asked for, its price, how recent the price is, and how many stores list it. Our ranking has no access to commission data, and we test that.</li>
          <li>It does not change the price you see, or any discount we show. We only show a discount when the store itself states a regular price.</li>
          <li>It does not influence the deal assistant. The assistant never sees anything about commissions or affiliate programs.</li>
        </ul>

        <h2>Where you&apos;ll see this</h2>
        <p>
          We put a short note next to store links that says we may earn a commission. Some affiliate programs also require specific wording, and where they do, you&apos;ll see it next to that
          store&apos;s links. This page is linked from the footer of every page.
        </p>

        <h2>Prices and availability</h2>
        <p>
          Prices and availability belong to each store and can change at any time. We show when a price was last checked and hide prices that are out of date, but the store&apos;s own page is
          always the final word. {site.name} doesn&apos;t sell products and isn&apos;t responsible for the store&apos;s service.
        </p>

        <h2>Questions</h2>
        <p>
          If something here is unclear, or you think a deal is shown unfairly, please <Link href="/contact">contact us</Link>. You can also read how we choose stores and rank deals on the{" "}
          <Link href="/about">about page</Link>.
        </p>
      </article>
    </div>
  );
}
