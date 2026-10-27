import type { Metadata } from "next";
import Link from "next/link";
import { LEGAL_UPDATED, site } from "@/lib/site";

export const metadata: Metadata = { title: "Privacy policy", description: "What information Vault collects, why, and the choices you have." };

export default function PrivacyPage() {
  return (
    <div className="wrap">
      <article className="prose">
        <h1>Privacy policy</h1>
        <p className="updated">Last updated {LEGAL_UPDATED}</p>
        <p className="lead">
          {site.name} helps you find and compare deals. We try to collect as little about you as we can. This page explains exactly what we do collect, what we do with it, and
          the choices you have.
        </p>

        <h2>The short version</h2>
        <ul>
          <li>You don&apos;t need an account to use {site.name}, and we don&apos;t ask for your name, email or payment details to browse.</li>
          <li>We don&apos;t sell your personal information.</li>
          <li>We don&apos;t run advertising or analytics trackers on this site.</li>
          <li>When you use the deal assistant, what you type is sent to an AI service to write the answer. Please don&apos;t type personal or sensitive details into it.</li>
        </ul>

        <h2>What we collect, and why</h2>
        <p>
          <b>Technical logs from our hosting providers.</b> Our website and servers run on hosting services (currently Vercel and Render). Like most hosting services, they process
          standard technical information about each visit, such as your IP address, browser type and the time of the request, to deliver and protect the service. We don&apos;t use
          these logs to build profiles of individual visitors, and how long the providers keep them is governed by their own policies.
        </p>
        <p>
          <b>Clicks to stores.</b> When you choose &ldquo;Go to&rdquo; a store, we record which deal and store it was, the time, and where on our site you clicked. We use this to see which
          deals are useful, to keep the links working, and to match commission reports from the stores and networks we work with. This record doesn&apos;t include your IP address or
          browser details, and we delete it after 24 months.
        </p>
        <p>
          <b>The deal assistant.</b> When the AI features are switched on, the message you type and the last few messages of the conversation are sent to our AI provider (Anthropic), along
          with facts about deals from our catalog, so it can write an answer. We don&apos;t store the content of your conversations. We keep only counts, timing and cost so we can run the
          service and keep its spending in check. If the AI isn&apos;t available, the assistant uses a plain keyword search on our own servers instead.
        </p>
        <p>
          <b>Saved deals.</b> Deals you save are kept in your own browser on your own device. They are not sent to us. You can remove them any time from the Saved page, or by clearing this
          site&apos;s data in your browser.
        </p>
        <p>
          <b>If you email us.</b> We keep your message and email address so we can reply and to remember what was discussed.
        </p>

        <h2>Cookies</h2>
        <p>
          {site.name} doesn&apos;t use advertising or analytics cookies. When you click through to a store or an affiliate network, that site may set its own cookies and collect its own
          information; their privacy policies apply to what they do.
        </p>

        <h2>Affiliate links</h2>
        <p>
          Some links to stores are affiliate links. If you buy after clicking one, the store or its affiliate network may pay us a commission, at no extra cost to you. They receive
          information that you came from {site.name} and an identifier for the click, which doesn&apos;t include your name. Read more on our{" "}
          <Link href="/affiliate-disclosure">affiliate disclosure</Link> page.
        </p>

        <h2>Who we share information with</h2>
        <ul>
          <li>Hosting and infrastructure providers, who run the service for us.</li>
          <li>Our AI provider, for the assistant, as described above.</li>
          <li>Stores and affiliate networks, when you click through to them, as described above.</li>
          <li>Anyone the law requires us to share it with.</li>
        </ul>
        <p>We don&apos;t sell your personal information, and we don&apos;t share it for advertising based on your activity across other sites.</p>

        <h2>Your choices and rights</h2>
        <p>
          You can ask us what information we hold about you, ask us to correct or delete it, or ask us to stop using it. Because we collect so little and don&apos;t identify visitors, we often
          won&apos;t hold anything that can be tied to you, but we&apos;ll check and tell you. Residents of California and other US states with privacy laws have these rights, and we&apos;ll honor
          them for everyone. To make a request, use the contact details below.
        </p>

        <h2>Security</h2>
        <p>
          We use encrypted connections, keep secrets out of our code, limit who can reach our systems, and only link to stores&apos; own websites over https. No system is perfectly secure, so
          please use care with what you share online.
        </p>

        <h2>Children</h2>
        <p>{site.name} is for adults and isn&apos;t directed at children under 13, and we don&apos;t knowingly collect information from them.</p>

        <h2>Changes to this policy</h2>
        <p>
          If we add features that collect more, such as accounts or price alerts, we&apos;ll update this page before we start collecting, and change the date at the top.
        </p>

        <h2>Contact us</h2>
        <div className="callout">
          {site.email ? (
            <p>
              Email <a href={`mailto:${site.email}`}>{site.email}</a>
              {site.address ? ` or write to ${site.name}, ${site.address}.` : "."}
            </p>
          ) : (
            <p>
              Our contact details are being set up. In the meantime, see the <Link href="/contact">contact page</Link>.
            </p>
          )}
        </div>
      </article>
    </div>
  );
}
