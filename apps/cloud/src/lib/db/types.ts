/**
 * Hand-authored Supabase row types.
 *
 * These mirror `supabase/migrations/0001_init.sql` exactly. When you change a
 * column there, change it here — the whole app types its queries off this file.
 * (You can regenerate with `supabase gen types typescript` once linked; this
 * checked-in version keeps `pnpm typecheck` green with zero credentials.)
 */
import type { PlanId } from "../plans";

export type SubscriptionStatus =
  "trialing" | "active" | "past_due" | "canceled" | "incomplete" | "comp";

export type UserRole = "user" | "superadmin";

export type Profile = {
  id: string;
  email: string;
  full_name: string | null;
  role: UserRole;
  suspended: boolean;
  last_seen_at: string | null;
  created_at: string;
  updated_at: string;
};

export type Tenant = {
  id: string;
  owner_id: string;
  name: string;
  plan: PlanId;
  status: SubscriptionStatus;
  billing_customer_id: string | null;
  billing_subscription_id: string | null;
  comp: boolean;
  created_at: string;
  updated_at: string;
};

export type TenantMemberRole = "owner" | "admin" | "member";

export type TenantMember = {
  id: string;
  tenant_id: string;
  user_id: string;
  role: TenantMemberRole;
  created_at: string;
};

export type Site = {
  id: string;
  tenant_id: string;
  origin: string;
  name: string | null;
  observe_until: string | null;
  score: number | null;
  connected_daemon_at: string | null;
  created_at: string;
  updated_at: string;
};

export type Subscription = {
  id: string;
  tenant_id: string;
  plan: PlanId;
  provider: string;
  provider_subscription_id: string | null;
  provider_customer_id: string | null;
  status: SubscriptionStatus;
  amount_cents: number | null;
  currency: string;
  interval: string;
  current_period_start: string | null;
  current_period_end: string | null;
  created_at: string;
  updated_at: string;
};

export type BillingEvent = {
  id: string;
  provider: string;
  provider_event_id: string;
  type: string;
  tenant_id: string | null;
  payload: Record<string, unknown>;
  received_at: string;
  /**
   * When the event was successfully applied; null means recorded but not yet
   * applied. Recording and applying are separate steps, so a row can exist for
   * an event whose apply failed — and treating every duplicate as finished is
   * what made such a failure unrecoverable. See 0004_billing_events_applied.
   */
  applied_at: string | null;
};

export type PaymentInviteStatus = "pending" | "paid" | "expired" | "canceled";

export type PaymentInvite = {
  id: string;
  email: string;
  amount_cents: number;
  currency: string;
  description: string | null;
  grant_plan: PlanId | null;
  provider: string;
  checkout_url: string | null;
  status: PaymentInviteStatus;
  created_by: string | null;
  created_at: string;
  paid_at: string | null;
};

export type DaemonPairingStatus = "pending" | "redeemed" | "expired";

export type DaemonPairing = {
  id: string;
  tenant_id: string;
  site_id: string | null;
  code_hash: string;
  session_token_hash: string | null;
  status: DaemonPairingStatus;
  interactive: boolean;
  expires_at: string;
  created_by: string | null;
  created_at: string;
  redeemed_at: string | null;
};

export type TerminalSessionStatus = "waiting" | "attached" | "closed";

export type TerminalSession = {
  id: string;
  tenant_id: string;
  pairing_id: string | null;
  status: TerminalSessionStatus;
  interactive: boolean;
  created_by: string | null;
  created_at: string;
  closed_at: string | null;
};

export type AuditLog = {
  id: string;
  actor_id: string | null;
  actor_email: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  ip: string | null;
  created_at: string;
};

export type AdminSetting = {
  key: string;
  value_encrypted: string | null;
  value_plain: Record<string, unknown> | null;
  updated_by: string | null;
  updated_at: string;
};

/**
 * Minimal shape compatible with `@supabase/supabase-js` generics. We describe
 * Row/Insert/Update so `.from("x")` is fully typed. Insert/Update reuse Row
 * with generated columns made optional where the DB fills them.
 */
type TableDef<Row, Insert, Update> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

type Timestamps = "created_at" | "updated_at";
type Insertable<Row, Optional extends keyof Row> = Omit<Row, Optional> &
  Partial<Pick<Row, Optional>>;

export type Database = {
  public: {
    Tables: {
      profiles: TableDef<
        Profile,
        Insertable<
          Profile,
          Timestamps | "role" | "suspended" | "last_seen_at" | "full_name"
        >,
        Partial<Profile>
      >;
      tenants: TableDef<
        Tenant,
        Insertable<
          Tenant,
          | Timestamps
          | "id"
          | "status"
          | "comp"
          | "billing_customer_id"
          | "billing_subscription_id"
        >,
        Partial<Tenant>
      >;
      tenant_members: TableDef<
        TenantMember,
        Insertable<TenantMember, "created_at" | "id">,
        Partial<TenantMember>
      >;
      sites: TableDef<
        Site,
        Insertable<
          Site,
          Timestamps | "id" | "name" | "observe_until" | "score" | "connected_daemon_at"
        >,
        Partial<Site>
      >;
      subscriptions: TableDef<
        Subscription,
        Insertable<
          Subscription,
          | Timestamps
          | "id"
          | "currency"
          | "interval"
          | "current_period_start"
          | "current_period_end"
        >,
        Partial<Subscription>
      >;
      billing_events: TableDef<
        BillingEvent,
        Insertable<BillingEvent, "received_at" | "id" | "tenant_id" | "applied_at">,
        Partial<BillingEvent>
      >;
      payment_invites: TableDef<
        PaymentInvite,
        Insertable<
          PaymentInvite,
          "created_at" | "id" | "status" | "currency" | "checkout_url" | "paid_at"
        >,
        Partial<PaymentInvite>
      >;
      daemon_pairings: TableDef<
        DaemonPairing,
        Insertable<
          DaemonPairing,
          | "created_at"
          | "id"
          | "status"
          | "interactive"
          | "session_token_hash"
          | "redeemed_at"
        >,
        Partial<DaemonPairing>
      >;
      terminal_sessions: TableDef<
        TerminalSession,
        Insertable<
          TerminalSession,
          "created_at" | "id" | "status" | "interactive" | "closed_at"
        >,
        Partial<TerminalSession>
      >;
      audit_log: TableDef<
        AuditLog,
        Insertable<
          AuditLog,
          "created_at" | "id" | "before" | "after" | "ip" | "target_type" | "target_id"
        >,
        Partial<AuditLog>
      >;
      admin_settings: TableDef<
        AdminSetting,
        Insertable<
          AdminSetting,
          "updated_at" | "value_encrypted" | "value_plain" | "updated_by"
        >,
        Partial<AdminSetting>
      >;
    };
    Views: Record<never, never>;
    Functions: {
      is_superadmin: {
        Args: Record<never, never>;
        Returns: boolean;
      };
      /** Atomic single-use pairing burn. See migration 0003. */
      redeem_daemon_pairing: {
        Args: { p_code_hash: string; p_session_token_hash: string };
        Returns: { id: string; tenant_id: string; session_id: string }[];
      };
      /** Sweeps pending pairings past their expiry. Returns the count. */
      expire_daemon_pairings: {
        Args: Record<never, never>;
        Returns: number;
      };
    };
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
};
