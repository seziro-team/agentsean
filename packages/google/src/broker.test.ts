import { describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import {
  brokerHandleGoogleCallback,
  brokerStartUrl,
  setBrokerRegisteredCallback,
} from "./broker.js";
import { createPendingStore } from "./pending.js";
import { startBrokerAuthorization, grantFromBrokerHandoff } from "./oauth-broker.js";
import { loopbackRedirectUri } from "./oauth-config.js";

describe("stateless OAuth broker", () => {
  it("refuses a non-loopback redirect", () => {
    expect(() =>
      brokerStartUrl({
        secrets: {
          clientId: "cid",
          clientSecret: "sec",
          stateKey: randomBytes(32),
        },
        redirectUri: "https://evil.example/cb",
        wrapKeyB64: "x",
        localState: "s",
      }),
    ).toThrow(/127\.0\.0\.1/);
  });

  it("allows the hosted public origin when SEAN_HOSTED=1", () => {
    const prevH = process.env["SEAN_HOSTED"];
    const prevO = process.env["SEAN_PUBLIC_ORIGIN"];
    process.env["SEAN_HOSTED"] = "1";
    process.env["SEAN_PUBLIC_ORIGIN"] = "https://app.agentsean.dev";
    try {
      const url = brokerStartUrl({
        secrets: {
          clientId: "cid",
          clientSecret: "sec",
          stateKey: randomBytes(32),
        },
        redirectUri: "https://app.agentsean.dev/oauth/callback",
        wrapKeyB64: "x",
        localState: "s",
      });
      expect(url).toContain("accounts.google.com");
    } finally {
      if (prevH === undefined) delete process.env["SEAN_HOSTED"];
      else process.env["SEAN_HOSTED"] = prevH;
      if (prevO === undefined) delete process.env["SEAN_PUBLIC_ORIGIN"];
      else process.env["SEAN_PUBLIC_ORIGIN"] = prevO;
    }
  });

  it("hands a sealed refresh token to loopback, never as plaintext", async () => {
    setBrokerRegisteredCallback("https://oauth.agentsean.dev/google/callback");
    const pending = createPendingStore();
    const started = startBrokerAuthorization({
      brokerUrl: "https://oauth.agentsean.dev",
      redirectUri: loopbackRedirectUri(7777),
      pending,
    });
    expect(started.authorizationUrl).toContain("oauth.agentsean.dev/google/start");
    expect(started.authorizationUrl).toContain("127.0.0.1");

    const secrets = {
      clientId: "cid",
      clientSecret: "sec",
      stateKey: randomBytes(32),
    };
    const googleUrl = brokerStartUrl({
      secrets,
      redirectUri: loopbackRedirectUri(7777),
      wrapKeyB64: started.wrapKeyB64,
      localState: started.state,
    });
    const googleState = new URL(googleUrl).searchParams.get("state");
    expect(googleState).toBeTruthy();

    const fetchFn: typeof fetch = async (url, init) => {
      expect(String(url)).toContain("oauth2.googleapis.com/token");
      const body = String(init?.body);
      expect(body).toContain("client_secret=sec");
      expect(body).toContain("code_verifier=");
      return new Response(
        JSON.stringify({
          access_token: "at-1",
          refresh_token: "rt-secret",
          expires_in: 3600,
          scope: "https://www.googleapis.com/auth/webmasters",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    };

    const cb = await brokerHandleGoogleCallback({
      secrets,
      code: "auth-code",
      state: googleState!,
      fetch: fetchFn,
    });
    expect(cb.location.startsWith("http://127.0.0.1:7777/oauth/callback")).toBe(true);
    expect(cb.location).not.toContain("rt-secret");
    const loc = new URL(cb.location);
    expect(loc.searchParams.get("state")).toBe(started.state);
    const payload = loc.searchParams.get("payload");
    expect(payload).toBeTruthy();

    const grant = grantFromBrokerHandoff(pending.get(started.state)!, payload!, null);
    expect(grant.refreshToken).toBe("rt-secret");
    expect(grant.mode).toBe("broker");
  });
});
