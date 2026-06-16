import * as Avatar from "@radix-ui/react-avatar";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Link, useRouter, useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { authClient, useSession } from "../auth/client";
import { ThemeToggle } from "./ThemeToggle";
import styles from "./AppChrome.module.scss";

/**
 * The app chrome: a narrow centered content column flanked by faint hatched
 * gutters (the rails). There is no top navigation bar — the only chrome is a
 * small actions cluster pinned to the top-right of the content area, between
 * the rails: the theme toggle next to a "Sign in" link, or, when signed in,
 * the User's account menu. It wraps both the PUBLIC home page and the signed-in
 * pages under `_authed`, adapting to the session rather than assuming one. Built
 * from Radix primitives (Avatar, DropdownMenu) styled with the colocated
 * `*.module.scss` (no third-party theme — ADR 0004).
 *
 * Sign-out calls better-auth's `signOut`, then invalidates the router so any
 * `_authed` page re-runs its guard, finds no session, and bounces to `/login`.
 */
export function AppChrome({ children }: { children: ReactNode }) {
  const router = useRouter();
  // The brand is a way back to the home page; it would be redundant on home
  // itself, so we only show it elsewhere (read the live pathname off the router).
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isHome = pathname === "/";
  const { data } = useSession();
  const user = data?.user;
  // `role` is the admin plugin's field on the User (see ADR 0003). The shared
  // `authClient` is built without the admin *client* plugin, so the inferred
  // session type omits it; we read it through a narrow local shape rather than
  // widening the shared client. Mirrors the `beforeLoad` gate on `/admin`, so a
  // non-admin never sees the entry (the server gates the API regardless).
  const isAdmin = (user as { role?: string | null } | undefined)?.role === "admin";

  async function onSignOut() {
    await authClient.signOut();
    await router.invalidate();
    await router.navigate({ to: "/login" });
  }

  return (
    <div className={styles.shell}>
      <main className={styles.main}>
        <div className={styles.rail} aria-hidden="true" />
        <div className={styles.content}>
          <div className={styles.actions}>
            {!isHome ? (
              <Link to="/" className={styles.brand}>
                Crew
              </Link>
            ) : null}
            <ThemeToggle />
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
                    {isAdmin ? (
                      <DropdownMenu.Item className={styles.menuItem} asChild>
                        <Link to="/admin">User management</Link>
                      </DropdownMenu.Item>
                    ) : null}
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
