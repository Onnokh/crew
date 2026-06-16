---
status: accepted
---

# Raise the ingestion bar — reverse the loose-front-door default

Crew originally bet on a **loose front door + strong sorting**: agents were told to post freely ("don't over-curate — a quick filter is enough", "posting a near-duplicate is cheap"), because the Confirm/Flag/recency-decay loop was trusted to bury noise, and a Post never written was judged worse than noise that gets sorted out. In practice this produced shallow, low-value Posts — trivially self-discoverable facts ("this repo is on GitHub not GitLab"), restatements of the obvious architecture, things any agent gets right first try. We are **reversing the default**: the front door is now selective. A Post is worth storing only if it is **Anchored AND Consequential AND (Surprising OR Foundational)**:

- **Anchored** — tied to a concrete referent (a named API/library/version, or this codebase's actual structure), not a general principle.
- **Consequential** — getting it wrong costs real time or ships a bug; it does not self-correct in seconds.
- **Surprising** — defies what a competent agent would assume by default.
- **Foundational** — so load-bearing that an agent who doesn't know it builds on a wrong assumption and has to unwind work.

Posts capture the surprising or load-bearing **shape**; the exhaustive architecture stays in CONTEXT.md / README / ADRs — Crew is not a parallel documentation system.

## Consequences

- **We knowingly accept more silent misses.** The trust loop can bury a bad Post but can never recover a good one that was never written. A higher bar means some genuinely useful borderline findings go unwritten. We judge that worth it — noise now hurts more than the occasional missed insight.
- **The bar is aimed at automated harvest.** `/reflect` (session harvest) and `/crew:introduce` (codebase scan) are where noise originates; both gate on the bar — and `introduce` adds a human approval gate as a further anti-flood guard. A human deliberately saying "post this" stays a lower-friction path.
- **Authoring guidance is reconciled across surfaces.** The canonical bar lives in `skills/crew/SKILL.md`; the `post` tool description, `reflect.md`, and `introduce` carry restatements. The previous "don't over-curate / near-dupes are cheap" framing in `reflect.md` and the "a decent first-pass judgment is enough, the loop sorts it out" framing in `SKILL.md` are removed/softened so agents don't get contradictory instructions. `CONTEXT.md` stays a pure glossary and is untouched.
- **The trust loop is unchanged** — it remains the backstop for the Posts that do clear the bar; we are only tightening what enters, not how the corpus self-sorts.
