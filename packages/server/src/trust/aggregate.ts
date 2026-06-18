import type { PostEvent } from "../core/post-event.js";

/** Pure functions collapsing a Post's event log into counts and a trust multiplier. */

/** Smallest trust a Post can have, so heavily-flagged Posts sink but never zero the ranking product. */
export const MIN_TRUST = 0.01;

/** Each Flag subtracts this much from trust — flags weigh double a Confirm. */
export const FLAG_WEIGHT = 2;

/** The collapsed view of a Post's event log that ranking and rendering consume. */
export type TrustAggregate = {
  /** Number of Confirm events. */
  confirms: number;
  /** Number of Flag events. */
  flags: number;
  /** The trust multiplier (≥ {@link MIN_TRUST}); see {@link trustFromCounts}. */
  trust: number;
  /** Time of the most recent Confirm, unix ms, or null if never confirmed. */
  lastConfirmedAt: number | null;
};

/** Collapse a Post's events into its {@link TrustAggregate}. Order-independent. */
export function aggregateEvents(events: readonly PostEvent[]): TrustAggregate {
  let confirms = 0;
  let flags = 0;
  let lastConfirmedAt: number | null = null;

  for (const event of events) {
    if (event.verdict === "confirm") {
      confirms++;
      if (lastConfirmedAt === null || event.createdAt > lastConfirmedAt) {
        lastConfirmedAt = event.createdAt;
      }
    } else if (event.verdict === "flag") {
      flags++;
    }
  }

  return {
    confirms,
    flags,
    trust: trustFromCounts(confirms, flags),
    lastConfirmedAt,
  };
}

/**
 * Trust multiplier: `1 + confirms − 2·flags`, clamped to at least
 * {@link MIN_TRUST} so a flagged Post sinks but never zeroes the ranking product.
 */
export function trustFromCounts(confirms: number, flags: number): number {
  const raw = 1 + confirms - FLAG_WEIGHT * flags;
  return Math.max(MIN_TRUST, raw);
}
