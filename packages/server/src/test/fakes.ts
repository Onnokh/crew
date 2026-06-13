import type { IncomingMessage } from "node:http";
import type { Authenticator } from "../auth/authenticator.js";
import type { User } from "../core/user.js";
import type { Embedder } from "../embedding/embedder.js";
import type { Clock } from "../platform/clock.js";
import type { IdGen } from "../platform/id-gen.js";

/**
 * Test doubles for every injected seam, gathered in one place under `test/`.
 *
 * These are test-only fixtures, not alternative production implementations — so
 * they live with the tests, never beside shipping code. Each is minimal and
 * behaviourless enough that it cannot drift from the real thing: a clock that
 * returns a fixed time, an id counter, a token→User map, and a deterministic
 * embedder that exists only because the real one downloads a 30 MB model. The
 * real store itself is never faked — integration tests run it over `:memory:`
 * (see harness.ts). The interface + real implementation for each seam stay
 * colocated in `src/<seam>/`; only the fake moved here.
 */

/** {@link Clock} double: a fixed, advanceable time so tests assert ordering. */
export class FakeClock implements Clock {
  constructor(private current: number = 1_700_000_000_000) {}

  now(): number {
    return this.current;
  }

  /** Move the clock forward by `ms` and return the new time. */
  advance(ms: number): number {
    this.current += ms;
    return this.current;
  }

  /** Pin the clock to an absolute time. */
  set(ms: number): void {
    this.current = ms;
  }
}

/** {@link IdGen} double: deterministic `post_1`, `post_2`, … per prefix. */
export class FakeIdGen implements IdGen {
  private counters = new Map<string, number>();

  next(prefix: string): string {
    const n = (this.counters.get(prefix) ?? 0) + 1;
    this.counters.set(prefix, n);
    return `${prefix}_${n}`;
  }
}

/**
 * {@link Authenticator} double: a fixed map of raw bearer tokens → User, no
 * hashing. The map keys are the raw tokens a test client sends.
 */
export class FakeAuthenticator implements Authenticator {
  constructor(private readonly tokensToUsers: Record<string, User>) {}

  async authenticate(request: IncomingMessage): Promise<User | null> {
    const header = request.headers.authorization;
    if (!header) return null;
    const match = /^Bearer (.+)$/.exec(header.trim());
    const token = match?.[1]?.trim();
    if (!token) return null;
    return this.tokensToUsers[token] ?? null;
  }
}

/**
 * Deterministic {@link Embedder} double — never downloads the 30 MB model (see
 * TECH.md "Tests use a deterministic fake embedder"). It hashes a text's concept
 * tokens into a fixed-dimension bag-of-concepts vector and L2-normalizes it, so
 * the same text always yields the same vector and texts sharing concepts land
 * near each other under cosine distance — enough to exercise the vector leg and
 * RRF fusion end to end without ONNX.
 *
 * To exercise the "paraphrase with no keyword overlap still finds the Post"
 * criterion deterministically, tokens are first mapped through a tiny synonym
 * table to a canonical concept (e.g. `crash`/`throws` → `failure`), so a query
 * phrased with different words than the Post still hashes onto the same
 * dimensions. This is a stand-in for the real model's semantic space, not a
 * model of it.
 */
export class FakeEmbedder implements Embedder {
  readonly modelName: string;
  readonly dimensions: number;

  constructor(modelName = "fake-embedder-v1", dimensions = 384) {
    this.modelName = modelName;
    this.dimensions = dimensions;
  }

  async embed(text: string): Promise<number[]> {
    const vec = new Array<number>(this.dimensions).fill(0);
    const concepts = tokenize(text).map(canonical);
    for (const concept of concepts) {
      // Two hashed dimensions per concept widen the footprint so distinct
      // concepts collide less; sign comes from a third hash for spread.
      const a = hash(concept) % this.dimensions;
      const b = hash(`${concept}#`) % this.dimensions;
      const sign = hash(`${concept}~`) % 2 === 0 ? 1 : -1;
      vec[a]! += sign;
      vec[b]! += sign;
    }
    return normalize(vec);
  }
}

/** Lowercased word-ish tokens — the same token shape as the FTS query path. */
function tokenize(text: string): string[] {
  return (text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []) as string[];
}

/**
 * Collapse known synonyms onto a shared concept token so a paraphrase with no
 * literal keyword overlap still embeds near the original. Deliberately tiny —
 * it only needs to cover the words the tests paraphrase between.
 */
const SYNONYMS: Record<string, string> = {
  crash: "failure",
  crashes: "failure",
  error: "failure",
  errors: "failure",
  throws: "failure",
  throwing: "failure",
  fails: "failure",
  failing: "failure",
  breaks: "failure",
  broken: "failure",
  pin: "version",
  pinning: "version",
  mismatch: "version",
  version: "version",
  dependency: "version",
};

function canonical(token: string): string {
  return SYNONYMS[token] ?? token;
}

/** FNV-1a — a fast, deterministic, non-negative 32-bit string hash. */
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** L2-normalize so cosine distance behaves; an all-zero vector stays zero. */
function normalize(vec: number[]): number[] {
  let sumSq = 0;
  for (const x of vec) sumSq += x * x;
  const norm = Math.sqrt(sumSq);
  if (norm === 0) return vec;
  return vec.map((x) => x / norm);
}
