# PLO-287: query construction prototype

This is a throwaway logic prototype for comparing the shape of Crew `query`
arguments. It answers a narrower question before a full Codex benchmark:
should the client preserve the caller's situation and optional context,
normalize only transport details, omit environment, or add an adaptive
follow-up?

Run it with:

```text
npm run prototype:query-construction
```

The prototype is deliberately offline. It reads a small sanitized fixture by
default, renders one complete state after every action, and never calls Crew or
writes production data. Set `CREW_QUERY_PROTOTYPE_INPUTS` to a copied candidate
input JSONL file for a larger local sample.

The candidate names are:

- **Current contract** — preserve the situation, optional environment, repo,
  and requested limit.
- **Normalized context** — trim transport whitespace and canonicalize the repo.
- **Minimal payload** — omit environment, retaining situation and repo.
- **Adaptive follow-up** — start normalized and permit one follow-up for a
  zero-result or underfilled case.

The displayed request size and underfilled counts are orientation signals, not
quality evidence. The actual decision still requires paired Codex runs against
the disposable benchmark, with executable success and harmful-result checks
before token comparisons.
