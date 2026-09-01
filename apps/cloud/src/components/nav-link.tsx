"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Sidebar link that highlights when active. Exact match for index routes,
 * prefix match for nested ones, so /dashboard/sites/abc still lights "Sites".
 */
export function NavLink({
  href,
  icon,
  children,
}: {
  href: string;
  icon: string;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const isIndex = href === "/dashboard" || href === "/admin";
  const active = isIndex ? pathname === href : pathname.startsWith(href);

  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
        active
          ? "bg-[var(--color-surface-2)] font-medium text-[var(--color-fg)]"
          : "text-[var(--color-muted)] hover:bg-[var(--color-surface-2)]/60 hover:text-[var(--color-fg)]",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "w-4 text-center font-mono text-xs",
          active ? "text-[var(--color-accent)]" : "text-[var(--color-faint)]",
        )}
      >
        {icon}
      </span>
      {children}
    </Link>
  );
}
