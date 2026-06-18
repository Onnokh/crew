import { Outlet, createRootRoute } from "@tanstack/react-router";

/** Bare root layout. Signed-in chrome lives on `_authed`, so `/login` renders without it. */
export const Route = createRootRoute({
  component: () => <Outlet />,
});
