import { describe, expect, it } from "vitest";
import { createPendingStore } from "./pending.js";
import { exchangeByoCode, startByoAuthorization } from "./oauth-desktop.js";
import { loopbackRedirectUri } from "./oauth-config.js";
import { CONNECT_SCOPES } from "./scopes.js";

describe("RFC 8252 desktop OAuth", () => {
  it("uses the IP literal, PKCE S256, and offline consent", () => {
    const pending = createPendingStore();
    const started = startByoAuthorization({
      client: { clientId: "cid", clientSecret: "sec" },
      redirectUri: loopbackRedirectUri(0),
      pending,
    });
    const u = new URL(started.authorizationUrl);
    expect(u.searchParams.get("redirect_uri")).toBe(
      "http://127.0.0.1:0/oauth/callback",
    );
    expect(u.searchParams.get("redirect_uri")).not.toContain("localhost");
    expect(u.searchParams.get("code_challenge_method")).toBe("S256");
    expect(u.searchParams.get("access_type")).toBe("offline");
    expect(u.searchParams.get("prompt")).toBe("consent");
    for (const s of CONNECT_SCOPES) {
      expect(u.searchParams.get("scope")).toContain(s);
    }
  });

  it("exchanges a code with the PKCE verifier and client_secret", async () => {
    const pending = createPendingStore();
    const started = startByoAuthorization({
      client: { clientId: "cid", clientSecret: "sec" },
      redirectUri: loopbackRedirectUri(5555),
      pending,
    });
    const row = pending.take(started.state);
    expect(row?.verifier).toBeTruthy();
    const fetchFn: typeof fetch = async (_url, init) => {
      const body = String(init?.body);
      expect(body).toContain("code_verifier=");
      expect(body).toContain("client_secret=sec");
      expect(body).toContain(
        "redirect_uri=http%3A%2F%2F127.0.0.1%3A5555%2Foauth%2Fcallback",
      );
      return new Response(
        JSON.stringify({
          access_token: "at",
          refresh_token: "rt",
          expires_in: 3600,
        }),
        { status: 200 },
      );
    };
    const grant = await exchangeByoCode({
      client: { clientId: "cid", clientSecret: "sec" },
      pending: row!,
      code: "abc",
      fetch: fetchFn,
    });
    expect(grant.accessToken).toBe("at");
    expect(grant.mode).toBe("byo");
  });
});
