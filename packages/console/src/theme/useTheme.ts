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

      const x = event.clientX;
      const y = event.clientY;
      const radius = Math.hypot(
        Math.max(x, window.innerWidth - x),
        Math.max(y, window.innerHeight - y),
      );

      document
        .startViewTransition(() => setTheme(next))
        .ready.then(() => {
          document.documentElement.animate(
            {
              clipPath: [
                `circle(0px at ${x}px ${y}px)`,
                `circle(${radius}px at ${x}px ${y}px)`,
              ],
            },
            {
              duration: 500,
              easing: "ease-in-out",
              pseudoElement: "::view-transition-new(root)",
            },
          );
        });
    },
    [theme],
  );

  return { theme, toggle };
}
