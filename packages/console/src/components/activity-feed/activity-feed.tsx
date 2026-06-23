import * as HoverCard from "@radix-ui/react-hover-card";
import {
  Activity,
  CheckCircle2,
  FileText,
  Flag,
  Search,
  SearchX,
  type LucideIcon,
} from "lucide-react";
import type { ActivityItem, UserUsageItem } from "../telemetry/telemetry-data";
import { EmptyState } from "../ui/empty-state/empty-state";
import { UserAvatar } from "../ui/user-avatar/user-avatar";
import { relativeTime } from "../../lib/format";
import shared from "../../styles/dashboard.module.scss";
import styles from "./activity-feed.module.scss";

/** Stable empty default so a missing `users` prop doesn't make a new array each render. */
const NO_USERS: UserUsageItem[] = [];

/** The Events list: a time-sorted feed of searches, posts, confirms, and flags. */
export function ActivityFeed({
  events,
  users = NO_USERS,
  loading,
  empty = "No events yet.",
}: {
  events: ActivityItem[];
  /** Usage rows used to enrich the per-user hover card (matched by name). */
  users?: UserUsageItem[];
  loading?: boolean;
  empty?: string;
}) {
  if (loading) return <p className={shared.emptyRow}>Loading...</p>;
  if (events.length === 0) return <EmptyState icon={Activity} message={empty} />;
  const usageByName = new Map(
    users.flatMap((u) => (u.name ? ([[u.name, u]] as const) : [])),
  );
  return (
    <ul className={styles.usageEvents}>
      {events.map((event) => (
        <ActivityEvent
          key={event.id}
          event={event}
          usage={event.user ? usageByName.get(event.user) : undefined}
        />
      ))}
    </ul>
  );
}

function ActivityEvent({
  event,
  usage,
}: {
  event: ActivityItem;
  usage?: UserUsageItem;
}) {
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
            <UserMention name={event.user} usage={usage} /> {action} {event.subject}
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

/** A user's name that reveals a small profile card (avatar, name, posts) on hover. */
function UserMention({ name, usage }: { name: string; usage?: UserUsageItem }) {
  return (
    <HoverCard.Root openDelay={150} closeDelay={100}>
      <HoverCard.Trigger asChild>
        <span className={styles.eventVerb} tabIndex={0}>
          {name}
        </span>
      </HoverCard.Trigger>
      <HoverCard.Portal>
        <HoverCard.Content className={styles.userCard} sideOffset={6} align="start">
          <UserAvatar
            seed={usage?.userId ?? name}
            name={name}
            className={styles.userCardAvatar}
          />
          <span className={styles.userCardText}>
            <span className={styles.userCardName}>{name}</span>
            {usage?.team && <span className={styles.userCardTeam}>{usage.team}</span>}
            <span className={styles.userCardMeta}>
              {usage
                ? `${usage.posts} ${usage.posts === 1 ? "post" : "posts"}`
                : "No posts yet"}
            </span>
          </span>
          <HoverCard.Arrow className={styles.userCardArrow} />
        </HoverCard.Content>
      </HoverCard.Portal>
    </HoverCard.Root>
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
