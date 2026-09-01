import { GscApiError, gscMessageForStatus } from "./errors.js";
import { bearer, googleFetch, type GoogleHttp } from "./http.js";

const BASE = "https://www.googleapis.com/siteVerification/v1";

export type VerificationMethod =
  "META" | "FILE" | "ANALYTICS" | "TAG_MANAGER" | "DNS_TXT";

export type VerificationToken = {
  method: VerificationMethod;
  token: string;
};

export type SiteVerificationClient = {
  getToken: (
    identifier: string,
    method: VerificationMethod,
    type?: "SITE" | "INET_DOMAIN",
  ) => Promise<VerificationToken>;
  insert: (
    identifier: string,
    method: VerificationMethod,
    type?: "SITE" | "INET_DOMAIN",
  ) => Promise<void>;
};

export function createSiteVerificationClient(opts: {
  http: GoogleHttp;
  getToken: () => Promise<string>;
}): SiteVerificationClient {
  const request = async <T>(
    url: string,
    init?: { method?: string; body?: unknown },
  ): Promise<T> => {
    const token = await opts.getToken();
    const hasBody = init?.body !== undefined;
    const res = await googleFetch(opts.http, "gsc.other", "siteVerification", url, {
      method: init?.method ?? "GET",
      headers: bearer(
        token,
        hasBody ? { "Content-Type": "application/json" } : undefined,
      ),
      ...(hasBody ? { body: JSON.stringify(init?.body) } : {}),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new GscApiError(res.status, gscMessageForStatus(res.status, body), body);
    }
    if (res.status === 204) return undefined as T;
    const text = await res.text();
    if (!text) return undefined as T;
    return JSON.parse(text) as T;
  };

  return {
    async getToken(identifier, method, type = "SITE") {
      const data = await request<{ token?: string; method?: string }>(`${BASE}/token`, {
        method: "POST",
        body: {
          verificationMethod: method,
          site: { type, identifier },
        },
      });
      return { method, token: data.token ?? "" };
    },

    async insert(identifier, method, type = "SITE") {
      await request(
        `${BASE}/webResource?verificationMethod=${encodeURIComponent(method)}`,
        {
          method: "POST",
          body: {
            site: { type, identifier },
          },
        },
      );
    },
  };
}

export function metaVerificationTag(token: string): string {
  return `<meta name="google-site-verification" content="${token}" />`;
}

export function fileVerificationPath(token: string): string {
  return `/${token}.html`;
}
