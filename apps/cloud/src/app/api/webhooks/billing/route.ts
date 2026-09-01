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

  // 3. Idempotency: insert the ledger row first. A unique (provider, event id)
  // constraint means a duplicate insert fails, and we return 200 without
  // re-applying.
  const { error: insertError } = await db.from("billing_events").insert({
    provider: provider.name,
    provider_event_id: event.id,
    type: event.rawType,
    tenant_id: event.tenantId,
    payload: safeJson(rawBody),
  });
  if (insertError) {
    // 23505 = unique_violation → already processed.
    if (insertError.code === "23505") {
      return NextResponse.json({ ok: true, duplicate: true });
    }
    console.error("[webhook] failed to record event", insertError.message);
    return NextResponse.json(
      { ok: false, reason: "ledger write failed" },
      { status: 500 },
    );
  }

  // 4. Apply.
  try {
    const applied = await applyBillingEvent(db, event);
    return NextResponse.json({ ok: true, ...applied });
  } catch (err) {
    console.error("[webhook] apply failed", err);
    // The ledger row is written; return 200 so the provider does not retry a
    // duplicate we would reject anyway. The failure is logged for follow-up.
    return NextResponse.json({ ok: true, applied: false, note: "apply error" });
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
