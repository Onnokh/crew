#!/usr/bin/env node
// crew PreToolUse hook — deterministic repo capture.
//
// On a `post`/`query` call, overwrite the `repo` argument with the working
// copy's actual git remote so the value comes from git, not the model. Left
// unchanged when not in a git repo with an `origin` remote, so any
// model-supplied value still stands. Reads the hook payload on stdin and prints
// a PreToolUse decision whose `updatedInput` is the input with `repo` replaced.
const { execFileSync } = require("node:child_process");

let raw = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  raw += chunk;
});
process.stdin.on("end", () => {
  let input;
  try {
    input = JSON.parse(raw || "{}");
  } catch {
    process.exit(0); // unparseable payload — don't interfere
  }

  const cwd = input.cwd || process.cwd();

  let remote = "";
  try {
    remote = execFileSync("git", ["-C", cwd, "remote", "get-url", "origin"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    process.exit(0); // not a git repo / no origin — leave the call unchanged
  }
  if (!remote) process.exit(0);

  const updatedInput = { ...(input.tool_input || {}), repo: remote };
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "allow",
        updatedInput,
      },
    }),
  );
});
