import type { Clock } from "./clock.js";

/** Real {@link Clock}: wall-clock time in unix milliseconds. */
export class SystemClock implements Clock {
  now(): number {
    return Date.now();
  }
}
