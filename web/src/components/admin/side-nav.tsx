"use client";

import { FileText, Inbox, LayoutDashboard, Send, Settings, Users } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard },
  { href: "/admin/queue", label: "Approval queue", icon: Send },
  { href: "/admin/partners", label: "Partners", icon: Users },
  { href: "/admin/inbox", label: "Inbox", icon: Inbox },
  { href: "/admin/templates", label: "Templates", icon: FileText },
  { href: "/admin/settings", label: "Settings", icon: Settings },
];

export function SideNav() {
  const path = usePathname();
  return (
    <nav className="ad-nav" aria-label="Admin">
      {LINKS.map(({ href, label, icon: Icon }) => {
        const on = href === "/admin" ? path === href : path.startsWith(href);
        return (
          <Link key={href} href={href} aria-current={on ? "page" : undefined}>
            <Icon size={18} aria-hidden />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
