import type { Metadata } from "next";
import { ActionForm, Submit } from "@/components/admin/forms";
import { adminConfigured } from "@/lib/admin";
import { login } from "../actions";

export const metadata: Metadata = { title: "Sign in" };

export default function AdminLogin() {
  const ready = adminConfigured();
  return (
    <div className="login">
      <div className="auth">
        <h1>Vault admin</h1>
        {ready ? (
          <>
            <p className="page-sub">Sign in to manage partners, approve emails and see how the site is doing.</p>
            <ActionForm action={login} className="stack">
              <div className="field">
                <label htmlFor="password">Password</label>
                <input id="password" name="password" type="password" autoComplete="current-password" required autoFocus />
              </div>
              <Submit pendingText="Signing in…">Sign in</Submit>
            </ActionForm>
          </>
        ) : (
          <p className="notice">
            The admin area is switched off. Set ADMIN_PASSWORD and ADMIN_API_KEY in the website&apos;s environment (web/.env.local on this computer,
            or Vercel settings online), then restart.
          </p>
        )}
      </div>
    </div>
  );
}
