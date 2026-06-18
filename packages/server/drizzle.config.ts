import { defineConfig } from "drizzle-kit";

// SQL in `migrations/` is hand-written because virtual tables (FTS5/vec0) and
// triggers are outside drizzle-kit's model; this config lets drizzle-kit tooling
// (studio, diff checks) still read the table defs.
export default defineConfig({
  dialect: "sqlite",
  schema: "./src/store/schema.ts",
  out: "./migrations",
});
