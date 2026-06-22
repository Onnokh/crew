import * as Avatar from "@radix-ui/react-avatar";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Link, useRouter, useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { authClient, useSession } from "../../auth/client";
import { ThemeToggle } from "../ui/theme-toggle/theme-toggle";
import { avatarUrl } from "../ui/user-avatar/user-avatar";
import styles from "./app-chrome.module.scss";

/** App chrome wrapping both the public home page and signed-in pages, adapting to the session. */
export function AppChrome({ children }: { children: ReactNode }) {
  const router = useRouter();
  // Brand links home, so hide it on home itself.
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isHome = pathname === "/";
  const { data } = useSession();
  const user = data?.user;
  // `role` is omitted from the inferred session type (client built without the
  // admin plugin), so read it through a narrow local shape.
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
                    <Avatar.Image
                      className={styles.avatarImage}
                      src={avatarUrl(user.id ?? user.email)}
                      alt=""
                    />
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
                        <Link to="/dashboard">Dashboard</Link>
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
