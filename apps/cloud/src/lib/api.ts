import "server-only";
import { createClient } from "./supabase/server";
import { createAdminClient } from "./supabase/admin";
import { getSessionContext } from "./auth";
import { supabaseEnv } from "./env";
import { planOf, type PlanId } from "./plans";
import type {
  AuditLog,
  DaemonPairing,
  PaymentInvite,
  Profile,
  Site,
  Subscription,
  Tenant,
  TerminalSession,
} from "./db/types";

/**
 * The one data-access surface for the dashboard. All reads go through here so
 * that the "not configured" and "no daemon connected yet" empty states are
 * consistent and NO fake metrics are ever fabricated. When Supabase is not
 * configured, or a tenant has no data, these return empty/zeroed results and
 * the UI renders an explicit empty state with connect instructions.
 */

export type CurrentContext = {
  supabaseConfigured: boolean;
  profile: Profile | null;
  tenant: Tenant | null;
  isSuperadmin: boolean;
};

/** Resolve the caller's profile + their primary tenant (owned), creating a
 * default tenant row on first access so the dashboard has something to hang
 * sites off. Returns nulls (never throws) when unconfigured. */
export async function getCurrentContext(): Promise<CurrentContext> {
  const env = supabaseEnv();
  if (!env.isConfigured) {
    return {
      supabaseConfigured: false,
      profile: null,
      tenant: null,
      isSuperadmin: false,
    };
  }
  const ctx = await getSessionContext();
  if (!ctx) {
    return {
      supabaseConfigured: true,
      profile: null,
      tenant: null,
      isSuperadmin: false,
    };
  }
  const tenant = await getOrCreatePrimaryTenant(ctx.user.id, ctx.profile);
  return {
    supabaseConfigured: true,
    profile: ctx.profile,
    tenant,
    isSuperadmin: ctx.isSuperadmin,
  };
}

async function getOrCreatePrimaryTenant(
  userId: string,
  profile: Profile,
): Promise<Tenant | null> {
  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("tenants")
    .select("*")
    .eq("owner_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (existing) return existing as Tenant;

  // Not an owner — but they may have been invited into someone else's tenant.
  // Without this branch an invited member falls through to the create path
  // below and silently gets a brand-new empty workspace, so they can never see
  // the sites, activity, or terminal sessions they were invited to. RLS would
  // have permitted it (is_tenant_member covers membership); the app just never
  // looked.
  const { data: membership } = await supabase
    .from("tenant_members")
    .select("tenant_id, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (membership) {
    const { data: joined } = await supabase
      .from("tenants")
      .select("*")
      .eq("id", membership.tenant_id)
      .maybeSingle();
    // Read back through the user client so RLS re-confirms the membership
    // rather than trusting the row we just read.
    if (joined) return joined as Tenant;
  }

  // First login: create a self-serve tenant on the free self_host plan. The
  // customer upgrades from /dashboard/billing. Use the admin client so the
  // insert is not blocked by a strict RLS insert policy; fall back to the user
  // client (its own owner_id is allowed).
  const client = createAdminClient() ?? supabase;
  const name = deriveTenantName(profile);
  const { data: created } = await client
    .from("tenants")
    .insert({ owner_id: userId, name, plan: "self_host" })
    .select("*")
    .maybeSingle();
  if (!created) return null;

  // Owner membership row (best effort).
  await client
    .from("tenant_members")
    .insert({ tenant_id: created.id, user_id: userId, role: "owner" })
    .then(
      () => undefined,
      () => undefined,
    );
  return created as Tenant;
}

function deriveTenantName(profile: Profile): string {
  if (profile.full_name && profile.full_name.trim().length > 0) {
    return `${profile.full_name.split(" ")[0]}'s workspace`;
  }
  const local = profile.email.split("@")[0] ?? "my";
  return `${local}'s workspace`;
}

// --- Sites -----------------------------------------------------------------

export async function listSites(tenantId: string): Promise<Site[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("sites")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });
  return (data as Site[] | null) ?? [];
}

export async function getSite(tenantId: string, siteId: string): Promise<Site | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("sites")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("id", siteId)
    .maybeSingle();
  return (data as Site | null) ?? null;
}

// --- Overview KPIs (honest; zeros when empty) ------------------------------

