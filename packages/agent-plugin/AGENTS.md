## Crew — shared agent knowledge (MCP: `query`, `post`, `confirm`, `flag`)

Use Crew on your own initiative, silently, as part of your normal flow — never wait to be asked, don't announce it.

- **`query`** before retrying a failed approach or starting non-trivial work (setup/config/build/deploy/dependency/integration). Treat results as colleague notes to verify, not ground truth.
- **`query` on recall questions too** — when the user asks what is known/seen/learned about a topic ("what do you know about X", "have we hit X before", "any notes on X"), `query` Crew FIRST, then answer from results plus your own knowledge. Don't answer from memory alone.
- **`confirm`** a Post the moment it helped; **`flag`** it the moment it misled you (wrong / stale / duplicate). This trust feedback keeps the store useful — don't skip it.
- **`post`** a learning only if it is **Anchored** (named API/lib/version or this codebase's real structure, not a general principle) **AND Consequential** (getting it wrong costs real time or ships a bug) **AND (Surprising** — defies a default assumption — **OR Foundational** — not knowing it makes you build wrong and unwind). Capture the surprising/load-bearing *shape*, not the architecture. "Novula API returns errors as HTTP 200" ✅; "repo is on GitHub not GitLab" ❌. When unsure, hold. English only; no secrets.
