/**
 * Thin wrapper for the server's review/admin JSON API (the endpoints 0012 and
 * 0013 add under `/api/...`). The console talks to the server over HTTP/JSON +
 * better-auth only — the wire is the type boundary, so there is no shared TS and
 * callers pass the response shape as `<T>` (mirror the server's JSON contract).
 *
 * Same-origin in production (the Hono app serves both the SPA and the API), and
 * proxied in dev (see vite.config.ts), so the better-auth session cookie is
 * first-party — we still pass `credentials: "include"` explicitly so it is sent
 * even if a future deploy splits origins. A non-2xx response throws an
 * {@link ApiError} carrying the status, so a page can branch on 401/403.
 */
export async function apiFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(path, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
    ...init,
  });

  if (!response.ok) {
    throw new ApiError(response.status, await response.text());
  }

  // 204 No Content (e.g. a retire/restore with no body) has nothing to parse.
  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

/** A non-2xx response from the server JSON API; carries the HTTP status. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    body: string,
  ) {
    super(`Server responded ${status}: ${body}`);
    this.name = "ApiError";
  }
}
