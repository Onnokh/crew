import { createHmac } from "node:crypto";

export function normalizeTaskText(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function taskFingerprint(salt: string, value: string): string {
  return createHmac("sha256", salt)
    .update(`task\0${normalizeTaskText(value)}`)
    .digest("hex");
}

/**
 * Eight keyed minimum-hash bands over adjacent normalized words. Equal bands
 * support privacy-preserving near-duplicate grouping without emitting task text
 * or an unhashed vocabulary-derived signature.
 */
export function taskBands(salt: string, value: string): string[] {
  const words = normalizeTaskText(value).split(" ").filter(Boolean);
  const shingles =
    words.length < 2 ? words : words.slice(0, -1).map((word, index) => `${word} ${words[index + 1]}`);
  const safeShingles = shingles.length === 0 ? [""] : shingles;
  return Array.from({ length: 8 }, (_, band) => {
    let minimum = "f".repeat(64);
    for (const shingle of safeShingles) {
      const candidate = createHmac("sha256", salt)
        .update(`task-band:${band}\0${shingle}`)
        .digest("hex");
      if (candidate < minimum) minimum = candidate;
    }
    return minimum.slice(0, 16);
  });
}
