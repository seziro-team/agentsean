import { describe, expect, it } from "vitest";
import {
  isAllowedByRobots,
  matchRule,
  parseRobotsTxt,
  robotsFromFetch,
} from "./robots.js";

describe("robots RFC 9309 + Google group selection", () => {
  it("most-octets wins and allow wins ties", () => {
    const parsed = parseRobotsTxt(`
User-agent: *
Disallow: /secret
Allow: /secret/public
`);
    const robots = {
      ...parsed,
      statusCode: 200,
      contentType: "text/plain",
      bytes: 10,
      redirectHops: 0,
      error: null,
      mode: "parsed" as const,
    };
    expect(isAllowedByRobots(robots, "https://ex.com/secret")).toBe(false);
    expect(isAllowedByRobots(robots, "https://ex.com/secret/public")).toBe(true);
    expect(isAllowedByRobots(robots, "https://ex.com/ok")).toBe(true);
  });

  it("Google-style: specific UA group is not merged with *", () => {
    const parsed = parseRobotsTxt(`
User-agent: *
Disallow: /private

User-agent: seanbot
Disallow: /bot-only
`);
    const robots = {
      ...parsed,
      statusCode: 200,
      contentType: "text/plain",
      bytes: 10,
      redirectHops: 0,
      error: null,
      mode: "parsed" as const,
    };
    expect(isAllowedByRobots(robots, "https://ex.com/private", "seanbot")).toBe(true);
    expect(isAllowedByRobots(robots, "https://ex.com/bot-only", "seanbot")).toBe(false);
  });

  it("4xx robots is allow-all; 5xx is disallow-all", () => {
    const allow = robotsFromFetch({
      statusCode: 404,
      raw: "",
      contentType: "text/plain",
      bytes: 0,
      redirectHops: 0,
      error: null,
    });
    expect(allow.mode).toBe("allow-all");
    expect(isAllowedByRobots(allow, "https://ex.com/x")).toBe(true);
    const deny = robotsFromFetch({
      statusCode: 503,
      raw: "",
      contentType: "text/plain",
      bytes: 0,
      redirectHops: 0,
      error: null,
    });
    expect(deny.mode).toBe("disallow-all");
    expect(isAllowedByRobots(deny, "https://ex.com/x")).toBe(false);
  });

  it("matches wildcards and $", () => {
    expect(matchRule("/fish*", "/fish.html")).toBe(true);
    expect(matchRule("/*.php$", "/index.php")).toBe(true);
    expect(matchRule("/*.php$", "/index.php?x=1")).toBe(false);
  });
});
