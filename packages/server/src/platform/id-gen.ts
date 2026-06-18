// The seam for minting stable, prefixed ids, so tests can mint ordered ids.
export type IdGen = {
  // Mint a fresh id with the given prefix, e.g. `next("post")` → `"post_V1Stg…"`.
  next(prefix: string): string;
};
