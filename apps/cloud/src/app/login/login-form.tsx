"use client";
import { useActionState } from "react";
import {
  sendMagicLink,
  signInWithGitHub,
  type AuthActionState,
} from "@/app/auth/actions";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Banner } from "@/components/ui/banner";

const initial: AuthActionState = { status: "idle" };

export function LoginForm({
  next,
  githubConfigured,
}: {
  next: string;
  githubConfigured: boolean;
}) {
  const [state, formAction, pending] = useActionState(sendMagicLink, initial);

  return (
    <div className="space-y-5">
      {state.status === "sent" ? (
        <Banner tone="success" title="Magic link sent">
          {state.message}
        </Banner>
      ) : null}
      {state.status === "error" ? (
        <Banner tone="danger" title="Could not sign you in">
          {state.message}
        </Banner>
      ) : null}

      <form action={formAction} className="space-y-4">
        <input type="hidden" name="next" value={next} />
        <Field label="Email" htmlFor="email">
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            placeholder="you@company.com"
            disabled={pending}
          />
        </Field>
        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? "Sending…" : "Send magic link"}
        </Button>
      </form>

      <div className="flex items-center gap-3 text-xs text-[var(--color-faint)]">
        <div className="h-px flex-1 bg-[var(--color-line)]" />
        or
        <div className="h-px flex-1 bg-[var(--color-line)]" />
      </div>

      <form action={signInWithGitHub}>
        <input type="hidden" name="next" value={next} />
        <Button
          type="submit"
          variant="secondary"
          className="w-full"
          disabled={!githubConfigured}
          title={
            githubConfigured
              ? undefined
              : "Enable the GitHub provider in your Supabase project to use this."
          }
        >
          <span aria-hidden className="font-mono">
            {"■"}
          </span>
          Continue with GitHub
        </Button>
      </form>
      {!githubConfigured ? (
        <p className="text-center text-xs text-[var(--color-faint)]">
          GitHub sign-in requires the GitHub provider enabled in Supabase Auth.
        </p>
      ) : null}
    </div>
  );
}
