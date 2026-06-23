import { createFileRoute } from "@tanstack/react-router";
import { ProfilePage } from "../../components/feature/profile/profile-page";

/**
 * Self-service profile, reachable by any signed-in User (the `_authed` guard
 * already redirects anonymous visitors to `/login`). It lives outside
 * `/dashboard`, so `AuthedLayout` wraps it in the plain `AppChrome`, not the
 * admin shell — no chrome needed here.
 */
export const Route = createFileRoute("/_authed/profile")({
  component: ProfilePage,
});
