import type { PostEvent } from "../core/post-event.js";

/**
 * Trust aggregation — the pure functions that collapse a Post's event log into
 * the few numbers ranking and rendering need: how many Confirms, how many Flags,
 * a scalar trust multiplier, and the most recent confirmation time. Confirms and
 * Flags are stored as events, never bare counters (see TECH.md "Trust
 * mechanics"), so these are derived on read — which is exactly what lets richer
 * trust math (distinct confirmers, decay curves) be recomputed later from the
 * same log without a migration.
 *
 * This module is pure — no SQL, no clock, no embedder — so the trust math is
 * unit-tested without a database (TECH.md "search + trust + guardrails are pure
 * functions"). The store hands it a Post's events; it hands back an aggregate.
 */

/** The smallest trust a Post can have; clamps so heavily-flagged Posts sink but never zero out the whole ranking product. */
export const MIN_TRUST = 0.01;

/** Each Flag subtracts this much from trust — flags weigh double a Confirm. */
export const FLAG_WEIGHT = 2;

/**
 * The collapsed view of a Post's event log that ranking and rendering consume.
 * Counts feed the trust multiplier and the provenance tally; `lastConfirmedAt`
 * is the most recent Confirm time (null if never confirmed) and mirrors the
 * Post's denormalized `last_confirmed`.
 */
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

/**
 * Collapse a Post's events into its {@link TrustAggregate}. Counts confirms and
 * flags, derives the trust multiplier, and finds the latest Confirm time. Events
 * for other Posts, if passed, are simply counted too — callers pass one Post's
 * events. Order-independent.
 */
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
 * The MVP trust multiplier: `1 + confirms − 2·flags`, clamped to at least
 * {@link MIN_TRUST} so a flagged Post sinks far down the ranking but its score
 * never collapses to zero (which would erase RRF and recency signal entirely).
 * Deliberately simple and fully recomputable from the event log; distinct-
 * confirmer weighting and asymptotic confidence are deferred (TECH.md).
 */
export function trustFromCounts(confirms: number, flags: number): number {
  const raw = 1 + confirms - FLAG_WEIGHT * flags;
  return Math.max(MIN_TRUST, raw);
}
