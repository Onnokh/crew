import { describe, expect, it } from "vitest";
import { checkIntake, normalizeDomain } from "./intake.js";

describe("normalizeDomain", () => {
  it("reduces an entry to a bare lowercase host", () => {
    expect(normalizeDomain("git.indicia.nl")).toBe("git.indicia.nl");
    expect(normalizeDomain("https://github.com/acme")).toBe("github.com");
    expect(normalizeDomain("HTTPS://Git.Indicia.NL:2222/x")).toBe(
      "git.indicia.nl",
    );
  });
});

describe("checkIntake", () => {
  it("accepts everything when the allowlist is empty", () => {
    expect(checkIntake("git@github.com:onno/side.git", []).ok).toBe(true);
  });

  it("accepts a repo whose host is on the list (across remote forms)", () => {
    const domains = ["git.indicia.nl"];
    for (const repo of [
      "git@git.indicia.nl:online-concepts/sigi.git",
      "https://git.indicia.nl/online-concepts/sigi",
      "ssh://git@git.indicia.nl:2222/online-concepts/sigi.git",
    ]) {
      expect(checkIntake(repo, domains).ok).toBe(true);
    }
  });

  it("rejects a repo whose host is off the list", () => {
    const result = checkIntake("git@github.com:onno/side.git", [
      "git.indicia.nl",
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("github.com");
      expect(result.reason).toContain("git.indicia.nl");
    }
  });

  it("rejects a hostless bare slug when an allowlist is set", () => {
    const result = checkIntake("Onnokh/crew", ["git.indicia.nl"]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("no recognizable host");
  });

  it("matches case-insensitively", () => {
    expect(checkIntake("git@GIT.indicia.nl:x/y.git", ["git.indicia.nl"]).ok).toBe(
      true,
    );
  });
});
