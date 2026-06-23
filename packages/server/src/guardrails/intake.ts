/**
 * Intake allowlist: an optional per-Team gate that only accepts Posts whose
 * originating git HOST is on the Team's list (e.g. `git.indicia.nl`). It keeps a
 * shared corpus from filling up with one-off personal-project posts. An empty
 * list means "accept everything" — the default, so existing Teams are unaffected.
 *
 * Host-level, not org-level: the assumption is that work and personal projects
 * live on different hosts. Matching is exact, case-insensitive, on the host.
 */
import { repoHost } from "../core/post.js";

export type IntakeRejection = {
  ok: false;
  /** A clear, agent-facing explanation of why the Post was not accepted. */
  reason: string;
};

export type IntakeResult = { ok: true } | IntakeRejection;

/**
 * Reduce an allowlist entry to a bare host for comparison: strip any scheme and
 * path a user pasted in, drop a port, lowercase. `https://git.indicia.nl/x` and
 * `git.indicia.nl` both become `git.indicia.nl`.
 */
export function normalizeDomain(entry: string): string {
  const host = entry
    .trim()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//i, "") // strip scheme://
    .split("/")[0] // drop any path
    ?.split(":")[0] // drop any port
    ?.toLowerCase();
  return host ?? "";
}

/**
 * Decide whether a Post from `repo` may be ingested under `allowedDomains`. An
 * empty (or absent) allowlist accepts everything. Otherwise the repo's host must
 * be on the list; a hostless bare slug can't be verified, so it's rejected with
 * a message telling the author to include the full remote.
 */
export function checkIntake(
  repo: string,
  allowedDomains: string[],
): IntakeResult {
  if (allowedDomains.length === 0) return { ok: true };

  const allowed = allowedDomains.map(normalizeDomain).filter(Boolean);
  if (allowed.length === 0) return { ok: true };

  const host = repoHost(repo);
  if (host && allowed.includes(host)) return { ok: true };

  const list = allowed.join(", ");
  const where = host ? `host '${host}'` : `repo '${repo}' has no recognizable host and`;
  return {
    ok: false,
    reason: `${where} is not on this team's intake allowlist (${list}). Posts are only accepted from these git hosts.`,
  };
}
