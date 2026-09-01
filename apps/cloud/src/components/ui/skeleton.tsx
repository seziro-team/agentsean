import { cn } from "@/lib/cn";

/** Loading placeholder. Used in Suspense fallbacks, never as fake data. */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-[var(--color-surface-2)]", className)}
      aria-hidden
    />
  );
}
