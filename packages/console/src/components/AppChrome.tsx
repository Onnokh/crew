import * as Avatar from "@radix-ui/react-avatar";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Link, useRouter } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { authClient, useSession } from "../auth/client";
import styles from "./AppChrome.module.scss";

/**
 * The signed-in chrome: a top bar with nav links and the current User's
 * identity + a sign-out, wrapped around whatever page the `_authed` layout
 * renders. It assumes a session exists — the `_authed` guard guarantees that
 * before this mounts — so `useSession().data` is read directly for the User's
 * name/email. Built from Radix primitives (Avatar, DropdownMenu) styled with the
 * colocated `*.module.scss` (no third-party theme — ADR 0004).
 *
 * Sign-out calls better-auth's `signOut`, then invalidates the router so the
 * `_authed` guard re-runs, finds no session, and bounces to `/login`.
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
        <nav className={styles.nav}>
          <span className={styles.brand}>SO for Agents</span>
          <Link
            to="/review"
            className={styles.link}
            activeProps={{ className: styles.linkActive }}
          >
            Review
          </Link>
          <Link
            to="/admin"
            className={styles.link}
            activeProps={{ className: styles.linkActive }}
          >
            Admin
          </Link>
        </nav>

        <DropdownMenu.Root>
          <DropdownMenu.Trigger className={styles.userButton}>
            <Avatar.Root className={styles.avatar}>
              <Avatar.Fallback className={styles.avatarFallback}>
                {initials(user?.name ?? user?.email)}
              </Avatar.Fallback>
            </Avatar.Root>
            <span className={styles.userName}>
              {user?.name ?? user?.email ?? "Account"}
            </span>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content className={styles.menu} align="end" sideOffset={6}>
              <div className={styles.menuHeader}>
                <span className={styles.menuName}>{user?.name}</span>
                <span className={styles.menuEmail}>{user?.email}</span>
              </div>
              <DropdownMenu.Separator className={styles.menuSeparator} />
              <DropdownMenu.Item className={styles.menuItem} onSelect={onSignOut}>
                Sign out
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </header>

      <main className={styles.main}>{children}</main>
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
