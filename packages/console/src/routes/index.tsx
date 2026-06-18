import { createFileRoute } from "@tanstack/react-router";
import { AppChrome } from "../components/app-chrome/app-chrome";
import { ReviewPage } from "../components/review/review-page";

/** Public home page. Outside the `_authed` guard, so it supplies its own {@link AppChrome}. */
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
