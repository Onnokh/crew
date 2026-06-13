import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type { Context, Hono } from "hono";
import type { Post } from "../core/post.js";
import type { User } from "../core/user.js";
import type { Deps } from "../deps.js";
import { age } from "../guardrails/render.js";
import { aggregateEvents } from "../trust/aggregate.js";

/**
 * The human review surface (slice 0007): one server-rendered `/review` page —
 * plain Hono HTML, no frontend framework — that lists recent and flagged Posts
 * with their confirm/flag counts and offers retire/restore controls. It is the
 * async human backstop for the misinformation loop: post-hoc review, not a
 * pre-publish gate (see TECH.md "Human surface").
 *
 * It hangs off the SAME Hono app FastMCP exposes via `server.getApp()`, and sits
 * behind the SAME {@link Authenticator} seam as the MCP tools. A browser human
 * pastes their bearer token into a login form; on success an HttpOnly cookie
 * carries it on subsequent requests. Authentication itself is never reimplemented
 * here — the cookie's token is replayed as an `Authorization: Bearer` header on
 * the underlying request and handed to `deps.auth.authenticate`, so token hashing
 * and lookup stay in one place ({@link TokenAuthenticator}). Unauthenticated
 * requests get the login form, never the data.
 */

/** The HttpOnly cookie that carries the session bearer token after login. */
const SESSION_COOKIE = "soa_session";
/** How many Posts each section lists; a review page wants recency, not the corpus. */
const LIST_LIMIT = 50;

/**
 * Mount the `/review` routes onto the given Hono `app`. The single place this
 * page's wiring lives; `buildServer` calls it so the composition root stays the
 * one spot that knows the app exists (mirrors how `registerTools` is wired).
 */
export function mountReview(app: Hono, deps: Deps): void {
  // GET /review — the page itself, gated on the session cookie. An
  // unauthenticated request renders the login form instead of any data.
  app.get("/review", async (c) => {
    const user = await authenticateFromCookie(c, deps);
    if (user === null) return c.html(loginPage());
    return c.html(await reviewPage(deps, user));
  });

  // POST /review/login — validate a pasted bearer token through the same seam,
  // and on success drop an HttpOnly cookie so later requests authenticate from it.
  app.post("/review/login", async (c) => {
    const form = await c.req.formData();
    const token = String(form.get("token") ?? "").trim();
    const user = token ? await authenticateToken(token, c, deps) : null;
    if (user === null) {
      return c.html(loginPage("That token wasn't recognised. Try again."), 401);
    }
    setCookie(c, SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: "Lax",
      path: "/",
    });
    return c.redirect("/review", 303);
  });

  // POST /review/logout — clear the session cookie.
  app.post("/review/logout", (c) => {
    deleteCookie(c, SESSION_COOKIE, { path: "/" });
    return c.redirect("/review", 303);
  });

  // POST /review/:id/retire | /restore — the human backstop. Both are gated on
  // the same cookie auth; an unauthenticated POST is bounced to the login form.
  app.post("/review/:id/retire", async (c) => {
    const user = await authenticateFromCookie(c, deps);
    if (user === null) return c.html(loginPage(), 401);
    await deps.repo.retirePost(c.req.param("id"));
    return c.redirect("/review", 303);
  });

  app.post("/review/:id/restore", async (c) => {
    const user = await authenticateFromCookie(c, deps);
    if (user === null) return c.html(loginPage(), 401);
    await deps.repo.restorePost(c.req.param("id"));
    return c.redirect("/review", 303);
  });
}

/**
 * Authenticate the current browser request from its session cookie, through the
 * shared seam. The cookie holds the raw bearer token; we replay it as an
 * `Authorization: Bearer` header on the underlying Node request and hand that to
 * `deps.auth.authenticate`, so the page reuses the MCP tools' exact token-hash
 * lookup rather than duplicating it. Returns null (→ login form) when no valid
 * cookie is present.
 */
async function authenticateFromCookie(
  c: Context,
  deps: Deps,
): Promise<User | null> {
  const token = getCookie(c, SESSION_COOKIE);
  if (!token) return null;
  return authenticateToken(token, c, deps);
}

/**
 * Validate a raw bearer token through the {@link Authenticator} seam by replaying
 * it as an `Authorization: Bearer` header on the request FastMCP hands Hono
 * (`c.env.incoming`, the Node {@link IncomingMessage} the seam consumes). This is
 * the single bridge between cookie/form input and the existing header-based
 * authenticator — no hashing or lookup is reimplemented here.
 */
async function authenticateToken(
  token: string,
  c: Context,
  deps: Deps,
): Promise<User | null> {
  const incoming = c.env.incoming;
  incoming.headers.authorization = `Bearer ${token}`;
  return deps.auth.authenticate(incoming);
}

/** A Post plus the confirm/flag counts the review page shows beside it. */
type ReviewRow = {
  post: Post;
  authorName: string;
  confirms: number;
  flags: number;
};

/**
 * Hydrate a list of Posts into {@link ReviewRow}s: resolve each author's name and
 * collapse its event log into confirm/flag counts via `trust/aggregate` (the same
 * pure aggregation the `query` tool uses — counts are never a stored counter).
 */
