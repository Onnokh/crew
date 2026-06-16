import { Moon, Sun } from "lucide-react";
import { useTheme } from "../../../theme/useTheme";
import styles from "./theme-toggle.module.scss";

/**
 * Fixed top-right theme switch. Clicking flips light/dark with a circular
 * view-transition reveal that expands from the button (see useTheme). The icon
 * shows the theme you'd switch TO: a sun while dark, a moon while light.
 */
export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const isDark = theme === "dark";

  return (
    <button
      type="button"
      className={styles.toggle}
      aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
      onClick={(e) => toggle({ clientX: e.clientX, clientY: e.clientY })}
    >
      {isDark ? (
        <Sun size={16} strokeWidth={2} aria-hidden="true" />
      ) : (
        <Moon size={16} strokeWidth={2} aria-hidden="true" />
      )}
    </button>
  );
}