export type DashboardOverview = {
  sitesCount: number;
  /** Whether any site has ever reported a connected daemon. */
  anyDaemonConnected: boolean;
  /** Present only once a real daemon feed exists; null renders an empty state. */
  averageScore: number | null;
  nextRunAt: string | null;
  /**
   * Findings-by-severity and changes-in-30d come from the daemon feed, which
   * does not exist in the control-plane DB yet. They are surfaced as empty
   * until a daemon reports; we NEVER seed dummy values. `feedAvailable` tells
   * the UI to show the connect-a-daemon empty state.
   */
  findingsBySeverity: { critical: number; high: number; medium: number; low: number };
  changesLast30d: number;
  feedAvailable: boolean;
};

export async function getOverview(tenantId: string): Promise<DashboardOverview> {
  const sites = await listSites(tenantId);
  const anyDaemonConnected = sites.some((s) => s.connected_daemon_at != null);
  const scores = sites
    .map((s) => s.score)
    .filter((v): v is number => typeof v === "number");
  const averageScore =
    scores.length > 0
      ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
      : null;

  return {
    sitesCount: sites.length,
    anyDaemonConnected,
    averageScore,
    nextRunAt: null,
    findingsBySeverity: { critical: 0, high: 0, medium: 0, low: 0 },
    changesLast30d: 0,
    // No daemon change/findings feed is wired into the control plane yet, so
    // the activity surfaces are empty by construction. This is intentional per
    // the product spec: empty states, never fabricated metrics.
    feedAvailable: false,
  };
}

// --- Subscription / billing ------------------------------------------------

export async function getTenantSubscription(
  tenantId: string,
): Promise<Subscription | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("subscriptions")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as Subscription | null) ?? null;
}

export type BillingView = {
  planId: PlanId;
  planName: string;
  priceUsdMonth: number;
  status: Tenant["status"];
  subscription: Subscription | null;
  customerId: string | null;
  sitesUsed: number;
  sitesQuota: number;
  seatsQuota: number;
};

export async function getBillingView(tenant: Tenant): Promise<BillingView> {
  const plan = planOf(tenant.plan);
  const [sub, sites] = await Promise.all([
    getTenantSubscription(tenant.id),
    listSites(tenant.id),
  ]);
  return {
    planId: plan.id,
    planName: plan.name,
    priceUsdMonth: plan.priceUsdMonth,
    status: tenant.status,
    subscription: sub,
    customerId: tenant.billing_customer_id,
    sitesUsed: sites.length,
    sitesQuota: plan.sites,
    seatsQuota: plan.seats,
  };
}

// --- Activity (change log) -------------------------------------------------

export type ActivityEntry = {
  id: string;
  url: string;
  summary: string;
  evidenceTier: string;
  diff: string | null;
  appliedAt: string;
  reverted: boolean;
};

/**
 * The change log is produced by the daemon's executor and shipped to the
 * control plane. That ingestion path is not built yet, so this returns an empty
 * list and the UI shows the connect-a-daemon empty state. Kept as a typed
 * function so wiring the feed later is a one-file change.
 */
export async function listActivity(_tenantId: string): Promise<ActivityEntry[]> {
  void _tenantId;
  return [];
}

// --- Daemon pairings / terminal sessions -----------------------------------

export async function listPairings(tenantId: string): Promise<DaemonPairing[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("daemon_pairings")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });
  return (data as DaemonPairing[] | null) ?? [];
}

export async function listTerminalSessions(
  tenantId: string,
): Promise<TerminalSession[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("terminal_sessions")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(25);
  return (data as TerminalSession[] | null) ?? [];
}

// --- Invites (owner-visible) -----------------------------------------------

export async function listInvitesForEmail(email: string): Promise<PaymentInvite[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("payment_invites")
    .select("*")
    .eq("email", email.toLowerCase())
    .order("created_at", { ascending: false });
  return (data as PaymentInvite[] | null) ?? [];
}

// --- Audit (own actions) ---------------------------------------------------

export async function listOwnAudit(actorId: string): Promise<AuditLog[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("audit_log")
    .select("*")
    .eq("actor_id", actorId)
    .order("created_at", { ascending: false })
    .limit(50);
  return (data as AuditLog[] | null) ?? [];
}
