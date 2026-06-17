import { createFileRoute } from "@tanstack/react-router";
import { AppChrome } from "../components/app-chrome/app-chrome";
import { ReviewPage } from "../components/review/review-page";

/**
 * The home page (slice 0013) — the async human backstop for the misinformation
 * loop, and the public face of the shared memory. Browsing and searching are
 * PUBLIC (no sign-in — this is the root `/` route, not under the `_authed`
 * guard), so the page supplies its own {@link AppChrome} (the `_authed` layout
 * that wraps the other pages in chrome never runs for `/`). The review surface
 * itself lives in {@link ReviewPage}.
 */
export const Route = createFileRoute("/")({
  component: HomePage,
});

/** Wrap the review surface in the app chrome (this public route has no layout parent). */
function HomePage() {
  return (
    <AppChrome>
      <ReviewPage />
    </AppChrome>
  );
}
