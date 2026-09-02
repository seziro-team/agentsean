import { describe, expect, it } from "vitest";
import { applyBillingEvent, BillingWriteError } from "./apply";
import type { NormalizedEvent } from "./provider";

/**
 * What happens to a customer's money when a write fails.
 *
 * supabase-js does not reject on a failed query — it resolves with
 * `{ data, error }`. Every write on this path discarded that, so a rejected
 * update returned normally, applyBillingEvent reported `applied: true`, and the
 * webhook answered 200. The customer paid, their plan was never set, the
 * provider was told everything was fine, and nothing recorded the failure.
 *
 * There were no tests here at all: apps/cloud was not in the vitest include, so
 * the code deciding whether a paying customer gets what they paid for was the
 * least covered code in the repo.
 */

type Result = { data: unknown; error: { message: string; code?: string } | null };

/**
 * The smallest thing that behaves like the query builder used here.
 *
 * supabase-js chains filters and is awaited at the end, so each link has to be
 * both chainable and thenable. Rather than hand-write `then` — which makes any
 * object accidentally awaitable — each link IS a real Promise with the chain
 * methods attached, and the writes are recorded when update/insert is called
 * rather than when the promise settles, so an un-awaited link cannot
 * double-count.
 */
function fakeDb(opts: {
  /** Table names whose writes should fail. */
  failWrites?: string[];
  /** Rows returned by reads, keyed by table. */
  rows?: Record<string, unknown>;
}) {
  const writes: string[] = [];
  const failing = new Set(opts.failWrites ?? []);

  const builder = (table: string, isWrite: boolean) => {
    const result: Result = isWrite
      ? failing.has(table)
        ? { data: null, error: { message: `permission denied for ${table}` } }
        : { data: null, error: null }
      : { data: opts.rows?.[table] ?? null, error: null };

    const link = Object.assign(Promise.resolve(result), {
      select: () => builder(table, isWrite),
      eq: () => builder(table, isWrite),
      ilike: () => builder(table, isWrite),
      order: () => builder(table, isWrite),
      limit: () => builder(table, isWrite),
      update: () => write(table),
      insert: () => write(table),
      upsert: () => write(table),
      maybeSingle: () => Promise.resolve(result),
    });
    return link;
  };

  const write = (table: string) => {
    writes.push(table);
    return builder(table, true);
  };

  return {
    db: { from: (table: string) => builder(table, false) } as never,
    writes,
  };
}

const subscriptionEvent: NormalizedEvent = {
  id: "evt_1",
  type: "subscription.active",
  tenantId: "11111111-1111-4111-8111-111111111111",
  planId: "team",
  customerId: "cus_1",
  subscriptionId: "sub_1",
  status: "active",
  amountCents: 1499,
  currency: "USD",
  inviteId: null,
  customerEmail: "buyer@example.com",
  rawType: "subscription.active",
};

describe("applyBillingEvent", () => {
  it("activates the plan when the writes succeed", async () => {
    const { db, writes } = fakeDb({});
    const out = await applyBillingEvent(db, subscriptionEvent);
    expect(out.applied).toBe(true);
    expect(writes).toContain("tenants");
  });

  it("throws when the tenant update fails, rather than reporting success", async () => {
    // The whole bug in one assertion: this used to resolve `applied: true`.
    const { db } = fakeDb({ failWrites: ["tenants"] });
    await expect(applyBillingEvent(db, subscriptionEvent)).rejects.toThrow(
      BillingWriteError,
    );
  });

  it("throws when the subscription mirror fails", async () => {
    const { db } = fakeDb({ failWrites: ["subscriptions"] });
    await expect(applyBillingEvent(db, subscriptionEvent)).rejects.toThrow(
      /subscriptions/,
    );
  });

  it("names the failed write so an operator can find it", async () => {
    const { db } = fakeDb({ failWrites: ["tenants"] });
    await expect(applyBillingEvent(db, subscriptionEvent)).rejects.toThrow(
      /tenants\.update.*permission denied/,
    );
  });

  it("throws when cancelling fails, so a cancel is never silently dropped", async () => {
    const { db } = fakeDb({ failWrites: ["tenants"] });
    await expect(
      applyBillingEvent(db, {
        ...subscriptionEvent,
        type: "subscription.canceled",
        rawType: "subscription.canceled",
      }),
    ).rejects.toThrow(BillingWriteError);
  });

  it("still ignores events that carry no state change", async () => {
    const { db, writes } = fakeDb({ failWrites: ["tenants", "subscriptions"] });
    const out = await applyBillingEvent(db, {
      ...subscriptionEvent,
      type: "customer.created",
      rawType: "customer.created",
    });
    // No write attempted, so a broken table cannot make an irrelevant event fail.
    expect(out.applied).toBe(false);
    expect(writes).toEqual([]);
  });

  it("does nothing when no tenant resolves", async () => {
    const { db, writes } = fakeDb({});
    const out = await applyBillingEvent(db, {
      ...subscriptionEvent,
      tenantId: null,
      customerId: null,
    });
    expect(out.applied).toBe(false);
    expect(writes).toEqual([]);
  });
});

/**
 * "Nothing to do" and "could not act on a payment" both surfaced as
 * `applied: false`, and the webhook stamped applied_at on both. That buried the
 * worst case — a subscription whose checkout metadata never came back, so the
 * customer paid, stayed on free, and the row looked finished — inside the same
 * shape as a harmless customer.created. Only the second kind is unresolved.
 */
describe("unresolved vs. nothing-to-do", () => {
  it("flags a paid subscription that matches no tenant", async () => {
    const { db } = fakeDb({});
    const out = await applyBillingEvent(db, {
      ...subscriptionEvent,
      tenantId: null,
      customerId: null,
    });
    expect(out.applied).toBe(false);
    expect(out.unresolved, "someone paid and was credited to nobody").toBe(true);
  });

  it("flags an order that matches neither invite nor tenant", async () => {
    const { db } = fakeDb({});
    const out = await applyBillingEvent(db, {
      ...subscriptionEvent,
      type: "order.paid",
      rawType: "order.paid",
      tenantId: null,
      customerId: null,
      inviteId: null,
    });
    expect(out.unresolved).toBe(true);
  });

  it("does NOT flag an event that simply needs no action", async () => {
    const { db } = fakeDb({});
    const out = await applyBillingEvent(db, {
      ...subscriptionEvent,
      type: "customer.created",
      rawType: "customer.created",
    });
    expect(out.applied).toBe(false);
    expect(out.unresolved, "no money involved; nothing was lost").toBeFalsy();
  });
});
