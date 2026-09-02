import { openSqlite } from "@agentsean/db";
import { isPlanId, signupTenant, type PlanId } from "@agentsean/hosted";
import { dbPath, defaultSeanHome, ensureSeanHome } from "@agentsean/daemon";
import { emit, emitError } from "../output.js";

export async function signupCommand(opts: {
  json: boolean;
  home?: string | undefined;
  target?: string | undefined;
}): Promise<number> {
  const planRaw = (opts.target ?? "cloud_starter").toLowerCase();
  if (!isPlanId(planRaw) || planRaw === "self_host") {
    if (planRaw === "self_host") {
      emit(
        opts.json,
        { command: "signup", plan: "self_host", priceUsd: 0 },
        "Self-host is $0. Run `sean start`. Unlimited sites, BYOK, white-label included.",
      );
      return 0;
    }
    emitError(
      opts.json,
      { command: "signup", error: "unknown_plan" },
      "Plan must be cloud_starter, team, or enterprise.",
    );
    return 2;
  }
  const plan = planRaw as PlanId;
  const home = ensureSeanHome(opts.home ?? defaultSeanHome());
  const { db, sqlite } = openSqlite(dbPath(home));
  try {
    const result = await signupTenant(db, {
      name: "Sean tenant",
      email: process.env["SEAN_SIGNUP_EMAIL"] ?? "owner@localhost",
      plan,
    });
    emit(
      opts.json,
      { command: "signup", ok: true, ...result },
      `Checkout: ${result.checkoutUrl}\nTenant ${result.tenantId}. BYOK is required. Complete the Stripe webhook, then sean tenant ${result.tenantId}.`,
    );
    return 0;
  } finally {
    sqlite.close();
  }
}
