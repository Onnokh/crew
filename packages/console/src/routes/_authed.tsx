import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";
import { authClient } from "../auth/client";
import { AppChrome } from "../components/AppChrome";

/**
 * The route guard + signed-in shell. Every protected page nests under this
 * pathless layout route (file-based routing: a file at `_authed/<page>.tsx`
 * becomes a child), so the auth check and the chrome are written ONCE here, not
 * per page (see ADR 0004). 0012's `/admin` and 0013's `/review` are children —
 * adding a page is adding `src/routes/_authed/<name>.tsx`, nothing else.
 *
 * `beforeLoad` runs before the page (and its loader) renders. It fetches the
 * better-auth session and, if there is none, throws a `redirect` to `/login`,
 * carrying the attempted URL in a `redirect` search param so login can send the
 * visitor back to their deep link. A signed-in visitor falls through to the
 * chrome, which renders the matched child in its `<Outlet />`.
 */
export const Route = createFileRoute("/_authed")({
  beforeLoad: async ({ location }) => {
    const { data } = await authClient.getSession();
    if (!data) {
      throw redirect({
        to: "/login",
        search: { redirect: location.href },
      });
    }
  },
  component: AuthedLayout,
});

function AuthedLayout() {
  return (
    <AppChrome>
      <Outlet />
    </AppChrome>
  );
}
