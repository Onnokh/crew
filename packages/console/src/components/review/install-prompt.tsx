import { Check, Copy } from "lucide-react";
import { useState } from "react";
import styles from "./review.module.scss";

/** Copyable natural-language prompt a user pastes into their agent to install Crew. */
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
