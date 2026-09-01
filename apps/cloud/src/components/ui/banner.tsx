import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

type Tone = "info" | "warning" | "danger" | "success";

const tones: Record<Tone, string> = {
  info: "border-[#1d3a5f] bg-[#0e1c2e] text-[var(--color-accent)]",
  warning: "border-[#463815] bg-[#211a09] text-[var(--color-warning)]",
  danger: "border-[#4a1a17] bg-[#210b0a] text-[var(--color-danger)]",
  success: "border-[#1b4029] bg-[#0c1c12] text-[var(--color-success)]",
};

/**
 * The "not configured" / status banner. This is the single mechanism the whole
 * app uses to say an integration is missing credentials — Supabase, billing,
 * email, terminal relay — instead of crashing.
 */
export function Banner({
  tone = "info",
  title,
  children,
  action,
  className,
}: {
  tone?: Tone;
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={cn(
        "flex items-start justify-between gap-4 rounded-lg border px-4 py-3",
        tones[tone],
        className,
      )}
    >
      <div className="min-w-0 text-sm">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? (
          <div className="mt-0.5 text-[var(--color-muted)]">{children}</div>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function NotConfiguredBanner({ what, where }: { what: string; where?: string }) {
  return (
    <Banner tone="warning" title={`${what} is not configured`}>
      {where ??
        "Set the required environment variables (see .env.example) to enable this."}
    </Banner>
  );
}