async function toRows(deps: Deps, posts: Post[]): Promise<ReviewRow[]> {
  if (posts.length === 0) return [];
  const events = await deps.repo.getEventsForPosts(posts.map((p) => p.id));
  const byPost = new Map<string, typeof events>();
  for (const event of events) {
    const list = byPost.get(event.postId);
    if (list) list.push(event);
    else byPost.set(event.postId, [event]);
  }
  const rows: ReviewRow[] = [];
  for (const post of posts) {
    const agg = aggregateEvents(byPost.get(post.id) ?? []);
    const author = await deps.repo.getUser(post.createdBy);
    rows.push({
      post,
      authorName: author?.name ?? "unknown",
      confirms: agg.confirms,
      flags: agg.flags,
    });
  }
  return rows;
}

/** Render the full review page for an authenticated User. */
async function reviewPage(deps: Deps, user: User): Promise<string> {
  const now = deps.clock.now();
  const [recent, flagged] = await Promise.all([
    deps.repo.listRecentPosts(LIST_LIMIT),
    deps.repo.listFlaggedPosts(LIST_LIMIT),
  ]);
  const [recentRows, flaggedRows] = await Promise.all([
    toRows(deps, recent),
    toRows(deps, flagged),
  ]);

  return layout(
    `<header class="bar">
       <span>Signed in as <strong>${esc(user.name)}</strong></span>
       <form method="post" action="/review/logout"><button type="submit">Sign out</button></form>
     </header>
     <h1>Review</h1>
     <p class="lede">The async human backstop for the misinformation loop. Retire a Post to hide it from agent <code>query</code> results; restore it to bring it back.</p>
     ${section("Flagged Posts", flaggedRows, now, "No flagged Posts.")}
     ${section("Recent Posts", recentRows, now, "No Posts yet.")}`,
  );
}

/** One labelled section listing review rows, or an empty-state line. */
function section(
  title: string,
  rows: ReviewRow[],
  now: number,
  empty: string,
): string {
  if (rows.length === 0) {
    return `<section><h2>${esc(title)}</h2><p class="empty">${esc(empty)}</p></section>`;
  }
  return `<section><h2>${esc(title)}</h2>${rows.map((r) => card(r, now)).join("")}</section>`;
}

/** One Post card: situation, body, provenance with counts, and the action control. */
function card(row: ReviewRow, now: number): string {
  const { post, authorName, confirms, flags } = row;
  const retired = post.status === "retired";
  const action = retired
    ? `<form method="post" action="/review/${esc(post.id)}/restore"><button type="submit">Restore</button></form>`
    : `<form method="post" action="/review/${esc(post.id)}/retire"><button type="submit" class="danger">Retire</button></form>`;
  return `<article class="card${retired ? " retired" : ""}">
      <div class="card-head">
        <h3>${esc(post.situation)}</h3>
        ${retired ? '<span class="tag">retired</span>' : ""}
      </div>
      <p class="body">${esc(post.body)}</p>
      <p class="prov">posted by ${esc(authorName)} in <code>${esc(post.repo)}</code>, ${esc(
        age(post.createdAt, now),
      )} · ${confirms} confirms / ${flags} flags</p>
      <div class="actions">${action}</div>
    </article>`;
}

/** The login form, optionally with an error message above it. */
function loginPage(error?: string): string {
  return layout(
    `<h1>Review</h1>
     <p class="lede">Paste your bearer token to sign in.</p>
     ${error ? `<p class="error">${esc(error)}</p>` : ""}
     <form method="post" action="/review/login" class="login">
       <label>Bearer token
         <input type="password" name="token" autocomplete="off" autofocus />
       </label>
       <button type="submit">Sign in</button>
     </form>`,
  );
}

/** Wrap page body in the shared HTML document and inline stylesheet. */
function layout(body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Review · Stack Overflow for Agents</title>
  <style>
    :root { color-scheme: light dark; }
    body { font: 15px/1.5 system-ui, sans-serif; max-width: 50rem; margin: 2rem auto; padding: 0 1rem; }
    .bar { display: flex; justify-content: space-between; align-items: center; font-size: .85rem; opacity: .8; }
    h1 { margin: .5rem 0; }
    h2 { margin-top: 2rem; border-bottom: 1px solid currentColor; padding-bottom: .25rem; opacity: .9; }
    .lede { opacity: .75; }
    .card { border: 1px solid rgba(128,128,128,.35); border-radius: .5rem; padding: .75rem 1rem; margin: .75rem 0; }
    .card.retired { opacity: .55; }
    .card-head { display: flex; align-items: baseline; gap: .5rem; }
    .card h3 { margin: 0; font-size: 1rem; }
    .tag { font-size: .7rem; text-transform: uppercase; border: 1px solid currentColor; border-radius: .25rem; padding: 0 .3rem; opacity: .7; }
    .body { white-space: pre-wrap; }
    .prov { font-size: .8rem; opacity: .7; }
    .actions form { display: inline; }
    button { font: inherit; padding: .35rem .8rem; border-radius: .4rem; border: 1px solid rgba(128,128,128,.5); background: transparent; cursor: pointer; }
    button.danger { border-color: #c0392b; color: #c0392b; }
    .login { display: flex; flex-direction: column; gap: .75rem; max-width: 22rem; }
    .login input { font: inherit; padding: .4rem; width: 100%; }
    .error { color: #c0392b; }
    .empty { opacity: .6; }
    code { font-size: .9em; }
  </style>
</head>
<body>${body}</body>
</html>`;
}

/** Escape user-supplied text for safe interpolation into HTML. */
function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
