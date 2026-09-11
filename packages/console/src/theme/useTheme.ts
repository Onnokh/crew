// Theme state + animated swap. Source of truth is the `.dark` class on <html>,
// mirrored to localStorage; an external store lets components subscribe via
// `useSyncExternalStore` without a provider.
import { useCallback, useSyncExternalStore } from "react";

export type Theme = "light" | "dark";

const STORAGE_KEY = "crew-theme";

/** Current theme = whatever class the pre-render script (or last toggle) set. */
function getSnapshot(): Theme {
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

// storage events cover other tabs; explicit notify covers this one.
const listeners = new Set<() => void>();
function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) cb();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}

/** Flip the class + persist, then notify subscribers. */
function setTheme(next: Theme): void {
  document.documentElement.classList.toggle("dark", next === "dark");
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // private mode / disabled storage — class still applies for the session.
  }
  for (const cb of listeners) cb();
}

// Distinguishes overlapping reveals: a superseded transition still settles, and
// it must not strip the rule out from under the one now running.
let revealToken = 0;

export function useTheme() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  // Expands a circular clip from the click point. Falls back to an instant swap
  // when View Transitions are unsupported or motion is reduced.
  const toggle = useCallback(
    (event?: { clientX: number; clientY: number }) => {
      const next: Theme = theme === "dark" ? "light" : "dark";

      const reduceMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;

      if (!document.startViewTransition || reduceMotion || !event) {
        setTheme(next);
        return;
      }

      // The reveal itself is CSS (see `theme-reveal` in styles/global.scss); this
      // only hands it the origin and arms the rule. Keeping the keyframes in CSS
      // means the transition lasts exactly as long as the reveal: an animation
      // attached from `ready` starts a frame late, and the browser's own 250ms
      // default can tear the snapshots down while the circle is still growing —
      // the reveal then stops part-way and the rest of the page snaps over.
      const root = document.documentElement;
      root.style.setProperty("--theme-reveal-x", `${event.clientX}px`);
      root.style.setProperty("--theme-reveal-y", `${event.clientY}px`);
      root.dataset.themeReveal = "";

      const token = ++revealToken;
      const transition = document.startViewTransition(() => setTheme(next));
      // A second toggle supersedes this one; only the last one may disarm, or the
      // fast clicker loses the clip half-way through the reveal they can see.
      const disarm = () => {
        if (token === revealToken) delete root.dataset.themeReveal;
      };
      transition.finished.then(disarm, disarm);
    },
    [theme],
  );

  return { theme, toggle };
}
