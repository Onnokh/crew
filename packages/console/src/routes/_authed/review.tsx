import { createFileRoute } from "@tanstack/react-router";

/**
 * Placeholder for the review page — recent/flagged Posts with retire/restore,
 * open to any signed-in User. Content lands in issue 0013; this slice (0011)
 * only stands up the route behind the `_authed` guard so the shell and nav are
 * complete. Replace this component with the real page; the route registration
 * and guard stay as-is.
 */
export const Route = createFileRoute("/_authed/review")({
  component: () => (
    <section>
      <h1>Review</h1>
      <p>Coming soon (issue 0013).</p>
    </section>
  ),
});
