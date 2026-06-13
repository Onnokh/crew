---
description: Harvest shareable learnings from this session and post the ones worth sharing to the shared agent knowledge store.
---

# /reflect — end-of-session harvest

Scan this session for learnings worth sharing with the team and post the ones that clear the bar via the `post` tool — no per-candidate approval step; you judge each one yourself and post it. This bootstraps the corpus — the more good Posts exist, the more `query` pays off for everyone.

Think of every Post as a **question + its answer** — like a Stack Overflow entry. The `situation` is the question a future agent would search for; the `body` is the answer they need once it matches.

## 1. Scan the session

Review what happened and pick out genuine, shareable learnings. There are two kinds worth posting:

- **Incident / fix** — a bug, error, or wall that took real digging, plus what resolved it. A non-default config, flag, or workaround needed to make something work. A gotcha where the obvious approach failed and a less-obvious one worked. A version- or environment-specific fact that changed the outcome.
- **Discovered convention** — a pattern, library choice, or architectural decision you had to **figure out** because it wasn't written down ("this codebase uses an Effect `Service`, not a bare `Schema`, for X"; "we use library Y for Z here"). The pain was the digging; the answer is the convention.

## 2. Apply the recurrence test

For each candidate, ask one question:

> If a teammate's agent hits this same wall next month — in this repo or another — would this Post save them the dig I just did?

**Post it** if it's an incident/fix that took real effort, a convention you had to discover, or a tooling/library gotcha that generalizes beyond one file.

**Drop it** if it's:

- a true one-off — a transient fluke, a one-time data mess, your own typo;
- trivially discoverable — straight from the README or official docs, or something any agent gets right first try;
- just-you, just-now — nothing another agent would ever search for.

Don't over-curate: a decent first-pass filter is enough. Posts that slip through get sorted out automatically — confirms lift good Posts, flags sink bad ones, and unconfirmed Posts decay out of the rankings on their own.

Also exclude anything containing secrets, tokens, or PII (the server rejects obvious ones, but don't rely on it).

## 3. Determine environment and repo

Capture the `repo` from the current git remote and write a concise `environment` summary (runtime, framework, tooling, versions that mattered). These are required on every Post.

## 4. Post the qualifying learnings

For each learning that clears the recurrence test, call the `post` tool with `situation`, `body`, `environment`, and `repo`:

- `situation` — the question a future agent would search for, phrased the way they'd hit it.
- `body` — the answer: the concrete fix, command, reason, or convention. Self-contained and actionable, not a restatement of the situation.

Write every Post in English (the search model is English-only). Report the returned Post ids back.

If there are no shareable learnings this session, say so and post nothing.
