/**
 * Dev-only seed: 10 named users plus ~3 months of fake usage (posts, searches,
 * confirms/flags) in the default Team's corpus, so the dashboards have realistic
 * data to render. Idempotent — every row has a deterministic `seed3m_*` id and is
 * inserted with INSERT OR IGNORE, so re-running adds nothing new.
 *
 * Run from packages/server:  npm run seed:fake
 * (stop `npm run dev` first if you hit SQLITE_BUSY — both want the write lock).
 */
import { join } from "node:path";
import { openDatabase } from "../src/store/db.js";

const DAY = 24 * 60 * 60 * 1000;
const SPAN_DAYS = 90;
const NOW = Date.now();

const NAMES = [
  "Ava Chen",
  "Liam Patel",
  "Sofia Rossi",
  "Noah Kim",
  "Mia Hernández",
  "Lucas Müller",
  "Emma Novak",
  "Omar Haddad",
  "Yuki Tanaka",
  "Grace O'Brien",
];

const REPOS = ["webshop", "payments-api", "mobile-app", "infra", "data-pipeline"];
const ENVIRONMENTS = [
  "node 22, pnpm, postgres 16",
  "python 3.12, fastapi, redis",
  "go 1.23, docker compose",
  "react 19, vite, typescript 5.6",
  "rust 1.81, tokio",
];
const SITUATIONS = [
  "database connection pool exhausted under load",
  "flaky end-to-end test on CI but green locally",
  "CORS preflight failing for the API gateway",
  "memory leak in the websocket worker",
  "slow cold start on the serverless function",
  "stripe webhook signature verification fails",
  "docker build cache invalidated on every push",
  "race condition in the job queue consumer",
  "JWT refresh loop logs users out randomly",
  "n+1 query on the orders dashboard",
  "kafka consumer lag spikes after deploy",
  "TLS handshake timeout to the upstream service",
];
const TITLES = [
  "Fix connection pool exhaustion",
  "Stabilise the flaky CI test",
  "Resolve CORS preflight failures",
  "Plug the websocket memory leak",
  "Cut serverless cold starts",
  "Verify Stripe webhook signatures",
  "Keep the Docker build cache warm",
  "Close the job-queue race",
  "Stop the JWT refresh loop",
  "Kill the orders n+1 query",
  "Tame Kafka consumer lag",
  "Fix upstream TLS timeouts",
];
const BODIES = [
  "Raise the pool size and add a bounded wait; the default of 10 was too small for peak traffic.",
  "The test depended on wall-clock ordering — inject a fake clock and await the flush explicitly.",
  "Add the gateway origin to the allow-list and return 204 for OPTIONS before auth runs.",
  "Unref the heartbeat timer and drop listeners on close; the socket map was retaining sockets.",
  "Bake the model and warm the connection at module load instead of per-request.",
  "Use the raw body and the signing secret; the JSON middleware was mutating the payload.",
  "Order the COPY steps least- to most-volatile and lock the dependency manifest hash.",
  "Take an advisory lock per job id so two consumers can't claim the same row.",
  "Refresh on a single-flight promise so concurrent 401s don't each trigger a refresh.",
  "Batch-load the line items with a single IN query and map them back in memory.",
  "Increase partitions and commit offsets after processing, not before.",
  "Raise the handshake timeout and add a retry with jitter on the client.",
];
const REASONS = ["incorrect", "stale", "duplicate"] as const;

const pick = <T>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)]!;
const randInt = (min: number, max: number) =>
  Math.floor(min + Math.random() * (max - min + 1));
/** A timestamp uniformly in the last SPAN_DAYS, biased nowhere. */
const randTime = () => NOW - Math.floor(Math.random() * SPAN_DAYS * DAY);

const controlPlanePath =
  process.env.CREW_CONTROL_PLANE_DB_PATH ?? "crew-control-plane.db";
const teamsDir = process.env.CREW_TEAMS_DIR ?? "teams";

const { raw: cp } = openDatabase(controlPlanePath, "control-plane");
cp.pragma("busy_timeout = 10000");

const team = cp
  .prepare(`SELECT id, name FROM team ORDER BY created_at ASC, id ASC LIMIT 1`)
  .get() as { id: string; name: string } | undefined;
if (!team) {
  throw new Error(
    "No Team found in the control plane — start the server once to bootstrap the default Team.",
  );
}

// --- Users (control plane) ---------------------------------------------------
const insUser = cp.prepare(
  `INSERT OR IGNORE INTO "user" (id, name, email, emailVerified, createdAt, updatedAt, role)
   VALUES (?, ?, ?, 1, ?, ?, NULL)`,
);
const insMember = cp.prepare(
  `INSERT OR IGNORE INTO team_membership (user_id, team_id, created_at) VALUES (?, ?, ?)`,
);

const userIds: string[] = [];
const createdIso = new Date(NOW - SPAN_DAYS * DAY).toISOString();
cp.transaction(() => {
  NAMES.forEach((name, i) => {
    const id = `seed3m_user_${i}`;
    const email = `seed.${name.toLowerCase().replace(/[^a-z]+/g, ".")}@crew.local`;
    insUser.run(id, name, email, createdIso, createdIso);
    insMember.run(id, team.id, NOW - SPAN_DAYS * DAY);
    userIds.push(id);
  });
})();

