const CSRF = { "x-sean-csrf": "1" };

export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, body: unknown, message: string) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

export async function api<T>(
  path: string,
  opts: { method?: string; body?: unknown; headers?: Record<string, string> } = {},
): Promise<T> {
  const method = opts.method ?? "GET";
  const headers: Record<string, string> = { ...CSRF, ...opts.headers };
  if (opts.body !== undefined) headers["content-type"] = "application/json";
  const res = await fetch(path, {
    method,
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : null,
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    const err =
      json && typeof json === "object" && "error" in json
        ? String((json as { error: unknown }).error)
        : `${res.status} ${path}`;
    throw new ApiError(res.status, json, err);
  }
  return json as T;
}

export async function establishSession(): Promise<boolean> {
  const hash = new URLSearchParams(location.hash.replace(/^#/, ""));
  const token = hash.get("token");
  const headers: Record<string, string> = {};
  if (token) headers["x-sean-token"] = token;
  const res = await fetch("/api/session", { headers });
  if (token && res.ok)
    history.replaceState(null, "", location.pathname + location.search);
  return res.ok;
}
