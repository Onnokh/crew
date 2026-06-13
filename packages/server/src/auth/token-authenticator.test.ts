import type { IncomingMessage } from "node:http";
import { describe, expect, it } from "vitest";
import type { User } from "../core/user.js";
import { TokenAuthenticator, hashToken } from "./token-authenticator.js";
import type { TokenStore } from "./token-authenticator.js";

const ALICE: User = { id: "user_alice", name: "Alice" };

function storeWith(token: string, user: User): TokenStore {
  const hash = hashToken(token);
  return {
    async findUserByTokenHash(tokenHash) {
      return tokenHash === hash ? user : null;
    },
  };
}

function requestWith(authorization?: string): IncomingMessage {
  return { headers: authorization ? { authorization } : {} } as IncomingMessage;
}

describe("TokenAuthenticator", () => {
  it("resolves a valid bearer token to its User", async () => {
    const auth = new TokenAuthenticator(storeWith("secret", ALICE));
    expect(await auth.authenticate(requestWith("Bearer secret"))).toEqual(ALICE);
  });

  it("rejects an unknown token", async () => {
    const auth = new TokenAuthenticator(storeWith("secret", ALICE));
    expect(await auth.authenticate(requestWith("Bearer wrong"))).toBeNull();
  });

  it("rejects a missing Authorization header", async () => {
    const auth = new TokenAuthenticator(storeWith("secret", ALICE));
    expect(await auth.authenticate(requestWith())).toBeNull();
  });

  it("rejects a malformed (non-Bearer) header", async () => {
    const auth = new TokenAuthenticator(storeWith("secret", ALICE));
    expect(await auth.authenticate(requestWith("Basic secret"))).toBeNull();
  });

  it("never reveals the raw token (hash differs from input)", () => {
    expect(hashToken("secret")).not.toBe("secret");
    expect(hashToken("secret")).toHaveLength(64);
  });
});
