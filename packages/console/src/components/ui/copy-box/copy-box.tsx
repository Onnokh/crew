import { useState } from "react";
import styles from "./copy-box.module.scss";

/** A show-once secret box: renders a never-refetchable secret with a copy-to-clipboard button. */
export function CopyBox({ label, secret }: { label: string; secret: string }) {
  const [copied, setCopied] = useState(false);

  async function onCopy() {
    await navigator.clipboard.writeText(secret);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div
      className={styles.box}
      role="group"
      aria-label={`${label} — shown once, copy it now`}
    >
      <span className={styles.label}>{label}</span>
      <div className={styles.row}>
        <code className={styles.secret}>{secret}</code>
        <button type="button" className={styles.copy} onClick={onCopy}>
          {copied ? "Copied" : "Copy once"}
        </button>
      </div>
    </div>
  );
}
