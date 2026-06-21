import { createFileRoute, redirect } from "@tanstack/react-router";
import { authClient } from "../auth/client";
import { AppChrome } from "../components/app-chrome/app-chrome";
import { ReviewPage } from "../components/review/review-page";

/** Signed-in home page. Team-scoped review data requires an authenticated user. */
export const Route = createFileRoute("/")({
  beforeLoad: async ({ location }) => {
    const { data } = await authClient.getSession();
    if (!data) {
      throw redirect({
        to: "/login",
        search: { redirect: location.href },
      });
    }
  },
  component: HomePage,
});

/** Wrap the review surface in the app chrome (this root route has no layout parent). */
function HomePage() {
  return (
    <AppChrome>
      <ReviewPage />
    </AppChrome>
  );
}