// --- Corpus activity (per-team DB) -------------------------------------------
const { raw: corpus } = openDatabase(join(teamsDir, `${team.id}.db`), "team");
corpus.pragma("busy_timeout = 10000");

const insPost = corpus.prepare(
  `INSERT OR IGNORE INTO posts
     (id, title, situation, body, environment, repo, status, created_by, created_at, views)
   VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)`,
);
const insRetrieval = corpus.prepare(
  `INSERT OR IGNORE INTO retrievals
     (id, user_id, repo, situation, environment, "limit", result_count, created_at)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
);
const insResult = corpus.prepare(
  `INSERT OR IGNORE INTO retrieval_results
     (id, retrieval_id, post_id, rank, rrf_score, trust, recency, repo_boost, final)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
);
const insEvent = corpus.prepare(
  `INSERT OR IGNORE INTO post_events
     (id, post_id, verdict, reason, note, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
);

const N_POSTS = 130;
const N_RETRIEVALS = 700;

const posts: Array<{ id: string; createdAt: number }> = [];
let resultSeq = 0;
let eventSeq = 0;

corpus.transaction(() => {
  // Posts.
  for (let i = 0; i < N_POSTS; i++) {
    const id = `seed3m_post_${i}`;
    const topic = randInt(0, SITUATIONS.length - 1);
    const createdAt = randTime();
    insPost.run(
      id,
      TITLES[topic]!,
      SITUATIONS[topic]!,
      BODIES[topic]!,
      pick(ENVIRONMENTS),
      pick(REPOS),
      pick(userIds),
      createdAt,
      randInt(0, 40),
    );
    posts.push({ id, createdAt });
  }

  // Retrievals, with results + the occasional same-user confirm (a conversion).
  for (let i = 0; i < N_RETRIEVALS; i++) {
    const id = `seed3m_ret_${i}`;
    const userId = pick(userIds);
    const createdAt = randTime();
    const topic = randInt(0, SITUATIONS.length - 1);
    // ~22% of searches return nothing (the zero-result rate).
    const resultCount = Math.random() < 0.22 ? 0 : randInt(1, 6);
    insRetrieval.run(
      id,
      userId,
      Math.random() < 0.7 ? pick(REPOS) : null,
      SITUATIONS[topic]!,
      Math.random() < 0.5 ? pick(ENVIRONMENTS) : null,
      6,
      resultCount,
      createdAt,
    );

    if (resultCount === 0) continue;
    // Attach result rows from posts that already existed at search time.
    const eligible = posts.filter((p) => p.createdAt < createdAt);
    if (eligible.length === 0) continue;
    const k = Math.min(resultCount, eligible.length, 5);
    const chosen: string[] = [];
    for (let rank = 1; rank <= k; rank++) {
      const post = eligible[randInt(0, eligible.length - 1)]!;
      chosen.push(post.id);
      insResult.run(
        `seed3m_rr_${resultSeq++}`,
        id,
        post.id,
        rank,
        Number((1 / (rank + 1)).toFixed(4)),
        Number((0.5 + Math.random()).toFixed(4)),
        Number((0.5 + Math.random() * 0.5).toFixed(4)),
        1,
        Number((1 / (rank + 1)).toFixed(4)),
      );
    }
    // ~45% of searches-with-results convert: same user confirms a hit in-window.
    if (Math.random() < 0.45) {
      const confirmAt = createdAt + randInt(1, 60) * 60 * 1000 + randInt(0, 2) * DAY;
      if (confirmAt < NOW) {
        insEvent.run(
          `seed3m_evt_${eventSeq++}`,
          chosen[0]!,
          "confirm",
          null,
          null,
          userId,
          confirmAt,
        );
      }
    }
  }

  // Some standalone confirms/flags for feed variety.
  for (let i = 0; i < 90; i++) {
    const post = posts[randInt(0, posts.length - 1)]!;
    const isFlag = Math.random() < 0.3;
    const at = post.createdAt + randInt(1, SPAN_DAYS) * DAY;
    if (at >= NOW) continue;
    insEvent.run(
      `seed3m_evt_${eventSeq++}`,
      post.id,
      isFlag ? "flag" : "confirm",
      isFlag ? pick(REASONS) : null,
      null,
      pick(userIds),
      at,
    );
  }
})();

const postCount = (corpus.prepare(`SELECT COUNT(*) AS n FROM posts`).get() as { n: number }).n;
const retCount = (corpus.prepare(`SELECT COUNT(*) AS n FROM retrievals`).get() as { n: number }).n;
const evtCount = (corpus.prepare(`SELECT COUNT(*) AS n FROM post_events`).get() as { n: number }).n;

// eslint-disable-next-line no-console
console.log(
  `Seeded ${NAMES.length} users into Team "${team.name}" (${team.id}).\n` +
    `Corpus totals now: ${postCount} posts, ${retCount} searches, ${evtCount} events.`,
);

cp.close();
corpus.close();
