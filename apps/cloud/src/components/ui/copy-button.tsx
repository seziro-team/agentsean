"use client";
import { useState } from "react";
import { Button } from "./button";

/** Copy-to-clipboard button with transient "Copied" feedback. */
export function CopyButton({
  value,
  label = "Copy",
  size = "sm",
}: {
  value: string;
  label?: string;
  size?: "sm" | "md";
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API blocked (e.g. insecure context) — select fallback.
      setCopied(false);
    }
  }

  return (
    <Button
      variant="secondary"
      size={size}
      onClick={copy}
      aria-label={copied ? "Copied to clipboard" : label}
    >
      {copied ? "Copied" : label}
    </Button>
  );
}

/** A read-only value + copy button pair for tokens, URLs, webhook secrets. */
export function CopyField({ value, label }: { value: string; label?: string }) {
  return (
    <div className="flex items-stretch gap-2">
      <code className="min-w-0 flex-1 overflow-x-auto rounded-md border border-[var(--color-line-strong)] bg-[var(--color-bg)] px-3 py-2 font-mono text-xs text-[var(--color-fg)]">
        {value}
      </code>
      <CopyButton value={value} {...(label ? { label } : {})} />
    </div>
  );
}
