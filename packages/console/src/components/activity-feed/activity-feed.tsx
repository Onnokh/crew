import {
  CheckCircle2,
  FileText,
  Flag,
  Search,
  SearchX,
  type LucideIcon,
} from "lucide-react";
import type { ActivityItem } from "../telemetry/telemetry-data";
import { relativeTime } from "../../lib/format";
import shared from "../../styles/dashboard.module.scss";
import styles from "./activity-feed.module.scss";

/** The Events list: a time-sorted feed of searches, posts, confirms, and flags. */
export function ActivityFeed({
  events,
  loading,
  empty = "No events yet.",
}: {
  events: ActivityItem[];
  loading?: boolean;
  empty?: string;
}) {
  if (loading) return <p className={shared.emptyRow}>Loading...</p>;
  if (events.length === 0) return <p className={shared.emptyRow}>{empty}</p>;
  return (
    <ul className={styles.usageEvents}>
      {events.map((event) => (
        <ActivityEvent key={event.id} event={event} />
      ))}
    </ul>
  );
}

function ActivityEvent({ event }: { event: ActivityItem }) {
  const { action, icon: Icon, tone } = eventStyle(event);
  const count =
    event.kind === "search" && event.resultCount !== null && event.resultCount > 0;

  return (
    <li className={styles.usageEvent}>
      <span className={`${styles.eventIcon} ${tone ?? ""}`}>
        <Icon size={15} aria-hidden="true" />
      </span>
      <span className={styles.eventText}>
        {event.user ? (
          <>
            <span className={styles.eventVerb}>{event.user}</span> {action} {event.subject}
          </>
        ) : (
          <>
            <span className={styles.eventVerb}>{capitalize(action)}</span> {event.subject}
          </>
        )}
        {count && (
          <span className={styles.eventCount}>
            {" "}
            ({event.resultCount} {event.resultCount === 1 ? "result" : "results"})
          </span>
        )}
        {event.team && <span className={styles.eventTeam}>{event.team}</span>}
      </span>
      <time className={styles.eventMeta}>{relativeTime(event.createdAt)}</time>
    </li>
  );
}

/** The verb phrase, icon, and tinted-icon tone for one activity item. */
function eventStyle(event: ActivityItem): {
  action: string;
  icon: LucideIcon;
  tone: string | undefined;
} {
  switch (event.kind) {
    case "post":
      return { action: "posted", icon: FileText, tone: shared.tonePink };
    case "confirm":
      return { action: "confirmed", icon: CheckCircle2, tone: shared.toneGreen };
    case "flag":
      return {
        action: event.reason ? `flagged (${event.reason})` : "flagged",
        icon: Flag,
        tone: shared.toneOrange,
      };
    default:
      return event.resultCount === 0
        ? { action: "got no results for", icon: SearchX, tone: shared.toneRed }
        : { action: "searched for", icon: Search, tone: shared.toneBlue };
  }
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
