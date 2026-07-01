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
            <a
              className={styles.githubLink}
              href="https://github.com/Onnokh/crew"
              target="_blank"
              rel="noreferrer"
              aria-label="View source on GitHub"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
              </svg>
            </a>
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
                    <DropdownMenu.Item className={styles.menuItem} asChild>
                      <Link to="/legends">Hall of Legends</Link>
                    </DropdownMenu.Item>
                    <DropdownMenu.Item className={styles.menuItem} asChild>
                      <Link to="/profile">Profile</Link>
                    </DropdownMenu.Item>
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
