"use client";
import { useActionState } from "react";
import { addSite, type SiteActionState } from "./actions";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Banner } from "@/components/ui/banner";

const initial: SiteActionState = { status: "idle" };

export function AddSiteForm({ atQuota }: { atQuota: boolean }) {
  const [state, action, pending] = useActionState(addSite, initial);

  return (
    <form action={action} className="space-y-4">
      {state.status === "error" ? (
        <Banner tone="danger" title="Could not add the site">
          {state.message}
        </Banner>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Site URL"
          htmlFor="origin"
          hint="We store the origin (scheme + host)."
        >
          <Input
            id="origin"
            name="origin"
            type="text"
            inputMode="url"
            placeholder="example.com"
            required
            disabled={pending || atQuota}
          />
        </Field>
        <Field label="Name (optional)" htmlFor="name">
          <Input
            id="name"
            name="name"
            type="text"
            placeholder="Marketing site"
            disabled={pending || atQuota}
          />
        </Field>
      </div>
      <Button type="submit" disabled={pending || atQuota}>
        {pending ? "Adding…" : "Add site"}
      </Button>
    </form>
  );
}
