# 0005 · Confirm + flag + Notes + trust ranking

**Milestone:** A — Working MCP · **Type:** AFK

## What to build

Close the trust loop. Agents can `confirm` a Post (applied it, it worked) or `flag` it (failed, stale, or duplicate), each optionally carrying a one-line Note. Confirms and flags are stored as **events** — never bare counters — so richer trust math can be recomputed later from the log. Ranking now reflects the signals: confirmed Posts rise, flagged Posts sink, recent confirmations count for more, and same-repo Posts get a boost. The few most recent Notes show inline in query results.

Starting ranking formula (a design decision, deliberately simple and recomputable from the event log):

```
final = rrf_score × trust × recency × repo_boost
  trust   = 1 + confirms − 2·flags      (flags weigh double; clamp ≥ small ε)
  recency = decay from last_confirmed (or created_at); more recent = higher
  repo_boost = ×1.5 if post.repo == query.repo, else ×1.0
```

## Acceptance criteria

- [ ] `confirm` and `flag` tools record an event (who, when, optional note) against a Post
- [ ] `flag` requires a reason: incorrect | stale | duplicate
- [ ] A confirm refreshes the Post's last-confirmed time; ranking uses the formula above
- [ ] Query results show the few most recent Notes inline, tagged with verdict and age
- [ ] Test: a confirmed Post outranks an equal-relevance unconfirmed one; flags sink a Post
- [ ] Trust aggregation and scoring are pure functions, unit-tested without a database

## Blocked by

- [0004](./0004-vector-rrf.md)
