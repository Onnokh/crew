/** One stored, searchable item of shared agent knowledge. */
export type Post = {
  /** Stable, prefixed id: `'post_' + nanoid`. */
  id: string;
  /** Short human-readable title; falls back to the Situation for legacy rows. */
  title: string;
  /** The circumstances the Post applies to — the primary retrieval key. */
  situation: string;
  /** The knowledge itself — what to know or do once the Situation matches. */
  body: string;
  /** Freeform summary of the stack/setup the Post was learned in. */
  environment: string;
  /**
   * The git repository the Post originated from, stored verbatim as the client
   * sent it (usually the full remote, e.g. `git@git.indicia.nl:group/name.git`).
   * Reduce it with {@link normalizeRepo} for display/compare; the raw form is
   * kept so the host survives for intake filtering ({@link repoHost}).
   */
  repo: string;
  status: PostStatus;
  /** The id of the User this Post is attributed to. */
  createdBy: string;
  /** Creation timestamp, unix milliseconds. */
  createdAt: number;
  /** Denormalized most-recent Confirm time, unix ms; null if never confirmed. */
  lastConfirmed: number | null;
  /** Display-only popularity counter; not a trust signal, never feeds ranking. */
  views: number;
};

export type PostStatus = "active" | "retired";

/**
 * Canonicalise a repo identifier to its `group/name` tail so every common
 * remote form (scheme://, ssh user@host:, port, trailing slash, .git) reduces
 * to the same value. Falls back to the trimmed input when there aren't two
 * segments to reduce to.
 */
export function normalizeRepo(repo: string): string {
  const cleaned = repo
    .trim()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//i, "") // strip scheme://
    .replace(/^[^@/]*@/, "") // strip ssh user@ / URL userinfo
    .replace(/:/g, "/") // scp colon and any port become path separators
    .replace(/\/+$/, "") // trailing slashes
    .replace(/\.git$/i, ""); // .git suffix
  const segments = cleaned.split("/").filter(Boolean);
  if (segments.length >= 2) return segments.slice(-2).join("/");
  return segments[0] ?? repo.trim();
}

/**
 * Extract the git HOST from a repo identifier (e.g. `git.indicia.nl`,
 * `github.com`), lowercased, for intake allowlisting. Handles scheme://, ssh
 * `user@host:`, scp colons, and ports. Returns `""` for a hostless bare slug
 * like `Onnokh/crew` — the first segment is only treated as a host when it
 * looks like one (contains a dot, or is `localhost`), so a group is never
 * mistaken for a host.
 */
export function repoHost(repo: string): string {
  const cleaned = repo
    .trim()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//i, "") // strip scheme://
    .replace(/^[^@/]*@/, ""); // strip ssh user@ / URL userinfo
  const first = cleaned.split("/")[0] ?? "";
  const host = (first.split(":")[0] ?? "").toLowerCase(); // drop scp/port
  return /\./.test(host) || host === "localhost" ? host : "";
}

/** The fields a caller supplies when creating a Post; the store stamps id/timestamp/status. */
export type NewPost = {
  /** Optional at this seam; the store falls back to {@link NewPost.situation}. */
  title?: string;
  situation: string;
  body: string;
  environment: string;
  repo: string;
  /** The id of the authenticated User the Post is attributed to. */
  createdBy: string;
};
