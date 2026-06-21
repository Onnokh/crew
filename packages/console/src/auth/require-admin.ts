import { redirect } from "@tanstack/react-router";
import { authClient } from "./client";

export async function requireAdmin() {
  const { data } = await authClient.getSession();
  // `role` is omitted from the inferred session type, so read it through a
  // narrow local shape. The server gates the API regardless.
  const role = (data?.user as { role?: string | null } | undefined)?.role;
  if (role !== "admin") {
    throw redirect({ to: "/" });
  }
}
