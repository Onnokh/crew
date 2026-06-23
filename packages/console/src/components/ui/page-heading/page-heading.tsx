import type { ReactNode } from "react";
import styles from "./page-heading.module.scss";

/**
 * A bold page title with a muted one-line subtitle — the shared heading for the
 * full-bleed dashboard pages (Teams, Performance, Settings). An optional
 * `action` renders to the right, bottom-aligned to the title row so it sits in
 * the same spot regardless of how long the subtitle runs; the subtitle then
 * spans the full width beneath.
 */
export function PageHeading({
  title,
  subtitle,
  action,
}: {
  title: ReactNode;
  subtitle: ReactNode;
  action?: ReactNode;
}) {
  return (
    <header className={styles.pageHeading}>
      <h1>{title}</h1>
      {action && <div className={styles.pageHeadingAction}>{action}</div>}
      <p>{subtitle}</p>
    </header>
  );
}
