import type { Metadata } from "next";
import Link from "next/link";
import { site } from "@/lib/site";

export const metadata: Metadata = { title: "Contact", description: "How to reach Vault with questions, corrections or partnership requests." };

export default function ContactPage() {
  return (
    <div className="wrap">
      <article className="prose">
        <h1>Contact</h1>
        <p className="lead">We&apos;d like to hear about a wrong price, a deal that looks off, or a store you think we should look at.</p>

        <div className="callout">
          {site.email ? (
            <>
              <p>
                <b>Email:</b> <a href={`mailto:${site.email}`}>{site.email}</a>
              </p>
              {site.address && (
                <p>
                  <b>Mail:</b> {site.name}, {site.address}
                </p>
              )}
            </>
          ) : (
            <p>Our contact email is being set up and will appear here shortly. Thanks for your patience.</p>
          )}
        </div>

        <h2>What to include</h2>
        <ul>
          <li>For a price or deal problem: the name of the deal and the store, and what you saw at the store.</li>
          <li>For a privacy request: what you&apos;d like us to do. See our <Link href="/privacy">privacy policy</Link>.</li>
          <li>For a store or brand: a link to your affiliate or partnership page, and a way to reach you.</li>
        </ul>

        <h2>Stores and brands</h2>
        <p>
          We work with stores through affiliate networks and, where a store offers one, through product feeds. We only list stores that pass our checks and never ask stores to pay to be ranked
          higher. Read how we <Link href="/about">choose stores and rank deals</Link>.
        </p>
      </article>
    </div>
  );
}
