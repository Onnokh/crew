import { Outlet, createRootRoute } from "@tanstack/react-router";

/**
 * The root route — the outermost layout every page renders inside. It is
 * deliberately bare: the signed-in chrome (header, nav, sign-out) lives on the
 * `_authed` layout route instead, so the public `/login` page renders WITHOUT it.
 * Keep cross-cutting, auth-agnostic concerns here (global error/not-found UI);
 * keep anything that assumes a session on `_authed`.
 */
export const Route = createRootRoute({
  component: () => <Outlet />,
});
