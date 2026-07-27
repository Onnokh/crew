const MAX_LIMIT = 50;

export const STRATEGIES = [
  {
    id: "current",
    label: "Current contract",
    description: "Preserve the caller's situation and optional context fields.",
  },
  {
    id: "normalized",
    label: "Normalized context",
    description: "Trim whitespace and canonicalize repo spelling before the call.",
  },
  {
    id: "minimal",
    label: "Minimal payload",
    description: "Send the situation and repo, omitting environment context.",
  },
  {
    id: "adaptive",
    label: "Adaptive follow-up",
    description: "Start normalized, then permit one follow-up only when underfilled.",
  },
];

export function normalizeWhitespace(value = "") {
  return String(value).trim().replace(/\s+/g, " ");
}

export function normalizeRepo(value = "") {
  const trimmed = normalizeWhitespace(value)
    .replace(/^git@github\.com:/i, "")
    .replace(/^https?:\/\/github\.com\//i, "")
    .replace(/^github\.com\//i, "")
    .replace(/\.git\/?$/i, "")
    .replace(/\/$/, "");
  return trimmed || undefined;
}

export function clampLimit(value, fallback = 5) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(MAX_LIMIT, Math.max(1, Math.trunc(numeric)));
}

function baseArgs(record) {
  return {
    situation: String(record.situation ?? ""),
    environment: record.environment ? String(record.environment) : undefined,
    repo: record.repo ? String(record.repo) : undefined,
    limit: clampLimit(record.requestedLimit),
  };
}

export function buildQueryArgs(record, strategyId) {
  const current = baseArgs(record);
  if (strategyId === "current") return current;

  const normalized = {
    ...current,
    situation: normalizeWhitespace(current.situation),
    environment: current.environment ? normalizeWhitespace(current.environment) : undefined,
    repo: current.repo ? normalizeRepo(current.repo) : undefined,
  };

  if (strategyId === "normalized" || strategyId === "adaptive") return normalized;
  if (strategyId === "minimal") {
    return { situation: normalized.situation, repo: normalized.repo, limit: normalized.limit };
  }
  throw new Error(`Unknown query strategy: ${strategyId}`);
}

export function estimateRequest(args) {
  const present = Object.fromEntries(
    Object.entries(args).filter(([, value]) => value !== undefined),
  );
  const json = JSON.stringify(present);
  return {
    bytes: Buffer.byteLength(json),
    fields: Object.keys(present),
    json,
  };
}

export function summarize(records, strategyId) {
  const rows = records.map((record) => {
    const args = buildQueryArgs(record, strategyId);
    const request = estimateRequest(args);
    const observed = Number(record.observedResultCount ?? 0);
    const requested = clampLimit(record.requestedLimit);
    return {
      caseId: record.caseId,
      args,
      request,
      observedResultCount: observed,
      requestedLimit: requested,
      underfilled: observed > 0 && observed < requested,
      zeroResult: observed === 0,
    };
  });

  const totalBytes = rows.reduce((sum, row) => sum + row.request.bytes, 0);
  const withRepo = rows.filter((row) => row.args.repo !== undefined).length;
  const withEnvironment = rows.filter((row) => row.args.environment !== undefined).length;
  const underfilled = rows.filter((row) => row.underfilled).length;
  const zeroResult = rows.filter((row) => row.zeroResult).length;

  return {
    strategyId,
    cases: rows.length,
    totalRequestBytes: totalBytes,
    meanRequestBytes: rows.length ? Math.round(totalBytes / rows.length) : 0,
    repoRate: rows.length ? withRepo / rows.length : 0,
    environmentRate: rows.length ? withEnvironment / rows.length : 0,
    underfilled,
    zeroResult,
    followUpEligible: strategyId === "adaptive" ? underfilled + zeroResult : 0,
    rows,
  };
}

export function renderState(records, strategyIndex = 0, caseIndex = 0) {
  const strategy = STRATEGIES[strategyIndex % STRATEGIES.length];
  const summary = summarize(records, strategy.id);
  const row = summary.rows[caseIndex % Math.max(1, summary.rows.length)];
  return { strategy, summary, row };
}
