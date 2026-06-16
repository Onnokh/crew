import * as Avatar from "@radix-ui/react-avatar";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Link, useRouter } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { authClient, useSession } from "../auth/client";
import styles from "./AppChrome.module.scss";

/**
 * The app chrome: a top bar with nav links and, when signed in, the current
 * User's identity + a sign-out. It wraps both the PUBLIC home page (browse +
 * search the shared memory, no session needed) and the signed-in pages under
 * `_authed`, so it adapts to the session rather than assuming one: an anonymous
 * visitor sees the brand, the home link and a "Sign in" link; a signed-in User
 * additionally sees the Admin link and their account menu. Built from Radix
 * primitives (Avatar, DropdownMenu) styled with the colocated `*.module.scss`
 * (no third-party theme — ADR 0004).
 *
 * Sign-out calls better-auth's `signOut`, then invalidates the router so any
 * `_authed` page re-runs its guard, finds no session, and bounces to `/login`.
 */
export function AppChrome({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { data } = useSession();
  const user = data?.user;

  async function onSignOut() {
    await authClient.signOut();
    await router.invalidate();
    await router.navigate({ to: "/login" });
  }

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <div className={styles.bar}>
        <div className={styles.barInner}>
        <nav className={styles.nav}>
          <span className={styles.brand}>Crew</span>
          <Link
            to="/"
            className={styles.link}
            activeProps={{ className: styles.linkActive }}
          >
            Review
          </Link>
          {user && (
            <Link
              to="/admin"
              className={styles.link}
              activeProps={{ className: styles.linkActive }}
            >
              Admin
            </Link>
          )}
        </nav>

        {user ? (
          <DropdownMenu.Root>
            <DropdownMenu.Trigger className={styles.userButton}>
              <Avatar.Root className={styles.avatar}>
                <Avatar.Fallback className={styles.avatarFallback}>
                  {initials(user.name ?? user.email)}
                </Avatar.Fallback>
              </Avatar.Root>
              <span className={styles.userName}>
                {user.name ?? user.email ?? "Account"}
              </span>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content className={styles.menu} align="end" sideOffset={6}>
                <div className={styles.menuHeader}>
                  <span className={styles.menuName}>{user.name}</span>
                  <span className={styles.menuEmail}>{user.email}</span>
                </div>
                <DropdownMenu.Separator className={styles.menuSeparator} />
                <DropdownMenu.Item className={styles.menuItem} onSelect={onSignOut}>
                  Sign out
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        ) : (
          <Link to="/login" className={styles.signIn}>
            Sign in
          </Link>
        )}
        </div>
        </div>
      </header>

      <main className={styles.main}>
        <div className={styles.rail} aria-hidden="true" />
        <div className={styles.content}>
          <div className={styles.measure}>{children}</div>
        </div>
        <div className={styles.rail} aria-hidden="true" />
      </main>
    </div>
  );
}

/** First letters of the display name (or email), for the avatar fallback. */
function initials(label: string | undefined): string {
  if (!label) return "?";
  const parts = label.trim().split(/\s+/);
  const letters = parts.slice(0, 2).map((p) => p[0] ?? "");
  return letters.join("").toUpperCase() || label[0]!.toUpperCase();
}
