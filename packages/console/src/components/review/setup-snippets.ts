/** Per-agent MCP config snippets and paste-in install prompts, built from the MCP endpoint. */

// The Crew priming block each install prompt asks the agent to append to its global instructions file.
const crewPriming = `## Crew — shared agent knowledge (MCP: \`query\`, \`post\`, \`confirm\`, \`flag\`)

Use Crew silently and selectively; do not wait for a slash command or announce the lookup.

- **\`query\`** when the task needs shared or repository knowledge, explicit recall, an opaque failure or retry, a convention/API/dependency contract, or low-confidence external context. Before querying, inspect enough local evidence to distinguish a knowledge-dependent task from fully local deterministic work; abstain when local evidence is sufficient.
- Preserve the caller's situation plus optional environment and repository when querying. Normalize transport details and repository identity only; do not invent adaptive follow-up queries.
- Treat retrieved Posts as colleague notes, not ground truth. Verify them against the task before relying on them.
- **\`confirm\`** a Post the moment it helped; **\`flag\`** it the moment it was wrong, stale, or duplicate. Do not skip the trust loop.
- **\`post\`** only when the learning is **Anchored** (a named API/library/version or this codebase's real structure) **AND Consequential** (getting it wrong costs real time or ships a bug) **AND (Surprising** — defies a default assumption — **OR Foundational** — not knowing it makes an agent build wrong and unwind). Capture the load-bearing shape, never generic facts, secrets, PII, or exhaustive architecture. Write in English.`;

/** Everything the setup tabs render, built once from the live MCP endpoint. */
export type SetupContent = {
  manualManualInstructions: ManualInstruction[];
  manualInstallPrompt: string;
  claudeManualInstructions: ManualInstruction[];
  codexManualInstructions: ManualInstruction[];
  cursorManualInstructions: ManualInstruction[];
  openCodeManualInstructions: ManualInstruction[];
  claudeInstallPrompt: string;
  codexInstallPrompt: string;
  cursorInstallPrompt: string;
  openCodeInstallPrompt: string;
};

