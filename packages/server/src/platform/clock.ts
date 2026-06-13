/**
 * The seam for reading the current time. The application never calls
 * `Date.now()` directly — it depends on this interface so tests can pin time and
 * timestamps stay deterministic (see {@link FakeClock}).
 */
export type Clock = {
  /** The current time, unix milliseconds. */
  now(): number;
};
