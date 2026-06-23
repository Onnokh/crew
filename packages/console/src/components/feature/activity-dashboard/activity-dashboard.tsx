import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";
import { ApiError, apiFetch } from "../../../api/client";
import {
  telemetryKeys,
  type ActivityPanelData,
  type UserUsageItem,
} from "../../telemetry/telemetry-data";
import { ActivityFeed } from "../../activity-feed/activity-feed";
import { PageHeading } from "../../ui/page-heading/page-heading";
import shared from "../../../styles/dashboard.module.scss";
import styles from "./activity-dashboard.module.scss";

const PAGE_SIZE = 15;

/** The standalone Activity sub-page: the full event feed, one page at a time. */
export default function ActivityDashboard() {
  const [page, setPage] = useState(0);

  const { data, error, isLoading, isPlaceholderData } = useQuery({
    queryKey: [...telemetryKeys.activity, page],
    queryFn: () =>
      apiFetch<ActivityPanelData>(
        `/api/telemetry/activity?limit=${PAGE_SIZE}&offset=${page * PAGE_SIZE}`,
      ),
    // Keep the previous page on screen while the next loads, so paging doesn't
    // flash the loading state.
    placeholderData: keepPreviousData,
  });

  const { data: usersData } = useQuery({
    queryKey: telemetryKeys.users,
    queryFn: () =>
      apiFetch<{ users: UserUsageItem[] }>("/api/telemetry/users").then(
        (r) => r.users,
      ),
  });

  if (error) {
    return (
      <section className={shared.usagePage}>
        <PageHeading
          title="Activity"
          subtitle="Every search, post, and verdict across your crew."
        />
        <p className={shared.error} role="alert">
          {describe(error)}
        </p>
      </section>
    );
  }

  const total = data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const events = data?.activity ?? [];
  const firstRow = total === 0 ? 0 : page * PAGE_SIZE + 1;
  const lastRow = page * PAGE_SIZE + events.length;

  return (
    <section className={shared.usagePage}>
      <PageHeading
        title="Activity"
        subtitle="Every search, post, and verdict across your crew."
      />

      <section className={`${shared.usageSection} ${styles.feed}`}>
        <ActivityFeed
          events={events}
          users={usersData ?? []}
          loading={isLoading}
        />

        {total > 0 && (
          <div className={styles.pager} aria-busy={isPlaceholderData}>
            <span className={styles.pagerRange}>
              {firstRow}–{lastRow} of {total}
            </span>
            <div className={styles.pagerControls}>
              <button
                type="button"
                className={styles.pagerButton}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                aria-label="Previous page"
              >
                <ChevronLeft size={16} aria-hidden="true" />
              </button>
              <span className={styles.pagerPage}>
                Page {page + 1} of {pageCount}
              </span>
              <button
                type="button"
                className={styles.pagerButton}
                onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                disabled={page >= pageCount - 1}
                aria-label="Next page"
              >
                <ChevronRight size={16} aria-hidden="true" />
              </button>
            </div>
          </div>
        )}
      </section>
    </section>
  );
}

function describe(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 403) return "Admin role required.";
    return `Request failed (${err.status}).`;
  }
  return err instanceof Error ? err.message : "Something went wrong.";
}
