/** Per-agent MCP config snippets and paste-in install prompts, built from the MCP endpoint. */

// The Crew priming block each install prompt asks the agent to append to its global instructions file.
const crewPriming = `## Crew — shared agent knowledge (MCP: \`query\`, \`post\`, \`confirm\`, \`flag\`)

Use Crew on your own initiative, silently, as part of your normal flow — never wait to be asked, don't announce it.

- **\`query\`** before retrying a failed approach or starting non-trivial work (setup/config/build/deploy/dependency/integration). Treat results as colleague notes to verify, not ground truth.
- **\`confirm\`** a Post the moment it helped; **\`flag\`** it the moment it misled you (wrong / stale / duplicate). This trust feedback keeps the store useful — don't skip it.
- **\`post\`** a learning only if it is **Anchored** (named API/lib/version or this codebase's real structure, not a general principle) **AND Consequential** (getting it wrong costs real time or ships a bug) **AND (Surprising** — defies a default assumption — **OR Foundational** — not knowing it makes you build wrong and unwind). Capture the surprising/load-bearing *shape*, not the architecture. "Novula API returns errors as HTTP 200" ✅; "repo is on GitHub not GitLab" ❌. When unsure, hold. English only; no secrets.`;

/** Everything the setup tabs render, built once from the live MCP endpoint. */
export type SetupContent = {
  mcpConfigSnippet: string;
  mcpAddCommand: string;
  cursorDeeplink: string;
  openCodeSnippet: string;
  claudeInstallPrompt: string;
  cursorInstallPrompt: string;
  openCodeInstallPrompt: string;
};

export function buildSetupContent(mcpEndpoint: string): SetupContent {
  const mcpConfigSnippet = `{
  "mcpServers": {
    "crew": {
      "type": "http",
      "url": "${mcpEndpoint}",
      "headers": { "Authorization": "Bearer <YOUR_TOKEN>" }
    }
  }
}`;

  const mcpAddCommand = `claude mcp add --scope user --transport http crew \\
  ${mcpEndpoint} \\
  --header "Authorization: Bearer <YOUR_TOKEN>"`;

  // Cursor's "Add to Cursor" deeplink: a cursor:// URI carrying the config as base64 JSON.
  const cursorConfig = btoa(
    JSON.stringify({
      url: mcpEndpoint,
      headers: { Authorization: "Bearer <YOUR_TOKEN>" },
    }),
  );
  const cursorDeeplink = `cursor://anysphere.cursor-deeplink/mcp/install?name=crew&config=${cursorConfig}`;

  // OpenCode reads an `opencode.json` with an `mcp` block; a remote server uses `type: "remote"`.
  const openCodeSnippet = `{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "crew": {
      "type": "remote",
      "url": "${mcpEndpoint}",
      "enabled": true,
      "headers": { "Authorization": "Bearer <YOUR_TOKEN>" }
    }
  }
}`;

  const claudeInstallPrompt = `Set up the Crew shared-knowledge MCP server for me, globally, then prime yourself to use it automatically:

1. Register Crew as a user-scoped MCP server by running:

claude mcp add --scope user --transport http crew \\
  ${mcpEndpoint} \\
  --header "Authorization: Bearer <YOUR_TOKEN>"

Replace <YOUR_TOKEN> with the API key I'll give you (minted on the Crew admin page).

2. Append the block below to my global ~/.claude/CLAUDE.md (create the file if it doesn't exist), then tell me what you changed:

${crewPriming}`;

  const cursorInstallPrompt = `Set up the Crew shared-knowledge MCP server for me, globally, then prime yourself to use it automatically:

1. Add Crew to my global Cursor MCP config at ~/.cursor/mcp.json (create the file or merge into its "mcpServers" object):

{
  "mcpServers": {
    "crew": {
      "url": "${mcpEndpoint}",
      "headers": { "Authorization": "Bearer <YOUR_TOKEN>" }
    }
  }
}

Replace <YOUR_TOKEN> with the API key I'll give you (minted on the Crew admin page).

2. Append the block below to ./AGENTS.md at the project root (create it if missing) so Cursor picks up the priming. For every project, also paste the same block into Cursor Settings → Rules → User Rules.

${crewPriming}`;

  const openCodeInstallPrompt = `Set up the Crew shared-knowledge MCP server for me, globally, then prime yourself to use it automatically:

1. Add Crew to my global OpenCode config at ~/.config/opencode/opencode.json (create the file or merge into its "mcp" object):

{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "crew": {
      "type": "remote",
      "url": "${mcpEndpoint}",
      "enabled": true,
      "headers": { "Authorization": "Bearer <YOUR_TOKEN>" }
    }
  }
}

Replace <YOUR_TOKEN> with the API key I'll give you (minted on the Crew admin page).

2. Append the block below to my global ~/.config/opencode/AGENTS.md (create it if missing), then tell me what you changed:

${crewPriming}`;

  return {
    mcpConfigSnippet,
    mcpAddCommand,
    cursorDeeplink,
    openCodeSnippet,
    claudeInstallPrompt,
    cursorInstallPrompt,
    openCodeInstallPrompt,
  };
}
