import { Plus, Trash2 } from "lucide-react";
import { CopyBox } from "../ui/copy-box/copy-box";
import styles from "./account.module.scss";

/** Safe api-key metadata as the listings return it (never the secret). */
export type ApiKey = {
  id: string;
  name: string | null;
  start: string | null;
  enabled: boolean;
  createdAt: string | null;
  lastRequest: string | null;
};

/**
 * The API-keys block shared by the self-service profile page and the admin user
 * page: lists a User's keys with per-row revoke, a "New key" mint button, and a
 * show-once box for a freshly minted secret. Whose keys these are (the caller's
 * own, or another User's via the admin surface) is the caller's concern — this
 * component only renders what it's handed.
 */
export function ApiKeysSection({
  keys,
  onMint,
  minting,
  onRevoke,
  revoking,
  mintedKey,
}: {
  keys: ApiKey[];
  onMint: () => void;
  minting: boolean;
  onRevoke: (key: ApiKey) => void;
  revoking: boolean;
  /** Show-once secret for a key just minted, else null. */
  mintedKey: string | null;
}) {
  return (
    <section>
      <div className={styles.keysHeader}>
        <p className={styles.keysLabel}>API keys</p>
        <button
          type="button"
          className={styles.newKeyBtn}
          onClick={onMint}
          disabled={minting}
        >
          <Plus size={16} aria-hidden="true" />
          New key
        </button>
      </div>
      {keys.length === 0 ? (
        <p className={styles.keysEmpty}>No API keys yet.</p>
      ) : (
        <ul className={styles.keyList}>
          {keys.map((key) => (
            <li key={key.id} className={styles.keyRow}>
              <span className={styles.keyName}>{key.name ?? "key"}</span>
              <span className={styles.keyUsage}>{lastUsed(key.lastRequest)}</span>
              <button
                type="button"
                className={styles.keyDelete}
                onClick={() => onRevoke(key)}
                disabled={revoking}
                aria-label="Delete key"
              >
                <Trash2 size={16} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {mintedKey && (
        <div className={styles.secretSlot}>
          <CopyBox label="API key" secret={mintedKey} />
        </div>
      )}
    </section>
  );
}

/** A short relative "last used" phrase for a key's `lastRequest`. */
function lastUsed(iso: string | null): string {
  if (!iso) return "never used";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "never used";
  const secs = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (secs < 60) return "used just now";
  const mins = Math.round(secs / 60);
  if (mins < 60) return `used ${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `used ${hours}h ago`;
  const days = Math.round(hours / 24);
  return `used ${days}d ago`;
}
