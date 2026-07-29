# Four-week Crew usage: first research pass

Date: 2026-07-23

## Executive read

Crew has crossed the threshold where real product conclusions are possible. A
read-only snapshot of the live Team database contains 1,155 queries, 464 Posts,
5,967 returned-result rows, and 170 verdicts from 12 active people between
2026-06-23 and 2026-07-23.

The strongest findings are:

1. **Usage is growing, and the store is genuinely shared.** Weekly queries grew
   from 143 in week 1 to 311 in week 4. Of the 450 Posts ever retrieved, 313
   (70%) were first retrieved by someone other than their author. There are 79
   attributed Confirms of a colleague's Post.
2. **The current zero-result metric is not a useful quality measure.** Only one
   query returned nothing, and 99.5% of queries filled their requested result
   limit. This says that the candidate floor is permissive, not that almost
   every result is relevant.
3. **Repository context is the clearest useful signal.** A returned Post from
   the same repo was Confirmed on 7.92% of exposures versus 1.20% for other/no
   repo results, a 6.6× directional difference. Queries with at least one
   same-repo result converted at 18.5%, compared with 6.6% when no same-repo
   result was available.
4. **Agreement between retrieval legs is another strong signal.** Results whose
   stored RRF score implies more than one retrieval leg found the Post were
   Confirmed on 8.98% of exposures, versus 1.90% for single-leg results. The
   difference remains inside both same-repo and cross-repo cohorts.
5. **Feedback is immediate but incomplete.** The median Query→Confirm delay is
   1.8 minutes and 75% arrive within 5.2 minutes. Even so, only 10 of 12 users
   have ever Confirmed, and a missing Confirm cannot be interpreted as a bad
   result.
6. **The default top five is defensible.** 97.5% of Confirmed result rows were
   ranks 1–5; no result below rank 7 was Confirmed. Rank 1 is better than rank 5,
   but ranks 2–5 still contain material value.

## Data and definitions

The analysis used an online, read-only SQLite backup taken at approximately
2026-07-23 13:44 UTC. The private database files were kept outside the
repository; only aggregate, anonymized findings and paraphrased examples appear
here.

| Item | Value |
| --- | --- |
| Observed activity | 2026-06-23 13:17 UTC–2026-07-23 13:40 UTC |
| Team DB SHA-256 | `2b48a0b52fbf3129cad911613a411287d99f42be4ea1b501344b27c2d73fcec0` |
| Control-plane DB SHA-256 | `c67c3249d2bc5db1a24970ce43f52b0c0a3a687ffecd14f99dac1d5872c707dd` |
| Active people | 12 |
| Queries | 1,155 |
| Posts | 464 |
| Returned-result rows | 5,967 |
| Confirms / Flags | 162 / 8 |

The event fields and write paths are mapped in
[Crew event data map](./2026-07-23-crew-event-data-map.md). In particular:

- a **result exposure** is one `retrieval_results` row;
- a **converted query** returned at least one Post that the same User later
  Confirmed within seven days;
- attribution is **last-touch**: the most recent same-User query returning that
  Post before the verdict receives credit;
- a **Confirmed result row** is the specific `(retrieval_id, post_id)` pair to
  which that last-touch verdict maps.

