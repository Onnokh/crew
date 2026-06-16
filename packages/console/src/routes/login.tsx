import * as Label from "@radix-ui/react-label";
import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { authClient } from "../auth/client";
import styles from "./login.module.scss";

/**
 * The public sign-in page (email + password). It is the ONE route outside the
 * `_authed` guard. `beforeLoad` short-circuits an already-signed-in visitor
 * straight to the app, so hitting `/login` with a live session doesn't strand
 * them on a login form. A `redirect` search param (set by the guard when it
 * bounces someone) is honoured on success so deep links survive the round-trip.
 */
export const Route = createFileRoute("/login")({
  validateSearch: (search: Record<string, unknown>): { redirect?: string } => ({
    redirect: typeof search.redirect === "string" ? search.redirect : undefined,
  }),
  beforeLoad: async ({ search }) => {
    const { data } = await authClient.getSession();
    if (data) {
      throw redirect({ to: search.redirect ?? "/" });
    }
  },
  component: LoginPage,
});

function LoginPage() {
  const router = useRouter();
  const { redirect: redirectTo } = Route.useSearch();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    // better-auth 1.6.x returns `{ data, error }` rather than throwing on bad
    // credentials, so we branch on `error` instead of try/catch.
    const { error: signInError } = await authClient.signIn.email({
      email,
      password,
    });
    setSubmitting(false);

    if (signInError) {
      setError(signInError.message ?? "Sign-in failed. Check your credentials.");
      return;
    }
    // Land where the guard wanted to send us, or the default page. `invalidate`
    // forces the now-protected routes to re-run their session-aware loaders.
    await router.invalidate();
    await router.navigate({ to: redirectTo ?? "/" });
  }

  return (
    <main className={styles.page}>
      <form className={styles.card} onSubmit={onSubmit}>
        <p className={styles.eyebrow}>Console</p>
        <h1 className={styles.title}>Crew</h1>
        <p className={styles.subtitle}>Sign in to continue</p>

        <div className={styles.field}>
          <Label.Root className={styles.label} htmlFor="email">
            Email
          </Label.Root>
          <input
            id="email"
            className={styles.input}
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <div className={styles.field}>
          <Label.Root className={styles.label} htmlFor="password">
            Password
          </Label.Root>
          <input
            id="password"
            className={styles.input}
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}

        <button className={styles.submit} type="submit" disabled={submitting}>
          {submitting ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </main>
  );
}
