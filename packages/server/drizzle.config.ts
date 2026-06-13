import { defineConfig } from "drizzle-kit";

/**
 * drizzle-kit config. Points at the LOCAL `src/store/schema.ts` (never a cross-
 * package path — that would break generation; see TECH.md). We hand-write the
 * SQL in `migrations/` because virtual tables (FTS5/vec0) and triggers added by
 * later slices are outside drizzle-kit's model; this config exists so
 * `drizzle-kit` tooling (studio, diff checks) can still read the table defs.
 */
export default defineConfig({
  dialect: "sqlite",
  schema: "./src/store/schema.ts",
  out: "./migrations",
});
