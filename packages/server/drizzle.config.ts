import { defineConfig } from "drizzle-kit";

// SQL in `migrations/` is hand-written because virtual tables (FTS5/vec0) and
// triggers are outside drizzle-kit's model; this config lets drizzle-kit tooling
// (studio, diff checks) still read the table defs.
export default defineConfig({
  dialect: "sqlite",
  schema: "./src/store/schema.ts",
  // posts/post_events live in the per-team corpus DB (ADR 0007), so schema.ts
  // mirrors the hand-written migrations under migrations/team.
  out: "./migrations/team",
});
