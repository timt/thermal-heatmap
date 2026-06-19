import { test } from "node:test";
import assert from "node:assert/strict";
import { Hono } from "hono";
import {
  SignJWT,
  exportJWK,
  generateKeyPair,
  createLocalJWKSet,
  type JWTVerifyGetKey,
} from "jose";
import { requireUser, type AuthVariables } from "../src/auth.ts";

const ISSUER = "https://auth.gliderzone.com";
const AUDIENCE = "https://auth.gliderzone.com";
const KID = "test-key-1";

// One Ed25519 keypair stands in for the auth service's signing key; its public
// half becomes the local JWKS we hand the middleware (no network, no DB).
const { publicKey, privateKey } = await generateKeyPair("EdDSA");
const jwk = { ...(await exportJWK(publicKey)), kid: KID, alg: "EdDSA" };
const jwks: JWTVerifyGetKey = createLocalJWKSet({ keys: [jwk] });

// A second, unrelated key — tokens signed with this must be rejected.
const other = await generateKeyPair("EdDSA");

interface SignOptions {
  readonly issuer?: string;
  readonly audience?: string;
  readonly expirationTime?: string | number;
  readonly signWith?: CryptoKey;
}

async function signToken(options: SignOptions = {}): Promise<string> {
  return new SignJWT({
    email: "tim@example.com",
    name: "Tim Tennant",
    emailVerified: true,
    image: "https://example.com/avatar.png",
  })
    .setProtectedHeader({ alg: "EdDSA", kid: KID })
    .setSubject("user-123")
    .setIssuer(options.issuer ?? ISSUER)
    .setAudience(options.audience ?? AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(options.expirationTime ?? "15m")
    .sign(options.signWith ?? privateKey);
}

// Minimal app exercising the middleware on a gated route, JWKS injected.
function makeApp() {
  const app = new Hono<{ Variables: AuthVariables }>();
  app.get(
    "/me",
    requireUser({ jwks, issuer: ISSUER, audience: AUDIENCE }),
    (c) => c.json({ user: c.get("user") }),
  );
  return app;
}

function authed(token: string): RequestInit {
  return { headers: { authorization: `Bearer ${token}` } };
}

test("accepts a valid token and exposes the claim-contract identity", async () => {
  const res = await makeApp().request("/me", authed(await signToken()));
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), {
    user: {
      id: "user-123",
      email: "tim@example.com",
      name: "Tim Tennant",
      emailVerified: true,
      image: "https://example.com/avatar.png",
    },
  });
});

test("rejects a request with no Authorization header", async () => {
  const res = await makeApp().request("/me");
  assert.equal(res.status, 401);
});

test("rejects a malformed Authorization header", async () => {
  const res = await makeApp().request("/me", {
    headers: { authorization: "Token abc" },
  });
  assert.equal(res.status, 401);
});

test("rejects a token signed by an unknown key", async () => {
  const token = await signToken({ signWith: other.privateKey });
  const res = await makeApp().request("/me", authed(token));
  assert.equal(res.status, 401);
});

test("rejects an expired token", async () => {
  const expired = await signToken({
    expirationTime: Math.floor(Date.now() / 1000) - 60,
  });
  const res = await makeApp().request("/me", authed(expired));
  assert.equal(res.status, 401);
});

test("rejects a token from the wrong issuer", async () => {
  const token = await signToken({ issuer: "https://evil.example.com" });
  const res = await makeApp().request("/me", authed(token));
  assert.equal(res.status, 401);
});

test("rejects a token for the wrong audience", async () => {
  const token = await signToken({ audience: "https://other.gliderzone.com" });
  const res = await makeApp().request("/me", authed(token));
  assert.equal(res.status, 401);
});
