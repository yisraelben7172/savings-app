import type { Metadata } from "next";
import Link from "next/link";
import { Mail } from "lucide-react";

export const metadata: Metadata = { title: "Sign in" };

// TODO: wire Google, Apple and email sign-in once the auth backend exists.
export default function SignInPage() {
  return (
    <div className="wrap">
      <div className="auth">
        <h1>Sign in to Vault</h1>
        <p className="page-sub">Save deals, get price-drop alerts and keep your Gold membership on every device.</p>
        <div className="notice" role="status">
          Accounts are coming soon. You can browse and save deals on this device without signing in.
        </div>
        <div className="stack">
          <button className="btn" type="button" disabled>
            Continue with Google
          </button>
          <button className="btn" type="button" disabled>
            Continue with Apple
          </button>
        </div>
        <div className="or">or</div>
        <form className="stack" style={{ marginTop: 0 }}>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input id="email" type="email" autoComplete="email" disabled />
          </div>
          <button className="btn primary" type="submit" disabled>
            <Mail size={18} aria-hidden />
            Email me a sign-in link
          </button>
        </form>
        <p className="fine-print">
          No account needed to browse. <Link href="/deals" style={{ color: "var(--link)", fontWeight: 600 }}>See today&apos;s deals</Link>
        </p>
      </div>
    </div>
  );
}
