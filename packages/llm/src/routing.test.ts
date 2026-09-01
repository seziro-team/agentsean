import { describe, expect, it } from "vitest";
import { CLASS_RATES, estimateCostUsd, resolveModel, taskClass } from "./routing.js";
import { assertNoSecrets, generateText, LlmCredentialLeakError } from "./client.js";

describe("model routing", () => {
  it("sends drafting to mid (Sonnet-class $2/$10) and triage to cheap", () => {
    expect(taskClass("draft")).toBe("mid");
    expect(taskClass("classify")).toBe("cheap");
    expect(taskClass("strategy")).toBe("top");
    expect(CLASS_RATES.mid).toEqual({ inputPerMTok: 2, outputPerMTok: 10 });
    expect(resolveModel("anthropic", "mid")).toBe("claude-sonnet-5");
  });

  it("estimates cost before the call", () => {
    const usd = estimateCostUsd("mid", 1_000_000, 1_000_000);
    expect(usd).toBe(12);
  });
});

describe("D4: LLM never holds write credentials", () => {
  it("refuses prompts that look like secrets", () => {
    expect(() => assertNoSecrets("here is a client_secret=abc")).toThrow(LlmCredentialLeakError);
    expect(() => assertNoSecrets("rewrite this title tag")).not.toThrow();
  });

  it("does not pass api keys into the injected generate function", async () => {
    const seen: string[] = [];
    const out = await generateText(
      {
        provider: "anthropic",
        apiKey: "sk-ant-SECRET",
        generate: async (req) => {
          seen.push(req.system, req.prompt);
          return {
            text: "ok",
            model: "mock",
            class: req.class,
            provider: "anthropic" as const,
            inputTokens: 10,
            outputTokens: 4,
            costUsd: 0,
            cached: false,
          };
        },
      },
      { class: "mid", system: "You emit JSON actions.", prompt: "Refresh the about page." },
    );
    expect(out.text).toBe("ok");
    expect(seen.join(" ")).not.toMatch(/sk-ant-SECRET/);
  });
});
