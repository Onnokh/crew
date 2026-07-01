import { createFileRoute } from "@tanstack/react-router";
import { LegendsPage } from "../../components/feature/legends/legends-page";

/**
 * Hall of Legends, reachable by any signed-in User (the `_authed` guard already
 * redirects anonymous visitors to `/login`). Like `/profile`, it lives outside
 * `/dashboard`, so `AuthedLayout` wraps it in the plain `AppChrome` rather than
 * the admin shell.
 */
export const Route = createFileRoute("/_authed/legends")({
  component: LegendsPage,
});
