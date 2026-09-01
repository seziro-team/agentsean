import "server-only";
import { createAdminClient } from "./supabase/admin";
import { PLANS, planOf, type PlanId } from "./plans";
import type {
  AdminSetting,
  AuditLog,
  PaymentInvite,
  Profile,
  Subscription,
  Tenant,
} from "./db/types";

/**
 * Super-admin data access. Everything here uses the service-role client, which
 * BYPASSES RLS — so every function assumes the caller has already been proven a
 * superadmin by the /admin layout guard. When the service role is not
 * configured these return empty/zeroed results so the console still renders
 * with an honest "connect Supabase service role" banner.
 */

function admin() {
  return createAdminClient();
}

export function adminConfigured(): boolean {
  return admin() !== null;
}

// --- KPIs ------------------------------------------------------------------

export type AdminKpis = {
  totalSignups: number;
  activeSubscriptions: number;
  trials: number;
  mrrCents: number;
  revenueThisMonthCents: number;
  churnedThisMonth: number;
  signupsByDay: Array<{ date: string; count: number }>;
};

export async function getAdminKpis(): Promise<AdminKpis> {
  const db = admin();
  const empty: AdminKpis = {
    totalSignups: 0,
    activeSubscriptions: 0,
    trials: 0,
    mrrCents: 0,
    revenueThisMonthCents: 0,
    churnedThisMonth: 0,
    signupsByDay: [],
  };
  if (!db) return empty;

  const [{ data: profiles }, { data: tenants }, { data: subs }] = await Promise.all([
    db.from("profiles").select("id, created_at"),
    db.from("tenants").select("status"),
    db.from("subscriptions").select("status, amount_cents, plan, updated_at"),
  ]);

  const totalSignups = profiles?.length ?? 0;
  const trials =
    (tenants as Pick<Tenant, "status">[] | null)?.filter((t) => t.status === "trialing")
      .length ?? 0;

  const activeSubs =
    (
      subs as
        Pick<Subscription, "status" | "amount_cents" | "plan" | "updated_at">[] | null
    )?.filter((s) => s.status === "active" || s.status === "comp") ?? [];

  // MRR from live subscription amounts; fall back to catalogue price when a row
  // carries no amount (e.g. comped). Never invents revenue for empty DBs.
  let mrrCents = 0;
  for (const s of activeSubs) {
    if (typeof s.amount_cents === "number" && s.amount_cents > 0) {
      mrrCents += s.amount_cents;
    } else {
      mrrCents += Math.round(planOf(s.plan).priceUsdMonth * 100);
    }
  }

  const monthPrefix = new Date().toISOString().slice(0, 7);
  const revenueThisMonthCents = activeSubs
    .filter((s) => (s.updated_at ?? "").startsWith(monthPrefix))
    .reduce(
      (sum, s) =>
        sum +
        (typeof s.amount_cents === "number"
          ? s.amount_cents
          : Math.round(planOf(s.plan).priceUsdMonth * 100)),
      0,
    );

  const churnedThisMonth =
    (subs as Pick<Subscription, "status" | "updated_at">[] | null)?.filter(
      (s) => s.status === "canceled" && (s.updated_at ?? "").startsWith(monthPrefix),
    ).length ?? 0;

  const signupsByDay = bucketByDay(
    (profiles as Pick<Profile, "created_at">[] | null)?.map((p) => p.created_at) ?? [],
  );

  return {
    totalSignups,
    activeSubscriptions: activeSubs.length,
    trials,
    mrrCents,
    revenueThisMonthCents,
    churnedThisMonth,
    signupsByDay,
  };
}

function bucketByDay(dates: string[]): Array<{ date: string; count: number }> {
  const counts = new Map<string, number>();
  for (const iso of dates) {
    const day = iso.slice(0, 10);
    counts.set(day, (counts.get(day) ?? 0) + 1);
  }
  // Last 30 days, oldest first, zero-filled so the sparkline is honest.
  const out: Array<{ date: string; count: number }> = [];
  const today = new Date();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - i);
    const key = d.toISOString().slice(0, 10);
    out.push({ date: key, count: counts.get(key) ?? 0 });
  }
  return out;
}

// --- Users -----------------------------------------------------------------

export type AdminUserRow = {
  id: string;
  email: string;
  fullName: string | null;
  role: Profile["role"];
  suspended: boolean;
  createdAt: string;
  lastSeenAt: string | null;
  plan: PlanId | null;
  planName: string | null;
  status: Tenant["status"] | null;
  sitesCount: number;
  lifetimeValueCents: number;
};

export type AdminUsersPage = {
  rows: AdminUserRow[];
  total: number;
  page: number;
  pageSize: number;
};

export type AdminUsersQuery = {
  search?: string;
  sort?: "created_at" | "email" | "last_seen_at";
  dir?: "asc" | "desc";
  page?: number;
  pageSize?: number;
};

