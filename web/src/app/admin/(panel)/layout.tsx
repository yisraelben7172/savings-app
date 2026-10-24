import { ExternalLink, LogOut } from "lucide-react";
import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { SideNav } from "@/components/admin/side-nav";
import { requireAdmin } from "@/lib/admin";
import { logout } from "../actions";

// Every admin view checks the sign-in cookie per request, so navigations here aren't expected to be instant.
export const instant = false;

async function Gate({ children }: { children: ReactNode }) {
  await requireAdmin();
  return children;
}

export default function PanelLayout({ children }: { children: ReactNode }) {
  return (
    <div className="ad">
      <aside className="ad-side">
        <Link className="logo" href="/admin">
          <i aria-hidden />
          Vault <small>admin</small>
        </Link>
        <Suspense fallback={null}>
          <SideNav />
        </Suspense>
        <div className="bottom">
          <Link href="/" target="_blank">
            <ExternalLink size={16} aria-hidden />
            View site
          </Link>
          <form action={logout}>
            <button type="submit">
              <LogOut size={16} aria-hidden />
              Sign out
            </button>
          </form>
        </div>
      </aside>
      <main className="ad-main">
        <div className="inner">
          <Suspense fallback={<div className="skel" style={{ height: 320, borderRadius: 16 }} />}>
            <Gate>{children}</Gate>
          </Suspense>
        </div>
      </main>
    </div>
  );
}