These definitions match the executable conversion query in
[`queries.ts`](../../packages/server/src/store/queries.ts#L740-L819), not the
older any-touch wording that remains in one type comment.

For conversion, two views are useful:

- the **full provisional cohort** converts 129 of 1,154 queries with results
  (11.2%);
- the **mature cohort**, ending seven days before extraction, converts 59 of
  705 queries with results (8.4%).

The mature cohort is conservative. In practice the observed feedback loop is
much faster than seven days: 90% of attributed Confirms arrived within roughly
18 minutes, although the longest took 30.2 hours.

## Adoption and call timing

### Weekly activity

| Cohort (UTC) | Queries | Posts | Confirms | Flags | Converted queries |
| --- | ---: | ---: | ---: | ---: | ---: |
| Jun 23–29 | 143 | 120 | 12 | 1 | 10 (7.0%) |
| Jun 30–Jul 6 | 219 | 136 | 17 | 1 | 13 (5.9%) |
| Jul 7–13 | 220 | 82 | 27 | 2 | 22 (10.0%) |
| Jul 14–20 | 311 | 92 | 45 | 1 | 33 (10.6%) |
| Jul 21–23, partial | 262 | 34 | 61 | 3 | 51 (19.5%, provisional) |

The pattern is healthy for an initial rollout: posting was front-loaded while
querying kept rising. Week-4 query volume was 117% above week 1, while Post
creation fell from 120 to 92. The partial final week is unusually active and
should not be treated as a comparable full week.

Calls look like normal in-workflow usage rather than background or weekend
automation:

- 99.2% of queries occurred Monday–Friday;
- 91.1% occurred from 08:00 through 17:59 Europe/Amsterdam time;
- the busiest local hour was 15:00–15:59;
- the highest daily volumes were 123, 104, and 103 queries.

Adoption is broad but concentrated. All 12 people queried; 10 posted and 10
Confirmed. The most active searcher produced 40.7% of queries and the top three
produced 63.4%. That concentration matters when interpreting global conversion:
part of the trend can be a change in who was active, not only a ranking change.

## Prompt behaviour

The live query prompts are not synthetic repeats:

- median length is 141 characters (about 21 words on average);
- the middle 50% spans 99–193 characters;
- only 5 of 1,155 queries are exact normalized repeats beyond their first
  occurrence (0.4%);
- 85.7% include repo context;
- 78.7% include environment context;
- 91 prompts contain explicit failure language such as “error,” “failed,” or
  “exception”;
- prompts are single-line situation summaries rather than pasted transcripts.

More text does not show a monotonic benefit. By prompt-length quartile, observed
conversion was 10.0%, 13.1%, 11.8%, and 9.7%. This is observational and
confounded by user/project, but it is enough to reject “make every prompt much
longer” as the first optimization.

Environment presence also has no visible aggregate lift: 11.2% conversion with
an environment versus 11.0% without one. Repo presence is different: queries
with repo context converted at 12.6%, versus 2.4% without it. More specifically,
among queries carrying a repo:

| Result availability | Queries | Converted |
| --- | ---: | ---: |
| At least one same-repo result | 504 | 93 (18.5%) |
| No same-repo result | 486 | 32 (6.6%) |

This does not prove causality—the repo also identifies the problem domain—but it
does say where prompt and corpus work should focus: capture a correct normalized
repo, then make sure that repo actually has relevant Posts.

Qualitatively, the queries are concrete engineering situations: local
environment failures, framework/CMS behaviour, API and auth contracts, data
flows, CI/tooling problems, implementation reviews, and repo-specific product
rules. They are generally search-shaped (“symptom + context + thing to learn”),
not generic chat questions.

## What was posted and how knowledge travelled

The 464 accepted Posts came from 10 authors and 49 raw repo-remote forms. The
average Post has:

- a 35-character title;
- a 147-character Situation;
- a 658-character Body;
- a 94-character Environment.

All Posts have the required title, Environment, and repo. There are only two
exact duplicate-title instances. A qualitative title sample is dominated by
consequential, anchored knowledge: environment setup traps, production/test
differences, hidden API contracts, CMS/framework conventions, deployment and CI
rules, and product-domain flows.

Distribution and reach are strong:

| Reach measure | Result |
| --- | ---: |
| Posts ever returned | 450 / 464 (97.0%) |
| Posts ever returned to another person | 425 / 464 (91.6%) |
| First retrieval by someone else | 313 / 450 (69.6%) |
| Median time to first retrieval | 6.5 hours |
| Median time to first cross-person retrieval | 17.9 hours |
| Posts ever Confirmed | 85 / 464 (18.3%) |
| Posts Confirmed by someone other than the author | 45 / 464 (9.7%) |

The median Post was surfaced 6 times; the 90th percentile was 34, and the
maximum was 118. The ten most-exposed Posts account for only 16.4% of current
Post exposures, so retrieval is not collapsing onto a tiny winner set.

At the exposure level, 72.6% of results were authored by someone other than the
querying User. Attributed Confirms split almost evenly: 79 cross-author and 82
self-author. Per exposure, other-authored Posts were Confirmed 1.80% of the time
versus 5.01% for self-authored Posts. The lower cross-author rate is a useful
baseline for the core product challenge: sharing is already happening at scale,
but precision matters more when the result comes from somebody else's context.

## Retrieval and ranking quality

### “Returned something” is not coverage

| Retrieval result | Count |
| --- | ---: |
| Zero-result queries | 1 / 1,155 (0.09%) |
| Queries filled exactly to requested limit | 1,149 / 1,155 (99.5%) |
| Mean results returned | 5.17 |

The retrieval pipeline deliberately drops vector candidates beyond a cosine
distance of 0.65 because KNN otherwise always returns something
([`retrieve.ts`](../../packages/server/src/search/retrieve.ts#L17-L28)). The
production data shows that this floor almost never produces an under-filled
result set. Zero-result rate should therefore be described as “candidate
availability,” not knowledge coverage or answer quality.

The stored telemetry does not include vector distance, BM25 rank, source-leg
membership, or threshold-drop counts. As a result, this dataset can show that
the floor is permissive but cannot directly calibrate a better value.

### Repo match and retrieval-leg agreement predict feedback

| Result cohort | Exposures | Confirmed result rows | Confirm rate |
| --- | ---: | ---: | ---: |
| Same repo | 1,313 | 104 | 7.92% |
| Other/no repo | 4,654 | 56 | 1.20% |
| Multi-leg agreement | 657 | 59 | 8.98% |
| Single-leg only | 5,310 | 101 | 1.90% |

“Multi-leg” is inferred conservatively from `rrf_score`: a score above the
maximum contribution of one RRF leg (`1/61`) requires more than one leg to have
returned the Post.

The two signals compound:

| Repo match | Retrieval agreement | Exposures | Confirm rate |
| --- | --- | ---: | ---: |
| Same | Multi-leg | 349 | 12.03% |
| Same | Single-leg | 964 | 6.43% |
| Other | Multi-leg | 308 | 5.52% |
| Other | Single-leg | 4,346 | 0.90% |

The 4,346 cross-repo, single-leg exposures are the clearest low-confidence
cohort. They are 72.8% of every returned row but produce only 39 Confirmed
result rows. This is the best place to test stricter filtering, confidence
labelling, or fewer rendered results.

### Rank still matters

| Rank | Exposures | Confirmed result rows | Confirm rate |
| ---: | ---: | ---: | ---: |
| 1 | 1,154 | 54 | 4.68% |
| 2 | 1,150 | 46 | 4.00% |
| 3 | 1,147 | 23 | 2.01% |
| 4 | 1,043 | 17 | 1.63% |
| 5 | 1,039 | 16 | 1.54% |
| 6–7 | 212 | 4 | 1.89% |
| 8–20 | 222 | 0 | 0% |

Ranks 1–2 contribute 62.5% of Confirmed result rows. Ranks 3–5 still contribute
35%, so collapsing to one answer would throw away observed value. Results below
rank 7 have no observed Confirm, although those cohorts are small and feedback
is optional.

## Feedback loop and concrete event patterns

Of 162 Confirms, 161 (99.4%) can be connected to a preceding same-User
retrieval using the implemented seven-day last-touch rule. Six of eight Flags
can be connected. This is a strong internal-consistency result: the heuristic
usually reconstructs the intended loop even though verdict rows do not store a
`retrieval_id`.

Observed, paraphrased sequences include:

1. A query about a containerized test/quality command returned a database
   production-vs-test caveat at rank 3; the agent Confirmed it.
2. A query about an admin “full sync” no-op returned a rank-1 architectural
   Post. The user Flagged it stale and attached the corrected request-header
   contract, producing actionable replacement knowledge.
3. A query using the word “wayfinder” returned an unrelated issue-tracker
   convention from another repo at rank 1. It was Flagged incorrect. This is a
   concrete lexical-collision failure and sits in the cross-repo/single-leg
   cohort highlighted above.
4. A query about a seeded server-rendered dashboard returned a “no Suspense
   needed” implementation rule at rank 2 and was Confirmed.
5. A local-development setup query produced a useful runtime-cache caveat at
   rank 7 and was Confirmed, showing that lower ranks sometimes contain
   non-obvious operational knowledge.

Flags are rare but high-information. Five are `stale` and three `incorrect`;
their Notes identify changed contracts, superseded implementation paths, and a
wrong root cause. The current sample is too small to optimize against a Flag
rate, but it is already useful for qualitative failure analysis.

## What cannot be answered yet

The event map is rich, but it does not directly record:

- which client or agent called the tool;
- the conversation/run/session that caused the call;
- whether the skill triggered before work, after a failure, or manually;
- tool-call latency, errors, timeouts, or rejected Post attempts;
- the exact rendered response at query time;
- candidate vector distances, BM25 ranks, retrieval-leg identity, or dropped
  candidates;
- whether a returned Post was read or applied when no Confirm/Flag followed;
- a direct `retrieval_id` on Confirm/Flag.

So “used” in this report means “later Confirmed by the same User,” not an
observed code change or successful command. Non-confirmation combines irrelevant
results, useful-but-unconfirmed results, abandoned tasks, and missing feedback.

The storage model also identifies a person, not an API key or agent
([`CONTEXT.md`](../../CONTEXT.md#L38-L44)). It cannot compare Codex with Claude,
measure skill compliance per client, or reconstruct concurrent runs.

## Recommended next experiments

1. **Make confidence visible before changing ranking.** Derive a simple cohort
   label from repo match and source-leg agreement. In an A/B or shadow analysis,
   suppress or collapse cross-repo/single-leg results after the highest
   confidence results. Primary metric: Confirmed result rows per query; guardrail:
   Flags and Confirmed lower-rank results lost.
2. **Capture the missing candidate trace.** For returned candidates and a small
   sampled set of dropped candidates, record keyword rank/BM25, vector distance,
   environment distance, source-leg membership, and threshold decision. This is
   required to tune the 0.65 distance floor using production data.
3. **Make outcome attribution explicit.** Let `confirm` and `flag` accept the
   originating `retrieval_id` while retaining a fallback for old clients. Add an
   optional outcome such as `applied`, `not_used`, or `still_blocked`; do not make
   feedback burdensome.
4. **Add a privacy-conscious tool-call envelope.** Record tool name, start/end,
   success/error category, client family/version, API-key id, and a hashed
   run/session id. This would answer when and why calls happen without storing a
   full conversation.
5. **Study low-confidence results manually.** Sample 50 cross-repo/single-leg
   rows, blind reviewers to rank, and label `useful`, `adjacent`, or `irrelevant`.
   The current feedback data strongly identifies this cohort but cannot say
   which unconfirmed rows were actually bad.
6. **Improve repo capture before prompt verbosity.** Repo context has a large
   observed relationship with outcomes; Environment presence and longer prompts
   do not. Validate repo normalization and warn when a known repo has no matching
   corpus Posts.
7. **Nudge missing feedback, not every query.** Ten people already Confirm.
   Prompt for feedback only after a likely application or when a high-confidence
   result was returned; blanket reminders would distort normal tool use.

## Integrity checks and caveats

- For all current Posts, `SUM(posts.views)` equals the number of matching
  `retrieval_results` rows exactly: 5,966, with zero per-Post mismatches. One
  additional result row references a deleted Post. This is evidence that the two
  telemetry paths agree for the observed corpus, not proof that no query was
  ever lost before either write.
- Query telemetry failure is deliberately swallowed so it cannot break the
  agent-facing query ([`query.ts`](../../packages/server/src/tools/query.ts#L78-L103)).
- The newest seven days are formally right-censored, even though feedback is
  usually immediate.
- Conversion comparisons are observational. User, project, Post age, trust,
  rank, and repo match are entangled; ratios in this report prioritize
  experiments rather than prove causal effects.
- Live prompt text and colleague names were reviewed only in the private
  snapshot. They are intentionally omitted from this repository artifact.