export type ManualInstruction = {
  label: string;
  code: string;
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

  const addMcpCommand = `npx add-mcp "${mcpEndpoint}" --name crew --global --agent claude-code --agent codex --agent cursor --header "Authorization: Bearer <YOUR_TOKEN>" --yes`;
  const addMcpClaudeCommand = `npx add-mcp "${mcpEndpoint}" --name crew --global --agent claude-code --header "Authorization: Bearer <YOUR_TOKEN>" --yes`;
  const addMcpCodexCommand = `npx add-mcp "${mcpEndpoint}" --name crew --global --agent codex --header "Authorization: Bearer <YOUR_TOKEN>" --yes`;
  const addMcpCursorCommand = `npx add-mcp "${mcpEndpoint}" --name crew --global --agent cursor --header "Authorization: Bearer <YOUR_TOKEN>" --yes`;

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

  const claudeManualInstructions = [
    { label: "Add the Crew plugin marketplace.", code: "claude plugin marketplace add Onnokh/crew" },
    { label: "Install the Crew plugin.", code: "claude plugin install crew@crew" },
    { label: "Register Crew as a user-scoped MCP server.", code: mcpAddCommand },
    { label: "Or add the MCP server with add-mcp.", code: addMcpClaudeCommand },
    { label: "Append this block to your global ~/.claude/CLAUDE.md (create it if missing).", code: crewPriming },
  ];

  const codexManualInstructions = [
    { label: "Add the Crew plugin marketplace.", code: "codex plugin marketplace add Onnokh/crew" },
    { label: "Install the Crew plugin.", code: "codex plugin add crew@crew" },
    { label: "Add this MCP server config.", code: mcpConfigSnippet },
    { label: "Or add the MCP server with add-mcp.", code: addMcpCodexCommand },
    { label: "Append this block to your global ~/.codex/AGENTS.md (create it if missing).", code: crewPriming },
  ];

  const cursorManualInstructions = [
    { label: "Install the Crew skills for Cursor.", code: "npx skills add Onnokh/crew --agent cursor --global --skill crew --skill ask-crew --skill reflect --skill introduce" },
    { label: "Add this Cursor MCP config.", code: `{
  "mcpServers": {
    "crew": {
      "url": "${mcpEndpoint}",
      "headers": { "Authorization": "Bearer <YOUR_TOKEN>" }
    }
  }
}` },
    { label: "Or add the MCP server with add-mcp.", code: addMcpCursorCommand },
    { label: "Paste this block into Cursor Settings → Rules → User Rules.", code: crewPriming },
  ];

  const openCodeManualInstructions = [
    { label: "Install the Crew skills for OpenCode.", code: "npx skills add Onnokh/crew --agent opencode --global --skill crew --skill ask-crew --skill reflect --skill introduce" },
    { label: "Add this OpenCode MCP config.", code: openCodeSnippet },
    { label: "Append this block to your global ~/.config/opencode/AGENTS.md (create it if missing).", code: crewPriming },
  ];

  const manualManualInstructions = [
    { label: "Install the Crew skills.", code: "npx skills add Onnokh/crew --global --skill crew --skill ask-crew --skill reflect --skill introduce" },
    { label: "Add this global MCP config.", code: mcpConfigSnippet },
    { label: "Or add Crew to Claude Code, Codex, and Cursor with add-mcp.", code: addMcpCommand },
    { label: "Append this block to your global agent instructions file (~/.claude/CLAUDE.md, ~/.codex/AGENTS.md, ~/.config/opencode/AGENTS.md, or Cursor User Rules).", code: crewPriming },
  ];

  const manualInstallPrompt = `Set up Crew manually:

1. Install the Crew skills from the Crew GitHub repository:

npx skills add Onnokh/crew --global --skill crew --skill ask-crew --skill reflect --skill introduce

2. Add Crew as a global MCP server named "crew":

${mcpConfigSnippet}

Alternatively, install it for Claude Code, Codex, and Cursor with add-mcp:

${addMcpCommand}

Replace <YOUR_TOKEN> with the API key I'll give you (minted on the Crew admin page).

3. Append the block below to my global agent instructions file, then tell me what you changed. Use the right file for the agent I use:

- Claude Code: ~/.claude/CLAUDE.md
- Codex: ~/.codex/AGENTS.md
- OpenCode: ~/.config/opencode/AGENTS.md
- Cursor: Cursor Settings -> Rules -> User Rules

${crewPriming}`;

  const claudeInstallPrompt = `Set up Crew for Claude Code globally:

1. Add the Crew plugin marketplace:

claude plugin marketplace add Onnokh/crew

2. Install the Crew plugin:

claude plugin install crew@crew

3. Register Crew as a user-scoped MCP server:

claude mcp add --scope user --transport http crew \\
  ${mcpEndpoint} \\
  --header "Authorization: Bearer <YOUR_TOKEN>"

Alternatively, register it with add-mcp:

${addMcpClaudeCommand}

Replace <YOUR_TOKEN> with the API key I'll give you (minted on the Crew admin page).

4. Append the block below to my global ~/.claude/CLAUDE.md (create the file if it doesn't exist), then tell me what you changed:

${crewPriming}`;

  const codexInstallPrompt = `Set up Crew for Codex globally:

1. Add the Crew plugin marketplace:

codex plugin marketplace add Onnokh/crew

2. Install the Crew plugin:

codex plugin add crew@crew

3. Register Crew as a global MCP server named "crew" using this endpoint and bearer token:

${mcpEndpoint}

Authorization: Bearer <YOUR_TOKEN>

Alternatively, register it with add-mcp:

${addMcpCodexCommand}

Replace <YOUR_TOKEN> with the API key I'll give you (minted on the Crew admin page).

4. Append the block below to my global ~/.codex/AGENTS.md (create the file if it doesn't exist), then tell me what you changed:

${crewPriming}`;

  const cursorInstallPrompt = `Set up the Crew shared-knowledge MCP server for me, globally, then prime yourself to use it automatically:

1. Install the Crew skills from the Crew GitHub repository:

npx skills add Onnokh/crew --agent cursor --global --skill crew --skill ask-crew --skill reflect --skill introduce

2. Add Crew to my global Cursor MCP config at ~/.cursor/mcp.json (create the file or merge into its "mcpServers" object):

{
  "mcpServers": {
    "crew": {
      "url": "${mcpEndpoint}",
      "headers": { "Authorization": "Bearer <YOUR_TOKEN>" }
    }
  }
}

Replace <YOUR_TOKEN> with the API key I'll give you (minted on the Crew admin page).

Alternatively, register it with add-mcp:

${addMcpCursorCommand}

3. Append the block below to ./AGENTS.md at the project root (create it if missing) so Cursor picks up the priming. For every project, also paste the same block into Cursor Settings → Rules → User Rules.

${crewPriming}`;

  const openCodeInstallPrompt = `Set up Crew for OpenCode globally: install the Crew skills, register the MCP server, and prime yourself to use it automatically.

1. Install the Crew skills from the Crew GitHub repository:

npx skills add Onnokh/crew --agent opencode --global --skill crew --skill ask-crew --skill reflect --skill introduce

2. Add Crew to my global OpenCode config at ~/.config/opencode/opencode.json (create the file or merge into its "mcp" object):

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

3. Append the block below to my global ~/.config/opencode/AGENTS.md (create it if missing), then tell me what you changed:

${crewPriming}`;

  return {
    manualManualInstructions,
    manualInstallPrompt,
    claudeManualInstructions,
    codexManualInstructions,
    cursorManualInstructions,
    openCodeManualInstructions,
    claudeInstallPrompt,
    codexInstallPrompt,
    cursorInstallPrompt,
    openCodeInstallPrompt,
  };
}
