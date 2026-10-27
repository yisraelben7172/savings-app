import type { Metadata } from "next";
import Link from "next/link";
import { site } from "@/lib/site";

export const metadata: Metadata = { title: "About", description: "What Vault is, how it chooses stores and ranks deals, and how it makes money." };

export default function AboutPage() {
  return (
    <div className="wrap">
      <article className="prose">
        <h1>About {site.name}</h1>
        <p className="lead">
          {site.name} watches prices at stores we&apos;ve checked and shows you when something is genuinely worth buying, and where it costs least. We think shopping carefully should feel
          like being smart with your money, not like being chased by countdown timers.
        </p>

        <h2>What we do</h2>
        <ul>
          <li>Collect publicly advertised deals from stores that pass our checks, and show every store&apos;s price for the same product side by side.</li>
          <li>Keep price history so you can see whether a price is actually good.</li>
          <li>Let you ask the deal assistant in plain words, for example &ldquo;running shoes under $80&rdquo;, and compare products side by side.</li>
        </ul>

        <h2>How we choose stores</h2>
        <p>
          A store appears on {site.name} only if we&apos;ve approved it and it meets our trust standard. Every link goes to the store&apos;s own website, never to a lookalike address. If a store
          stops meeting our standard, its deals disappear from the site straight away.
        </p>

        <h2>How we rank deals</h2>
        <p>
          We rank by fit to what you asked for, price, how recently the price was checked, and how many stores list the product. Hard limits, like your budget or a brand you chose, are
          never broken. If we can&apos;t confirm something, such as a feature or a regular price, we say so instead of guessing. We never make up a discount: we show one only when the store
          states a regular price.
        </p>

        <h2>How we make money</h2>
        <p>
          We may earn a commission when you buy through some links. It doesn&apos;t cost you extra, and it doesn&apos;t change what we show or how we rank it. Read the full{" "}
          <Link href="/affiliate-disclosure">affiliate disclosure</Link>.
        </p>

        <h2>The deal assistant</h2>
        <p>
          The assistant is an AI. It can only talk about deals in our catalog, it can&apos;t invent prices or stores, and we check what it says against our data before you see it. It can still
          misunderstand a question, so check the details at the store before you buy.
        </p>

        <h2>Where we are</h2>
        <p>
          {site.name} is new. Until we&apos;ve connected real store feeds, deals shown here are labeled as samples. We&apos;d rather tell you that than pretend.
        </p>

        <h2>Get in touch</h2>
        <p>
          Questions, corrections, or a store you&apos;d like us to look at? Visit the <Link href="/contact">contact page</Link>.
        </p>
      </article>
    </div>
  );
}
