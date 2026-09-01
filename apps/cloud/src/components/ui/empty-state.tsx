import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * The canonical empty state. Used everywhere a real daemon feed does not exist
 * yet — we render this with instructions instead of fabricating metrics. The
 * `command` prop shows the exact CLI a user runs to populate the surface.
 */
export function EmptyState({
  title,
  description,
  command,
  action,
  className,
}: {
  title: string;
  description?: ReactNode;
  command?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-lg border border-dashed " +
          "border-[var(--color-line-strong)] bg-[var(--color-surface)] px-6 py-12 text-center",
        className,
      )}
    >
      <p className="text-sm font-medium text-[var(--color-fg)]">{title}</p>
      {description ? (
        <p className="mt-2 max-w-md text-sm text-[var(--color-muted)]">{description}</p>
      ) : null}
      {command ? (
        <code className="mt-4 rounded-md border border-[var(--color-line-strong)] bg-[var(--color-bg)] px-3 py-2 font-mono text-xs text-[var(--color-accent)]">
          {command}
        </code>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
