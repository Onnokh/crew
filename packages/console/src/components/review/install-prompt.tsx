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
    <div className={styles.setupSection}>
      <h3 className={styles.setupSectionTitle}>Agent instructions</h3>
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
        <textarea
          className={styles.promptText}
          readOnly
          spellCheck={false}
          value={prompt}
          aria-label="Agent instructions"
        />
      </div>
    </div>
  );
}
