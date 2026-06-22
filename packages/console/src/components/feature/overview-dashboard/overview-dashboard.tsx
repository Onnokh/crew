import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, FileText, Users } from "lucide-react";
import { useMemo } from "react";
import { apiFetch } from "../../../api/client";
import crewProfile from "../../../assets/crew-profile.png";
import { useSession } from "../../../auth/client";
import {
  telemetryKeys,
  type ActivityItem,
  type ConversionPanelData,
  type CoveragePanelData,
  type PostsCreatedPanelData,
  type UserUsageItem,
} from "../../telemetry/telemetry-data";
import { ActivityFeed } from "../../activity-feed/activity-feed";
import { StatCardGrid, type StatDatum } from "../../ui/stat-card/stat-card";
import { HallOfLegends } from "../../hall-of-legends/hall-of-legends";
import shared from "../../../styles/dashboard.module.scss";
import styles from "./overview-dashboard.module.scss";

const DAY = 24 * 60 * 60 * 1000;

/**
 * The control-plane home (`/dashboard`): a homepage-style greeting summarising
 * the last 7 days, a Confirmed/Users/Posts stat row, and two columns — recent
 * events and the busiest users. Built from the same primitives as the Performance
 * dashboard ({@link StatCardGrid}, {@link ActivityFeed}). The user count comes
 * from the admin control-plane list; everything else from the telemetry API.
 */
export function OverviewDashboard({ usersCount }: { usersCount: number }) {
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
  const { data: conversionAll } = useQuery({
    queryKey: [...telemetryKeys.conversion, "all"],
    queryFn: () =>
      apiFetch<ConversionPanelData>(`/api/telemetry/conversion?from=0&to=${now}`),
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
      key: "confirmed",
      label: "Confirmed",
      icon: CheckCircle2,
      tone: shared.toneBlue,
      value: conversionAll ? String(conversionAll.converted) : "...",
      valueSuffix: conversionAll ? ` / ${conversionAll.withResults}` : undefined,
    },
    {
      key: "users",
      label: "Users",
      icon: Users,
      tone: shared.toneGreen,
      value: String(usersCount),
    },
    {
      key: "posts",
      label: "Posts",
      icon: FileText,
      tone: shared.tonePink,
      value: postsAll ? String(postsAll.total) : "...",
    },
  ];

  return (
    <section className={shared.usagePage}>
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

      <section className={shared.usageSection}>
        <StatCardGrid stats={stats} />
      </section>

      <div className={styles.overviewColumns}>
        <section className={shared.usageSection}>
          <h2>Activity</h2>
          <ActivityFeed
            events={events}
            users={topUsers ?? []}
            loading={activityLoading}
          />
        </section>
        <section className={shared.usageSection}>
          <h2>Hall of Legends</h2>
          <HallOfLegends users={topUsers ?? []} loading={usersLoading} />
        </section>
      </div>
    </section>
  );
}

/** A count for the greeting: the number, or an ellipsis while it loads. */
function num(value: number | undefined): string {
  return value === undefined ? "…" : String(value);
}
