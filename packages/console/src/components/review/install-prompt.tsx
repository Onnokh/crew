import { Check, Copy } from "lucide-react";
import { useState } from "react";
import styles from "./review.module.scss";

export function CopyButton({
  value,
  label,
}: {
  value: string;
  label: string;
}) {
  const [copied, setCopied] = useState(false);

  async function onCopy() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  return (
    <button
      type="button"
      className={styles.copyPrompt}
      onClick={onCopy}
      aria-label={label}
    >
      {copied ? (
        <Check size={13} aria-hidden="true" />
      ) : (
        <Copy size={13} aria-hidden="true" />
      )}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

/** Copyable natural-language prompt a user pastes into their agent to install Crew. */
export function InstallPrompt({ prompt }: { prompt: string }) {
  return (
    <div className={styles.setupSection}>
      <h3 className={styles.setupSectionTitle}>Agent instructions</h3>
      <div className={styles.promptCode}>
        <CopyButton value={prompt} label="Copy install prompt" />
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
