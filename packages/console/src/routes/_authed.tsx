import {
  Outlet,
  createFileRoute,
  redirect,
  useRouterState,
} from "@tanstack/react-router";
import { authClient } from "../auth/client";
import { AppChrome } from "../components/app-chrome/app-chrome";

/**
 * Route guard + signed-in shell for every protected page. `beforeLoad` fetches
 * the session and redirects to `/login` if there is none, carrying the attempted
 * URL in a `redirect` search param so login can send the visitor back.
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
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  if (pathname === "/admin" || pathname.startsWith("/dashboard")) {
    return <Outlet />;
  }

  return (
    <AppChrome>
      <Outlet />
    </AppChrome>
  );
}
