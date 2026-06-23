import { describe, expect, it } from "vitest";
import { normalizeRepo, repoHost } from "./post.js";

describe("normalizeRepo", () => {
  it("reduces common remote forms to the group/name tail", () => {
    const cases: Array<[string, string]> = [
      ["https://github.com/Onnokh/crew.git", "Onnokh/crew"],
      ["https://github.com/Onnokh/crew", "Onnokh/crew"],
      ["git@github.com:Onnokh/crew.git", "Onnokh/crew"],
      ["github.com/Onnokh/crew", "Onnokh/crew"],
      ["Onnokh/crew", "Onnokh/crew"],
      [
        "git.indicia.nl/online-concepts/sigi/sigi-frontend",
        "sigi/sigi-frontend",
      ],
      [
        "ssh://git@git.indicia.nl:2222/online-concepts/sigi/sigi-frontend.git",
        "sigi/sigi-frontend",
      ],
    ];
    for (const [input, expected] of cases) {
      expect(normalizeRepo(input)).toBe(expected);
    }
  });

  it("trims surrounding whitespace and a trailing slash", () => {
    expect(normalizeRepo("  github.com/Onnokh/crew/  ")).toBe("Onnokh/crew");
  });

  it("falls back to the trimmed input when there is no group/name to reduce to", () => {
    expect(normalizeRepo("weird")).toBe("weird");
    expect(normalizeRepo("  spaced  ")).toBe("spaced");
  });
});

describe("repoHost", () => {
  it("extracts the host from common remote forms", () => {
    const cases: Array<[string, string]> = [
      ["https://github.com/Onnokh/crew.git", "github.com"],
      ["git@git.indicia.nl:online-concepts/sigi.git", "git.indicia.nl"],
      ["ssh://git@git.indicia.nl:2222/x/y.git", "git.indicia.nl"],
      ["GitHub.com/Onnokh/crew", "github.com"],
      ["localhost:3000/x/y", "localhost"],
    ];
    for (const [input, expected] of cases) {
      expect(repoHost(input)).toBe(expected);
    }
  });

  it("returns empty for a hostless bare slug (a group is not a host)", () => {
    expect(repoHost("Onnokh/crew")).toBe("");
    expect(repoHost("weird")).toBe("");
  });
});
