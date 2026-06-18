// The seam for reading the current time, so tests can pin it.
export type Clock = {
  /** The current time, unix milliseconds. */
  now(): number;
};
