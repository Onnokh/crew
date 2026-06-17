import { Check, Copy } from "lucide-react";
import { useState } from "react";
import styles from "./review.module.scss";

/**
 * A copyable "install prompt": the natural-language instruction a user pastes
 * into their own agent so it sets Crew up itself — registers the MCP server at
 * user/global scope and appends the priming block to its harness's global
 * instructions file. The prompt text is built per-agent on the page; this just
 * renders it with a copy-to-clipboard affordance.
 */
export function InstallPrompt({ prompt }: { prompt: string }) {
  const [copied, setCopied] = useState(false);
  async function onCopy() {
    await navigator.clipboard.writeText(prompt);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }
  return (
    <div className={styles.prompt}>
      <span className={styles.setupNote}>
        Or paste this prompt into the agent and let it install Crew itself:
      </span>
      <div className={styles.promptCode}>
        <button
          type="button"
          className={styles.copyPrompt}
          onClick={onCopy}
          aria-label="Copy install prompt"
        >
          {copied ? (
            <Check size={13} aria-hidden="true" />
          ) : (
            <Copy size={13} aria-hidden="true" />
          )}
          {copied ? "Copied" : "Copy"}
        </button>
        <pre className={styles.setupCode}>
          <code>{prompt}</code>
        </pre>
      </div>
    </div>
  );
}
