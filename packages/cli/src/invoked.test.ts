import { describe, expect, it } from "vitest";
import { helpText, invokedAs } from "./args.js";

/**
 * A real user ran `npx agentsean`, read "sean doctor" in the help, typed it,
 * and got "sean: command not found". `npx` resolves the package into a temp
 * directory and runs it once — it never puts `sean` on PATH. Only a global
 * install or the curl installer does that.
 *
 * So the help has to echo back a command that actually exists on the machine
 * it is printing to.
 */
describe("invokedAs", () => {
  it("reports `sean` for a global install run as sean", () => {
    // npm links bin/sean -> dist/bin.js. Node does NOT resolve the symlink in
    // argv[1], so the invoked name survives — verified against a real
    // `npm i -g agentsean`.
    expect(invokedAs(["node", "/usr/local/bin/sean"])).toBe("sean");
    expect(invokedAs(["node", "/home/u/.npm-global/bin/sean"])).toBe("sean");
  });

  it("reports `agentsean` for a global install run as agentsean", () => {
    expect(invokedAs(["node", "/usr/local/bin/agentsean"])).toBe("agentsean");
  });

  it("reports `npx agentsean` when npx ran it", () => {
    // The _npx path segment is what distinguishes a one-off run from an
    // install; the bin is named `agentsean` in both cases.
    expect(
      invokedAs(["node", "/home/u/.npm/_npx/a1b2/node_modules/.bin/agentsean"]),
    ).toBe("npx agentsean");
    expect(
      invokedAs([
        "node",
        "C:\\Users\\u\\AppData\\npm-cache\\_npx\\a1\\node_modules\\.bin\\agentsean",
      ]),
    ).toBe("npx agentsean");
  });

  it("falls back to the always-works form for an unknown launcher", () => {
    // `node dist/bin.js`, a bundler, an odd symlink. Never claim a `sean`
    // command the user may not have.
    expect(invokedAs(["node", "/app/dist/bin.js"])).toBe("npx agentsean");
    expect(invokedAs(["node"])).toBe("npx agentsean");
    expect(invokedAs([])).toBe("npx agentsean");
  });
});

describe("helpText", () => {
  it("prints commands the caller can actually run", () => {
    const viaNpx = helpText("npx agentsean");
    expect(viaNpx).toContain("npx agentsean doctor");
    expect(viaNpx).toContain("npx agentsean audit <url>");
    // and must not tell an npx user to type a command they do not have
    expect(viaNpx).not.toMatch(/^ {2}sean /m);

    const global = helpText("sean");
    expect(global).toContain("sean doctor");
    expect(global).toContain("sean freeze");
  });

  it("documents every command under whichever name is in use", () => {
    for (const cmd of ["sean", "agentsean", "npx agentsean"]) {
      const text = helpText(cmd);
      for (const sub of ["doctor", "audit", "start", "revert", "freeze", "status"]) {
        expect(text, `${cmd} ${sub}`).toContain(`${cmd} ${sub}`);
      }
    }
  });
});
