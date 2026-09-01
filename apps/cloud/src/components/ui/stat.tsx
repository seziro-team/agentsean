import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Card } from "./card";

/** A single KPI tile. Renders a big number honestly (zeros are fine). */
export function Stat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  // Accepts `undefined` explicitly so callers can pass a computed tone that may
  // be absent (exactOptionalPropertyTypes).
  tone?: "accent" | "success" | "danger" | "warning" | undefined;
}) {
  const valueColor =
    tone === "success"
      ? "text-[var(--color-success)]"
      : tone === "danger"
        ? "text-[var(--color-danger)]"
        : tone === "warning"
          ? "text-[var(--color-warning)]"
          : tone === "accent"
            ? "text-[var(--color-accent)]"
            : "text-[var(--color-fg)]";
  return (
    <Card className="px-5 py-4">
      <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-faint)]">
        {label}
      </p>
      <p className={cn("mt-2 font-mono text-2xl font-semibold", valueColor)}>{value}</p>
      {sub ? <p className="mt-1 text-xs text-[var(--color-muted)]">{sub}</p> : null}
    </Card>
  );
}
