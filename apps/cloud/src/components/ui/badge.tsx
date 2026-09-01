import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export type BadgeTone =
  "neutral" | "accent" | "success" | "warning" | "danger" | "purple";

const tones: Record<BadgeTone, string> = {
  neutral:
    "bg-[var(--color-surface-2)] text-[var(--color-muted)] border-[var(--color-line-strong)]",
  accent: "bg-[#12233b] text-[var(--color-accent)] border-[#1d3a5f]",
  success: "bg-[#0f2417] text-[var(--color-success)] border-[#1b4029]",
  warning: "bg-[#2a220c] text-[var(--color-warning)] border-[#463815]",
  danger: "bg-[#2a0f0d] text-[var(--color-danger)] border-[#4a1a17]",
  purple: "bg-[#20163a] text-[var(--color-purple)] border-[#362459]",
};

export function Badge({
  tone = "neutral",
  children,
  className,
}: {
  tone?: BadgeTone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Map a subscription/tenant status string to a sensible badge tone. */
export function statusTone(status: string): BadgeTone {
  switch (status) {
    case "active":
    case "paid":
    case "redeemed":
    case "attached":
      return "success";
    case "trialing":
    case "pending":
    case "waiting":
    case "incomplete":
      return "warning";
    case "past_due":
      return "warning";
    case "canceled":
    case "expired":
    case "closed":
      return "danger";
    case "comp":
      return "purple";
    default:
      return "neutral";
  }
}
