import type { ReactNode, ThHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

/**
 * Keyboard-navigable, semantic table primitives. Wrap in <TableWrap> so wide
 * tables scroll inside their own container rather than the page body.
 */
export function TableWrap({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-[var(--color-line)]">
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  );
}

export function THead({ children }: { children: ReactNode }) {
  return (
    <thead className="bg-[var(--color-surface-2)] text-left text-xs uppercase tracking-wide text-[var(--color-faint)]">
      {children}
    </thead>
  );
}

export function TH({
  children,
  className,
  ...rest
}: ThHTMLAttributes<HTMLTableCellElement> & { children?: ReactNode }) {
  return (
    <th
      scope="col"
      className={cn("whitespace-nowrap px-4 py-2.5 font-medium", className)}
      {...rest}
    >
      {children}
    </th>
  );
}

export function TBody({ children }: { children: ReactNode }) {
  return <tbody>{children}</tbody>;
}

export function TR({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <tr
      className={cn(
        "border-t border-[var(--color-line)] hover:bg-[var(--color-surface-2)]/60",
        className,
      )}
    >
      {children}
    </tr>
  );
}

export function TD({
  children,
  className,
  mono,
}: {
  children: ReactNode;
  className?: string;
  mono?: boolean;
}) {
  return (
    <td
      className={cn(
        "px-4 py-2.5 align-middle text-[var(--color-fg)]",
        mono && "font-mono text-xs text-[var(--color-muted)]",
        className,
      )}
    >
      {children}
    </td>
  );
}
