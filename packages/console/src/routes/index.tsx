import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * `/` has no page of its own — it forwards to `/review`, the page open to any
 * signed-in User (`/admin` is role-gated). The redirect lands inside the
 * `_authed` guard, so an unauthenticated visitor is bounced on to `/login` from
 * there; we don't duplicate the session check here.
 */
export const Route = createFileRoute("/")({
  beforeLoad: () => {
    throw redirect({ to: "/review" });
  },
});
