import { describe, expect, it } from "vitest";
import { normalizeRepo } from "./post.js";

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
