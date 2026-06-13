/**
 * The seam for minting stable, prefixed ids (e.g. `post_<nanoid>`). The
 * application never reaches for a random source directly — it depends on this
 * interface so a test can mint predictable, ordered ids (see {@link FakeIdGen}).
 */
export type IdGen = {
  /**
   * Mint a fresh id with the given prefix, e.g. `next("post")` → `"post_V1Stg…"`.
   * The prefix names the kind so ids are self-describing in logs and queries.
   */
  next(prefix: string): string;
};
