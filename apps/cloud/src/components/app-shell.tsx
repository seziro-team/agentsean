import Link from "next/link";
import type { ReactNode } from "react";
import { SignOutButton } from "./sign-out-button";
import { NavLink } from "./nav-link";
import { Badge } from "./ui/badge";

export type NavItem = { href: string; label: string; icon: string };

export const DASHBOARD_NAV: NavItem[] = [
  { href: "/dashboard", label: "Overview", icon: "◎" },
  { href: "/dashboard/sites", label: "Sites", icon: "◍" },
  { href: "/dashboard/activity", label: "Activity", icon: "≡" },
  { href: "/dashboard/terminal", label: "Terminal", icon: "▓" },
  { href: "/dashboard/billing", label: "Billing", icon: "▤" },
  { href: "/dashboard/settings", label: "Settings", icon: "⚙" },
];

export const ADMIN_NAV: NavItem[] = [
  { href: "/admin", label: "Overview", icon: "◎" },
  { href: "/admin/users", label: "Users", icon: "☰" },
  { href: "/admin/subscriptions", label: "Subscriptions", icon: "↻" },
  { href: "/admin/billing", label: "Billing", icon: "▤" },
  { href: "/admin/invites", label: "Invites", icon: "✉" },
  { href: "/admin/audit", label: "Audit log", icon: "⎙" },
];

/**
 * The dark, dense two-column shell shared by the dashboard and admin consoles.
 * Server component; the interactive bits (active link, sign-out) are their own
 * client components.
 */
export function AppShell({
  nav,
  section,
  email,
  isSuperadmin,
  children,
}: {
  nav: NavItem[];
  section: "dashboard" | "admin";
  email: string | null;
  isSuperadmin: boolean;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-[var(--color-line)] bg-[var(--color-surface)] md:flex">
        <div className="flex items-center gap-2 px-5 py-4">
          <span className="font-mono text-lg font-bold text-[var(--color-accent)]">
            $_
          </span>
          <div className="leading-tight">
            <p className="text-sm font-semibold">Agent Sean</p>
            <p className="text-[11px] text-[var(--color-faint)]">
              {section === "admin" ? "Admin console" : "Control plane"}
            </p>
          </div>
        </div>

        <nav className="flex flex-1 flex-col gap-0.5 px-2 py-2">
          {nav.map((item) => (
            <NavLink key={item.href} href={item.href} icon={item.icon}>
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-[var(--color-line)] px-2 py-2">
          {section === "dashboard" && isSuperadmin ? (
            <NavLink href="/admin" icon="⚑">
              Admin console
            </NavLink>
          ) : null}
          {section === "admin" ? (
            <NavLink href="/dashboard" icon="←">
              Back to dashboard
            </NavLink>
          ) : null}
        </div>

        <div className="border-t border-[var(--color-line)] px-4 py-3">
          <p className="truncate text-xs text-[var(--color-muted)]" title={email ?? ""}>
            {email ?? "Not signed in"}
          </p>
          <div className="mt-2">
            <SignOutButton />
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar */}
        <header className="flex items-center justify-between border-b border-[var(--color-line)] bg-[var(--color-surface)] px-4 py-3 md:hidden">
          <Link
            href="/dashboard"
            className="font-mono font-bold text-[var(--color-accent)]"
          >
            $_ Agent Sean
          </Link>
          {isSuperadmin ? <Badge tone="purple">admin</Badge> : null}
        </header>
        <main className="min-w-0 flex-1 px-4 py-6 md:px-8 md:py-8">{children}</main>
      </div>
    </div>
  );
}

/** Page header used inside the main column. */
export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-xl font-semibold text-[var(--color-fg)]">{title}</h1>
        {description ? (
          <p className="mt-1 text-sm text-[var(--color-muted)]">{description}</p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
