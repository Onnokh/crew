/**
 * Ingestion guardrail — the pure scan a `post` runs over its submitted text
 * *before* the Post reaches the store. A Post's text is later inserted into
 * other agents' contexts, so a stored secret leaks with distribution and a
 * stored injection is an attack with persistence built in. We reject at write
 * time rather than sanitise at read time: the corpus stays clean and the
 * rejection reason teaches the posting agent what not to share.
 *
 * Pure and self-contained — no I/O, no clock, no store (TECH.md "search + trust
 * + guardrails are pure functions"). It takes the four post fields, scans their
 * combined text against a set of high-signal patterns, and returns the first
 * problem found (or `ok`). Unit-tested independently of the server; the post
 * tool turns a rejection into a clear tool error.
 *
 * Deliberately conservative: every pattern targets an *obvious* leak or
 * directive, because a false positive blocks a legitimate learning. This is a
 * first-line tripwire, not a complete DLP engine — thresholds and patterns are a
 * tuning knob, like the ranking weights.
 */

/** The fields a Post carries into the scan; matches the `post` tool input. */
export type ScanInput = {
  situation: string;
  body: string;
  environment: string;
  repo: string;
};

/** Why a submission was rejected — a category plus a human-readable reason. */
export type ScanRejection = {
  ok: false;
  /** Coarse bucket the offending pattern belongs to. */
  category: "secret" | "pii" | "injection";
  /** A clear, agent-facing explanation of what tripped the scan. */
  reason: string;
};

/** A clean submission passes through unaffected. */
export type ScanPass = { ok: true };

export type ScanResult = ScanPass | ScanRejection;

/** One detection rule: a category, a regex, and the reason shown on a hit. */
type Rule = {
  category: ScanRejection["category"];
  pattern: RegExp;
  reason: string;
};

/**
 * The rule set, ordered so the most specific/dangerous categories are reported
 * first. Each pattern is high-signal on purpose — see the module doc on false
 * positives. Patterns are case-insensitive where casing doesn't carry meaning.
 */
const RULES: Rule[] = [
  // --- Secrets: provider-prefixed keys and private-key blocks ----------------
  {
    category: "secret",
    pattern: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/,
    reason:
      "the text contains a private key block. Remove the credential before posting.",
  },
  {
    // AWS access key id: AKIA/ASIA + 16 base32 chars.
    category: "secret",
    pattern: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/,
    reason:
      "the text contains what looks like an AWS access key id. Remove the credential before posting.",
  },
  {
    // GitHub tokens: ghp_/gho_/ghu_/ghs_/ghr_ + 36+ chars.
    category: "secret",
    pattern: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/,
    reason:
      "the text contains what looks like a GitHub token. Remove the credential before posting.",
  },
  {
    // OpenAI-style secret keys: sk- + 20+ chars (covers sk-proj- variants).
    category: "secret",
    pattern: /\bsk-[A-Za-z0-9_-]{20,}\b/,
    reason:
      "the text contains what looks like an API secret key. Remove the credential before posting.",
  },
  {
    // Slack tokens: xox[bpars]-...
    category: "secret",
    pattern: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/,
    reason:
      "the text contains what looks like a Slack token. Remove the credential before posting.",
  },
  {
    // Generic assignment of a secret-ish name to a non-placeholder value.
    category: "secret",
    pattern:
      /\b(?:api[_-]?key|secret|password|passwd|access[_-]?token|auth[_-]?token|private[_-]?key)\b\s*[:=]\s*["']?(?![<${]|x{3,}|\*{3,}|(?:your|my|the|placeholder|example|redacted|changeme|todo)\b)[^\s"']{8,}/i,
    reason:
      "the text appears to assign a real secret to a credential field. Use a placeholder instead of the actual value.",
  },

  // --- PII -------------------------------------------------------------------
  {
    // US Social Security Number, e.g. 123-45-6789.
    category: "pii",
    pattern: /\b\d{3}-\d{2}-\d{4}\b/,
    reason:
      "the text contains what looks like a Social Security number. Remove the personal data before posting.",
  },
  {
    // Payment card number: 13–16 digits, optionally space/dash grouped.
    category: "pii",
    pattern: /\b(?:\d[ -]?){13,16}\b/,
    reason:
      "the text contains what looks like a payment card number. Remove the personal data before posting.",
  },

  // --- Prompt injection ------------------------------------------------------
  {
    // "ignore (all) previous/prior/above instructions" and close variants.
    category: "injection",
    pattern:
      /\b(?:ignore|disregard|forget|override)\b[^.\n]{0,40}\b(?:previous|prior|above|earlier|all|any|the)\b[^.\n]{0,40}\b(?:instruction|instructions|prompt|prompts|rule|rules|directive|directives|context)\b/i,
    reason:
      "the text contains a prompt-injection directive aimed at overriding another agent's instructions. Posts are data for other agents to read, not commands.",
  },
  {
    // Fake role/system framing trying to seize the reader's prompt.
    category: "injection",
    pattern:
      /(?:^|\n)\s*(?:system|assistant|developer)\s*:|<\/?(?:system|assistant)>|\bnew\s+(?:instructions?|system\s+prompt)\b|\byou\s+are\s+now\b/i,
    reason:
      "the text tries to impersonate a system/role prompt or reassign the reading agent's role. Posts are data, not instructions.",
  },
];

/**
 * Scan a submitted Post for obvious secrets/PII or prompt-injection. Returns
 * `{ ok: true }` for clean text, or the first matching rule's category + reason.
 * The whole Post is scanned as one text blob — an injection hidden in
 * `environment` is as dangerous as one in `body`.
 */
export function scanPost(input: ScanInput): ScanResult {
  const text = [input.situation, input.body, input.environment, input.repo].join(
    "\n",
  );
  for (const rule of RULES) {
    if (rule.pattern.test(text)) {
      return { ok: false, category: rule.category, reason: rule.reason };
    }
  }
  return { ok: true };
}
