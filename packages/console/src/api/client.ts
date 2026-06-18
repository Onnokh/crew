/**
 * Fetch wrapper for the server JSON API. Callers pass the response shape as `<T>`.
 * `credentials: "include"` is explicit so the session cookie is sent even if a
 * future deploy splits origins. Non-2xx throws an {@link ApiError} with the status.
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

  // 204 No Content has nothing to parse.
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
