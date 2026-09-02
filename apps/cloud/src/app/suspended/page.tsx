import { SignOutButton } from "@/components/sign-out-button";

export const dynamic = "force-dynamic";
export const metadata = { title: "Account suspended — Agent Sean" };

/**
 * Where a suspended account lands.
 *
 * Deliberately says little: the reason for a suspension is between the operator
 * and the account holder, and enumerating causes here would help someone
 * probing for why they were caught.
 */
export default function SuspendedPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <div className="rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] p-8">
        <h1 className="text-lg font-semibold text-[var(--color-fg)]">
          This account is suspended
        </h1>
        <p className="mt-3 text-sm text-[var(--color-muted)]">
          Access to the dashboard is paused. Your data has not been deleted, and any
          daemon you are self-hosting keeps running — it is independent of this account.
        </p>
        <p className="mt-3 text-sm text-[var(--color-muted)]">
          If you think this is a mistake, reply to your most recent billing email or
          contact <span className="font-mono">support@agentsean.dev</span>.
        </p>
        <div className="mt-6">
          <SignOutButton />
        </div>
      </div>
    </main>
  );
}
