import { NextResponse, type NextRequest } from "next/server";
import { getBillingProvider } from "@/lib/billing";
import { applyBillingEvent } from "@/lib/billing/apply";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Billing webhook endpoint. Works for whichever provider BILLING_PROVIDER
 * selects (Polar primary, Paddle fallback).
 *
 * Order of operations is a security requirement:
 *   1. Read the RAW body with req.text() — signature is computed over exact
 *      bytes, so we must not let a framework re-serialize the JSON first.
 *   2. Verify the signature BEFORE parsing. An unverified body is never trusted.
 *   3. Record the event in billing_events keyed on (provider, event id) for
 *      idempotency — providers retry, so a duplicate must be a no-op.
 *   4. Only then apply the state change.
 *
 * Node runtime (not edge) because signature verification uses node:crypto.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest): Promise<NextResponse> {
  // 1. Raw body — exact bytes.
  const rawBody = await req.text();

  const provider = await getBillingProvider();
  if (!provider.isConfigured()) {
    // Nothing to verify against. Accept-and-ignore so provider dashboards don't
    // show repeated failures while the operator is still connecting billing.
    return NextResponse.json(
      { ok: false, reason: "billing not configured" },
      { status: 202 },
    );
  }

  // 2. Verify before parsing.
  const result = provider.verifyWebhook(rawBody, req.headers);
  if (!result.ok) {
    return NextResponse.json({ ok: false, reason: result.reason }, { status: 400 });
  }
  const event = result.event;

  const db = createAdminClient();
  if (!db) {
    // Verified but we cannot persist without the service role. Ask the provider
    // to retry later rather than dropping the event silently.
    return NextResponse.json(
      { ok: false, reason: "service role not configured" },
      { status: 503 },
    );
  }

  // 3. Idempotency: insert the ledger row first, with applied_at null. A unique
  // (provider, event id) constraint means a duplicate insert fails.
  //
  // A duplicate is NOT automatically "already handled". Recording and applying
  // are two steps, so a row can exist for an event whose apply failed. Treating
  // every duplicate as done is what made a failed apply unrecoverable: the
  // route answered 200 so the provider stopped retrying, and any retry that did
  // arrive was waved through here without applying anything. Only a row with
  // applied_at set is finished.
  const { error: insertError } = await db.from("billing_events").insert({
    provider: provider.name,
    provider_event_id: event.id,
    type: event.rawType,
    tenant_id: event.tenantId,
    payload: safeJson(rawBody),
  });
  if (insertError) {
    // 23505 = unique_violation → seen before. Finished, or unfinished?
    if (insertError.code === "23505") {
      const { data: prior } = await db
        .from("billing_events")
        .select("applied_at")
        .eq("provider", provider.name)
        .eq("provider_event_id", event.id)
        .maybeSingle();
      if (prior?.applied_at) {
        return NextResponse.json({ ok: true, duplicate: true });
      }
      // Recorded but never applied — fall through and finish the job.
      console.warn("[webhook] retrying an event that was recorded but not applied");
    } else {
      console.error("[webhook] failed to record event", insertError.message);
      return NextResponse.json(
        { ok: false, reason: "ledger write failed" },
        { status: 500 },
      );
    }
  }

  // 4. Apply, then mark applied. A failure here must be retryable: the customer
  // has paid and their plan is not set yet, so the worst possible answer is a
  // 200 that stops the provider from trying again.
  try {
    const applied = await applyBillingEvent(db, event);

    // `unresolved` means the event carried money we could not attach to a
    // tenant — most likely a subscription whose checkout metadata did not come
    // back, so someone has paid and is still on free. Retrying the identical
    // payload cannot fix that, so answer 200 rather than loop the provider; but
    // leave applied_at null so the row shows up in the unapplied query instead
    // of looking finished. This is the one case a human has to look at.
    if (applied.unresolved) {
      console.error(
        `[webhook] UNRESOLVED ${event.rawType} (${event.id}): ${applied.note} — payment not credited to any tenant`,
      );
      return NextResponse.json({ ok: true, ...applied });
    }

    const { error: markError } = await db
      .from("billing_events")
      .update({ applied_at: new Date().toISOString() })
      .eq("provider", provider.name)
      .eq("provider_event_id", event.id);
    if (markError) {
      // Applying succeeded; only the bookkeeping failed. Say so rather than ask
      // for a retry that would redo work that is already done.
      console.error("[webhook] applied but could not mark applied", markError.message);
    }
    return NextResponse.json({ ok: true, ...applied });
  } catch (err) {
    console.error("[webhook] apply failed", err);
    return NextResponse.json(
      { ok: false, reason: "apply failed", retryable: true },
      { status: 500 },
    );
  }
}

function safeJson(raw: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === "object"
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}
