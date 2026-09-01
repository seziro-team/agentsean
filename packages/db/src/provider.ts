export type DatabaseProvider = "sqlite" | "postgres";

export function getDatabaseProvider(
  raw: string | undefined = process.env["SEAN_DATABASE_PROVIDER"],
): DatabaseProvider {
  const value = (raw ?? "sqlite").trim().toLowerCase();
  if (value === "sqlite" || value === "postgres") return value;
  throw new Error(
    `Unknown SEAN_DATABASE_PROVIDER "${value}". Use "sqlite" (local) or "postgres" (hosted).`,
  );
}
