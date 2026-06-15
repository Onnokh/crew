import { createFileRoute } from "@tanstack/react-router";

/**
 * Placeholder for the admin page — user management, role-gated on
 * `role === 'admin'` (create User, list Users + key counts, mint/revoke keys,
 * ban). Content AND the role gate land in issue 0012; this slice (0011) only
 * stands up the route behind the `_authed` (signed-in) guard. 0012 adds the
 * stricter admin-role check on top — do that in this route's `beforeLoad`,
 * reading `role` from `authClient.getSession()`, and bounce non-admins.
 */
export const Route = createFileRoute("/_authed/admin")({
  component: () => (
    <section>
      <h1>Admin</h1>
      <p>Coming soon (issue 0012).</p>
    </section>
  ),
});
