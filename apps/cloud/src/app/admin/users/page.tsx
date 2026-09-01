import Link from "next/link";
import { SearchBox } from "./search-box";
import { UserActions } from "./user-actions";
import { PageHeader } from "@/components/app-shell";
import { Card, CardBody } from "@/components/ui/card";
import { Badge, statusTone } from "@/components/ui/badge";
import { Banner } from "@/components/ui/banner";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { TableWrap, THead, TH, TBody, TR, TD } from "@/components/ui/table";
import { adminConfigured, listUsers, type AdminUsersQuery } from "@/lib/admin-api";
import { formatDate, formatMoney } from "@/lib/cn";

export const dynamic = "force-dynamic";
export const metadata = { title: "Users — Admin" };

type SortKey = "created_at" | "email" | "last_seen_at";

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const query: AdminUsersQuery = {
    ...(sp.search ? { search: sp.search } : {}),
    sort: (sp.sort as SortKey) ?? "created_at",
    dir: sp.dir === "asc" ? "asc" : "desc",
    page: sp.page ? Math.max(1, Number(sp.page)) : 1,
  };
  const { rows, total, page, pageSize } = await listUsers(query);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <>
      <PageHeader
        title="Users"
        description={`${total} user${total === 1 ? "" : "s"}`}
        action={<SearchBox />}
      />

      {!adminConfigured() ? (
        <div className="mb-6">
          <Banner tone="warning" title="Service-role key not configured">
            Set <code className="font-mono">SUPABASE_SERVICE_ROLE_KEY</code> to list
            users across all tenants.
          </Banner>
        </div>
      ) : null}

      <Card>
        <CardBody className="p-0">
          {rows.length === 0 ? (
            <div className="p-5">
              <EmptyState
                title="No users"
                description={
                  sp.search
                    ? "No users match that search."
                    : "No one has signed up yet."
                }
              />
            </div>
          ) : (
            <TableWrap>
              <THead>
                <TR>
                  <SortableTH label="Email" col="email" sp={sp} />
                  <TH>Plan</TH>
                  <TH>Status</TH>
                  <SortableTH label="Signed up" col="created_at" sp={sp} />
                  <SortableTH label="Last seen" col="last_seen_at" sp={sp} />
                  <TH>Sites</TH>
                  <TH>LTV</TH>
                  <TH>
                    <span className="sr-only">Actions</span>
                  </TH>
                </TR>
              </THead>
              <TBody>
                {rows.map((u) => (
                  <TR key={u.id}>
                    <TD>
                      <Link
                        href={`/admin/users/${u.id}`}
                        className="font-medium text-[var(--color-fg)] hover:text-[var(--color-accent)]"
                      >
                        {u.email}
                      </Link>
                      {u.role === "superadmin" ? (
                        <Badge tone="purple" className="ml-2">
                          admin
                        </Badge>
                      ) : null}
                      {u.suspended ? (
                        <Badge tone="danger" className="ml-2">
                          suspended
                        </Badge>
                      ) : null}
                    </TD>
                    <TD>{u.planName ?? "—"}</TD>
                    <TD>
                      {u.status ? (
                        <Badge tone={statusTone(u.status)}>{u.status}</Badge>
                      ) : (
                        "—"
                      )}
                    </TD>
                    <TD mono>{formatDate(u.createdAt)}</TD>
                    <TD mono>{u.lastSeenAt ? formatDate(u.lastSeenAt) : "—"}</TD>
                    <TD mono>{u.sitesCount}</TD>
                    <TD mono>{formatMoney(u.lifetimeValueCents)}</TD>
                    <TD>
                      <UserActions
                        userId={u.id}
                        currentPlan={u.plan}
                        suspended={u.suspended}
                      />
                    </TD>
                  </TR>
                ))}
              </TBody>
            </TableWrap>
          )}
        </CardBody>
      </Card>

      {totalPages > 1 ? (
        <div className="mt-4 flex items-center justify-between">
          <p className="text-xs text-[var(--color-faint)]">
            Page {page} of {totalPages}
          </p>
          <div className="flex gap-2">
            <PageLink sp={sp} page={page - 1} disabled={page <= 1}>
              Previous
            </PageLink>
            <PageLink sp={sp} page={page + 1} disabled={page >= totalPages}>
              Next
            </PageLink>
          </div>
        </div>
      ) : null}
    </>
  );
}

function buildQuery(
  sp: Record<string, string | undefined>,
  overrides: Record<string, string | undefined>,
): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...sp, ...overrides })) {
    if (v !== undefined && v !== "") params.set(k, v);
  }
  return params.toString();
}

function SortableTH({
  label,
  col,
  sp,
}: {
  label: string;
  col: SortKey;
  sp: Record<string, string | undefined>;
}) {
  const active = (sp.sort ?? "created_at") === col;
  const dir = sp.dir === "asc" ? "asc" : "desc";
  const nextDir = active && dir === "asc" ? "desc" : "asc";
  const arrow = active ? (dir === "asc" ? "▲" : "▼") : "";
  return (
    <TH>
      <Link
        href={`/admin/users?${buildQuery(sp, { sort: col, dir: nextDir, page: undefined })}`}
        className="inline-flex items-center gap-1 hover:text-[var(--color-fg)]"
      >
        {label}
        <span className="text-[9px]">{arrow}</span>
      </Link>
    </TH>
  );
}

function PageLink({
  sp,
  page,
  disabled,
  children,
}: {
  sp: Record<string, string | undefined>;
  page: number;
  disabled: boolean;
  children: React.ReactNode;
}) {
  if (disabled) {
    return (
      <Button variant="secondary" size="sm" disabled>
        {children}
      </Button>
    );
  }
  return (
    <Link href={`/admin/users?${buildQuery(sp, { page: String(page) })}`}>
      <Button variant="secondary" size="sm">
        {children}
      </Button>
    </Link>
  );
}