export async function listUsers(query: AdminUsersQuery = {}): Promise<AdminUsersPage> {
  const db = admin();
  const page = Math.max(1, query.page ?? 1);
  const pageSize = Math.min(100, Math.max(10, query.pageSize ?? 25));
  if (!db) return { rows: [], total: 0, page, pageSize };

  const sort = query.sort ?? "created_at";
  const dir = query.dir ?? "desc";
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let q = db
    .from("profiles")
    .select("*", { count: "exact" })
    .order(sort, { ascending: dir === "asc" })
    .range(from, to);
  if (query.search && query.search.trim()) {
    q = q.ilike("email", `%${query.search.trim()}%`);
  }
  const { data: profiles, count } = await q;

  const rows: AdminUserRow[] = [];
  for (const p of (profiles as Profile[] | null) ?? []) {
    const enriched = await enrichUser(p);
    rows.push(enriched);
  }
  return { rows, total: count ?? rows.length, page, pageSize };
}

async function enrichUser(p: Profile): Promise<AdminUserRow> {
  const db = admin();
  let plan: PlanId | null = null;
  let planName: string | null = null;
  let status: Tenant["status"] | null = null;
  let sitesCount = 0;
  let lifetimeValueCents = 0;

  if (db) {
    const { data: tenant } = await db
      .from("tenants")
      .select("id, plan, status")
      .eq("owner_id", p.id)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (tenant) {
      plan = tenant.plan;
      planName = PLANS[tenant.plan].name;
      status = tenant.status;
      const { count } = await db
        .from("sites")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenant.id);
      sitesCount = count ?? 0;
      const { data: paid } = await db
        .from("payment_invites")
        .select("amount_cents, status")
        .eq("email", p.email);
      lifetimeValueCents = (
        (paid as Array<{ amount_cents: number; status: string }> | null) ?? []
      )
        .filter((i) => i.status === "paid")
        .reduce((s, i) => s + i.amount_cents, 0);
    }
  }

  return {
    id: p.id,
    email: p.email,
    fullName: p.full_name,
    role: p.role,
    suspended: p.suspended,
    createdAt: p.created_at,
    lastSeenAt: p.last_seen_at,
    plan,
    planName,
    status,
    sitesCount,
    lifetimeValueCents,
  };
}

export async function getUserDetail(userId: string): Promise<{
  profile: Profile | null;
  tenant: Tenant | null;
  subscriptions: Subscription[];
  invites: PaymentInvite[];
}> {
  const db = admin();
  if (!db) {
    return { profile: null, tenant: null, subscriptions: [], invites: [] };
  }
  const { data: profile } = await db
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();
  const { data: tenant } = await db
    .from("tenants")
    .select("*")
    .eq("owner_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  let subscriptions: Subscription[] = [];
  let invites: PaymentInvite[] = [];
  if (tenant) {
    const { data: subs } = await db
      .from("subscriptions")
      .select("*")
      .eq("tenant_id", tenant.id)
      .order("created_at", { ascending: false });
    subscriptions = (subs as Subscription[] | null) ?? [];
  }
  if (profile) {
    const { data: inv } = await db
      .from("payment_invites")
      .select("*")
      .eq("email", (profile as Profile).email)
      .order("created_at", { ascending: false });
    invites = (inv as PaymentInvite[] | null) ?? [];
  }
  return {
    profile: (profile as Profile | null) ?? null,
    tenant: (tenant as Tenant | null) ?? null,
    subscriptions,
    invites,
  };
}

// --- Subscriptions ---------------------------------------------------------

export type AdminSubscriptionRow = Subscription & { ownerEmail: string | null };

export async function listAllSubscriptions(): Promise<AdminSubscriptionRow[]> {
  const db = admin();
  if (!db) return [];
  const { data: subs } = await db
    .from("subscriptions")
    .select("*")
    .order("created_at", { ascending: false });
  const rows: AdminSubscriptionRow[] = [];
  for (const s of (subs as Subscription[] | null) ?? []) {
    const { data: tenant } = await db
      .from("tenants")
      .select("owner_id")
      .eq("id", s.tenant_id)
      .maybeSingle();
    let ownerEmail: string | null = null;
    if (tenant?.owner_id) {
      const { data: prof } = await db
        .from("profiles")
        .select("email")
        .eq("id", tenant.owner_id)
        .maybeSingle();
      ownerEmail = (prof as Pick<Profile, "email"> | null)?.email ?? null;
    }
    rows.push({ ...s, ownerEmail });
  }
  return rows;
}

// --- Invites ---------------------------------------------------------------

export async function listAllInvites(): Promise<PaymentInvite[]> {
  const db = admin();
  if (!db) return [];
  const { data } = await db
    .from("payment_invites")
    .select("*")
    .order("created_at", { ascending: false });
  return (data as PaymentInvite[] | null) ?? [];
}

// --- Audit -----------------------------------------------------------------

export async function listAudit(limit = 200): Promise<AuditLog[]> {
  const db = admin();
  if (!db) return [];
  const { data } = await db
    .from("audit_log")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data as AuditLog[] | null) ?? [];
}

// --- Admin settings (billing connection status) ----------------------------

export async function getAdminSetting(key: string): Promise<AdminSetting | null> {
  const db = admin();
  if (!db) return null;
  const { data } = await db
    .from("admin_settings")
    .select("*")
    .eq("key", key)
    .maybeSingle();
  return (data as AdminSetting | null) ?? null;
}
