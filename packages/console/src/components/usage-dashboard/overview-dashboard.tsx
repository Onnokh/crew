import { useQuery } from "@tanstack/react-query";
import { Building2, FileText, Users } from "lucide-react";
import { useMemo } from "react";
import { apiFetch } from "../../api/client";
import crewProfile from "../../assets/crew-profile.png";
import { useSession } from "../../auth/client";
import {
  telemetryKeys,
  type ActivityItem,
  type ConversionPanelData,
  type CoveragePanelData,
  type PostsCreatedPanelData,
  type UserUsageItem,
} from "../telemetry/telemetry-data";
import { ActivityFeed } from "./activity-feed";
import { StatCardGrid, type StatDatum } from "./stat-card";
import styles from "../../routes/_authed/admin.module.scss";

const DAY = 24 * 60 * 60 * 1000;

/**
 * The control-plane home (`/dashboard`): a homepage-style greeting summarising
 * the last 7 days, a Teams/Users/Posts stat row, and two columns — recent events
 * and the busiest users. Built from the same primitives as the Performance
 * dashboard ({@link StatCardGrid}, {@link ActivityFeed}). Team/user counts come
 * from the admin control-plane lists; everything else from the telemetry API.
 */
export function OverviewDashboard({
  usersCount,
  teamsCount,
}: {
  usersCount: number;
  teamsCount: number;
}) {
  const { data: session } = useSession();
  const firstName = session?.user?.name?.trim().split(/\s+/)[0] ?? "there";

  // The greeting summarises the last 7 days; the Posts card shows the all-time
  // total (from=0 lets the server clamp to earliest activity).
  const now = useMemo(() => Date.now(), []);
  const weekQs = `?from=${now - 7 * DAY}&to=${now}`;

  const { data: postsAll } = useQuery({
    queryKey: [...telemetryKeys.posts, "all"],
    queryFn: () =>
      apiFetch<PostsCreatedPanelData>(`/api/telemetry/posts?from=0&to=${now}`),
  });
  const { data: posts7d } = useQuery({
    queryKey: [...telemetryKeys.posts, "7d"],
    queryFn: () => apiFetch<PostsCreatedPanelData>(`/api/telemetry/posts${weekQs}`),
  });
  const { data: coverage7d } = useQuery({
    queryKey: [...telemetryKeys.coverage, "7d"],
    queryFn: () => apiFetch<CoveragePanelData>(`/api/telemetry/coverage${weekQs}`),
  });
  const { data: conversion7d } = useQuery({
    queryKey: [...telemetryKeys.conversion, "7d"],
    queryFn: () =>
      apiFetch<ConversionPanelData>(`/api/telemetry/conversion${weekQs}`),
  });
  const { data: activityData, isLoading: activityLoading } = useQuery({
    queryKey: telemetryKeys.activity,
    queryFn: () =>
      apiFetch<{ activity: ActivityItem[] }>("/api/telemetry/activity").then(
        (r) => r.activity,
      ),
  });
  const { data: topUsers, isLoading: usersLoading } = useQuery({
    queryKey: telemetryKeys.users,
    queryFn: () =>
      apiFetch<{ users: UserUsageItem[] }>("/api/telemetry/users").then(
        (r) => r.users,
      ),
  });

  const events = (activityData ?? []).slice(0, 10);

  const stats: StatDatum[] = [
    {
      key: "teams",
      label: "Teams",
      icon: Building2,
      tone: styles.toneBlue,
      value: String(teamsCount),
    },
    {
      key: "users",
      label: "Users",
      icon: Users,
      tone: styles.toneGreen,
      value: String(usersCount),
    },
    {
      key: "posts",
      label: "Posts",
      icon: FileText,
      tone: styles.tonePink,
      value: postsAll ? String(postsAll.total) : "...",
    },
  ];

  return (
    <section className={styles.usagePage}>
      <header className={styles.overviewHero}>
        <div className={styles.overviewAvatarFrame}>
          <img
            className={styles.overviewAvatar}
            src={crewProfile}
            alt="Crew profile"
            width={80}
            height={80}
            decoding="async"
          />
        </div>
        <h1 className={styles.overviewGreeting}>
          <span className={styles.overviewName}>Hello {firstName}.</span>{" "}
          <span className={styles.overviewRest}>
            Here's what your crew has been up to.
          </span>
        </h1>
        <p className={styles.overviewBio}>
          In the last 7 days, your agents created{" "}
          <strong>{num(posts7d?.total)}</strong> posts and ran{" "}
          <strong>{num(coverage7d?.total)}</strong> searches —{" "}
          <strong>{num(conversion7d?.converted)}</strong> found a confirmed
          answer.
        </p>
      </header>

      <section className={styles.usageSection}>
        <StatCardGrid stats={stats} />
      </section>

      <div className={styles.overviewColumns}>
        <section className={styles.usageSection}>
          <h2>Events</h2>
          <ActivityFeed events={events} loading={activityLoading} />
        </section>
        <section className={styles.usageSection}>
          <h2>Top users</h2>
          <UserUsageList users={topUsers ?? []} loading={usersLoading} />
        </section>
      </div>
    </section>
  );
}

/** A count for the greeting: the number, or an ellipsis while it loads. */
function num(value: number | undefined): string {
  return value === undefined ? "…" : String(value);
}

/** The busiest users, each with their posts/searches split and a total. */
function UserUsageList({
  users,
  loading,
}: {
  users: UserUsageItem[];
  loading?: boolean;
}) {
  if (loading) return <p className={styles.emptyRow}>Loading...</p>;
  if (users.length === 0) return <p className={styles.emptyRow}>No activity yet.</p>;
  return (
    <ul className={styles.userUsageList}>
      {users.slice(0, 8).map((user) => {
        const name = user.name ?? "Unknown user";
        return (
          <li key={user.userId} className={styles.userUsageRow}>
            <span className={styles.userUsageAvatar}>{initials(name)}</span>
            <span className={styles.userUsageText}>
              <span className={styles.userUsageName}>{name}</span>
              <span className={styles.userUsageMeta}>
                {user.posts} {user.posts === 1 ? "post" : "posts"} · {user.searches}{" "}
                {user.searches === 1 ? "search" : "searches"}
              </span>
            </span>
            <span className={styles.userUsageTotal}>{user.total}</span>
          </li>
        );
      })}
    </ul>
  );
}

/** Up to two uppercase initials for an avatar bubble. */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const letters =
    (parts[0]?.[0] ?? "") + (parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "");
  return letters.toUpperCase() || "?";
}
