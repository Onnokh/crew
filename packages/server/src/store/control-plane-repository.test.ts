import Database from "better-sqlite3";
import { beforeEach, describe, expect, it } from "vitest";
import { createAuth } from "../auth/better-auth.js";
import { ControlPlaneRepository } from "./control-plane-repository.js";
import { migrate } from "./migrate.js";

let raw: Database.Database;
let controlPlane: ControlPlaneRepository;

beforeEach(() => {
  raw = new Database(":memory:");
  raw.pragma("foreign_keys = ON");
  migrate(raw, "control-plane");
  controlPlane = new ControlPlaneRepository(raw);
});

describe("ControlPlaneRepository", () => {
  it("resolves a User's display name and role by id, or null", async () => {
    const auth = createAuth(raw, {
      secret: "test-secret-test-secret-test-secret",
      baseURL: "http://localhost",
    });
    const signUp = await auth.api.signUpEmail({
      body: { email: "alice@test.local", password: "password1234", name: "Alice" },
    });
    expect(controlPlane.getUser(signUp.user.id)).toMatchObject({
      id: signUp.user.id,
      name: "Alice",
    });
    expect(controlPlane.getUser("user_nobody")).toBeNull();
  });

  it("resolves a User's Team via their membership, or null with no membership", () => {
    controlPlane.createOrg("org_1", "Org", 0);
    controlPlane.createTeam({ id: "team_1", orgId: "org_1", name: "Team" }, 0);
    // Insert a bare user row so the membership FK holds.
    raw
      .prepare(
        `INSERT INTO "user" (id, name, email, emailVerified, createdAt, updatedAt)
         VALUES ('user_1', 'U', 'u@test.local', 0, 0, 0)`,
      )
      .run();

    expect(controlPlane.getTeamForUser("user_1")).toBeNull();
    controlPlane.addMembership("user_1", "team_1", 0);
    expect(controlPlane.getTeamForUser("user_1")).toEqual({
      id: "team_1",
      orgId: "org_1",
      name: "Team",
    });
  });

  it("firstTeam returns null on a fresh DB and the earliest Team thereafter", () => {
    expect(controlPlane.firstTeam()).toBeNull();
    controlPlane.createOrg("org_1", "Org", 0);
    controlPlane.createTeam({ id: "team_a", orgId: "org_1", name: "A" }, 1);
    controlPlane.createTeam({ id: "team_b", orgId: "org_1", name: "B" }, 2);
    expect(controlPlane.firstTeam()?.id).toBe("team_a");
  });

  it("membership is 1:1 — a second addMembership is ignored", () => {
    controlPlane.createOrg("org_1", "Org", 0);
    controlPlane.createTeam({ id: "team_1", orgId: "org_1", name: "T1" }, 0);
    controlPlane.createTeam({ id: "team_2", orgId: "org_1", name: "T2" }, 0);
    raw
      .prepare(
        `INSERT INTO "user" (id, name, email, emailVerified, createdAt, updatedAt)
         VALUES ('user_1', 'U', 'u@test.local', 0, 0, 0)`,
      )
      .run();
    controlPlane.addMembership("user_1", "team_1", 0);
    controlPlane.addMembership("user_1", "team_2", 0);
    expect(controlPlane.getTeamForUser("user_1")?.id).toBe("team_1");
  });
});
