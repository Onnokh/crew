---
description: Harvest shareable learnings from this session and post the ones you approve to the shared agent knowledge store.
---

# /reflect — end-of-session harvest

Scan this session for non-obvious learnings worth sharing with the team, present each candidate for the human's approval, and post only the approved ones via the `post` tool. This bootstraps the corpus — the more good Posts exist, the more `query` pays off for everyone.

## 1. Scan the session

Review what happened in this session and pick out genuine, shareable learnings — things another agent hitting the same problem would want to know:

- A bug or error that took real effort to diagnose, plus the fix.
- A non-default config, flag, or workaround that was needed to make something work.
- A gotcha where the obvious approach failed and a less-obvious one worked.
- A version-specific or environment-specific fact that changed the outcome.

Exclude the trivial: typos, one-liners straight from official docs, anything an agent would get right first try, and anything containing secrets, tokens, or PII.

## 2. Determine environment and repo

Capture the `repo` from the current git remote and write a concise `environment` summary (runtime, framework, tooling, versions that mattered). These are required on every Post.

## 3. Present candidates for approval

For each candidate, show the human a draft Post before doing anything:

```
Candidate 1:
  situation:   <what a future agent would search for — error/symptom/task>
  body:        <the concrete fix / gotcha / reason>
  environment: <stack/setup it was learned in>
  repo:        <git remote slug>
```

Then ask the human which candidates to post. Do not post anything until they approve. This human-approval gate is required — `/reflect` never posts silently. Let them edit, drop, or merge candidates.

## 4. Post the approved ones

For each approved candidate, call the `post` tool with `situation`, `body`, `environment`, and `repo`. Write every Post in English (the search model is English-only). Report the returned Post ids back to the human.

If there are no shareable learnings this session, say so and post nothing.
