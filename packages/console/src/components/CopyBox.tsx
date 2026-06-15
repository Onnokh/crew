import { useState } from "react";
import styles from "./CopyBox.module.scss";

/**
 * A show-once secret box (generated password, freshly minted api key). The
 * secret is handed in as a prop and rendered in a monospace field with a
 * copy-to-clipboard button — it is NEVER refetchable, so this is the one and
 * only chance to capture it (see issue 0012). The component holds no network
 * state; the page that mints the secret owns dismissing it.
 */
export function CopyBox({ label, secret }: { label: string; secret: string }) {
  const [copied, setCopied] = useState(false);

  async function onCopy() {
    await navigator.clipboard.writeText(secret);
    setCopied(true);
    // A brief "Copied" acknowledgement, then back to the default affordance.
    window.setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className={styles.box} role="group" aria-label={label}>
      <span className={styles.label}>{label} — shown once, copy it now</span>
      <div className={styles.row}>
        <code className={styles.secret}>{secret}</code>
        <button type="button" className={styles.copy} onClick={onCopy}>
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}
