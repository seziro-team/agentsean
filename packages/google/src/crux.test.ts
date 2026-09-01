import { describe, expect, it } from "vitest";
import { createQuotaManager } from "./quota.js";
import { defaultSleep, type GoogleHttp } from "./http.js";
import { queryCruxWithFallback } from "./crux.js";
import { testingModeFromTokenResponse } from "./tokens.js";
import { grantFromTokenResponse } from "./tokens.js";

describe("CrUX + token hygiene", () => {
  it("treats URL-level 404 as insufficient traffic and falls back to origin", async () => {
    const http: GoogleHttp = {
      fetch: async (url, init) => {
        const body = JSON.parse(String(init?.body)) as { url?: string; origin?: string };
        if (body.url) {
          return new Response(JSON.stringify({ error: { message: "not found" } }), {
            status: 404,
          });
        }
        return new Response(
          JSON.stringify({
            record: {
              metrics: {
                largest_contentful_paint: { percentiles: { p75: 2400 } },
                interaction_to_next_paint: { percentiles: { p75: 180 } },
                cumulative_layout_shift: { percentiles: { p75: 0.05 } },
              },
            },
          }),
          { status: 200 },
        );
      },
      quota: createQuotaManager(null),
      maxRetries: 0,
      sleep: defaultSleep,
      maxBackoffMs: 1,
    };
    const rec = await queryCruxWithFallback({
      http,
      apiKey: "k",
      url: "https://example.com/blog/post",
      origin: "https://example.com",
    });
    expect(rec.identifierKind).toBe("origin");
    expect(rec.insufficientTraffic).toBe(true);
    expect(rec.lcpP75).toBe(2400);
  });

  it("flags Testing-mode refresh tokens that expire in 7 days", () => {
    expect(testingModeFromTokenResponse({ refresh_token_expires_in: 604800 })).toBe(true);
    expect(testingModeFromTokenResponse({})).toBe(false);
    const grant = grantFromTokenResponse(
      {
        access_token: "a",
        refresh_token: "r",
        expires_in: 3600,
        refresh_token_expires_in: 604800,
      },
      null,
      { mode: "byo", email: null, googleSub: null },
    );
    expect(grant.testingModeSuspected).toBe(true);
    expect(grant.refreshToken).toBe("r");
  });

  it("preserves the existing refresh token when Google omits a new one", () => {
    const prev = grantFromTokenResponse(
      { access_token: "a1", refresh_token: "keep-me", expires_in: 3600 },
      null,
      { mode: "byo", email: null, googleSub: null },
    );
    const next = grantFromTokenResponse(
      { access_token: "a2", expires_in: 3600 },
      prev,
      { mode: "byo", email: null, googleSub: null },
    );
    expect(next.refreshToken).toBe("keep-me");
    expect(next.accessToken).toBe("a2");
  });
});
