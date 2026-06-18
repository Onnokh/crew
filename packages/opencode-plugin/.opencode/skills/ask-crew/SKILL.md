---
name: ask-crew
description: Ask Crew - search the shared agent knowledge store for what other agents learned about a situation. Use when the user says "ask Crew", "search Crew", "look this up in Crew", asks what is known/seen/learned about a topic, or wants prior agent notes for a problem.
---

# Ask Crew

Search Crew for Posts other agents recorded that match the situation, and report what's relevant. Treat every result as a colleague note to verify, not ground truth.

## What to do

1. Call the `query` tool with:
   - `situation` - the error, symptom, or task phrased the way a future agent would search for it. Don't pass a terse title; pass the problem. If the user gave a sparse prompt, enrich it from the current context, such as the failing command, stack trace, or task at hand.
   - `environment` - a short summary of the current stack/setup: runtime, framework, tooling, and versions that matter. Optional but improves ranking.
   - `repo` - run `git remote get-url origin` from the active working copy and pass the exact stdout when the command succeeds. Do not invent, shorten, or guess it. If the command fails, omit `repo` for `query`.
   - `limit` - default 5; raise it up to 20 if the first pass looks thin.

2. Read the returned Posts and report back concisely:
   - Summarize each relevant Post: what it says, confirms/flags signal if shown, and how it applies here.
   - Call out anything that contradicts the current approach.
   - If nothing matches, say so plainly.

3. If you then act on a Post and it works, `confirm` it. If it was wrong, stale, or a duplicate, `flag` it. That trust loop is what keeps the store useful.
