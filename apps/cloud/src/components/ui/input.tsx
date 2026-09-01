import type {
  InputHTMLAttributes,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
  ReactNode,
} from "react";
import { cn } from "@/lib/cn";

const fieldBase =
  "w-full rounded-md border border-[var(--color-line-strong)] bg-[var(--color-bg)] " +
  "px-3 py-2 text-sm text-[var(--color-fg)] placeholder:text-[var(--color-faint)] " +
  "focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-[var(--color-accent)] " +
  "disabled:opacity-50";

/** Accessible labelled field wrapper. */
export function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label
        htmlFor={htmlFor}
        className="block text-xs font-medium text-[var(--color-muted)]"
      >
        {label}
      </label>
      {children}
      {hint ? <p className="text-xs text-[var(--color-faint)]">{hint}</p> : null}
    </div>
  );
}

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(fieldBase, className)} {...rest} />;
}

export function Textarea({
  className,
  ...rest
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea className={cn(fieldBase, "min-h-20 resize-y", className)} {...rest} />
  );
}

export function Select({
  className,
  children,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement> & { children: ReactNode }) {
  return (
    <select className={cn(fieldBase, "cursor-pointer", className)} {...rest}>
      {children}
    </select>
  );
}
