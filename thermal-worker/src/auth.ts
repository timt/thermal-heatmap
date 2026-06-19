// Cross-service identity for the thermal-heatmap worker (GLI-203 / GLI-176).
//
// We verify the caller's identity *locally* against the auth service's JWKS —
// no DB join into auth, no request-time callback. The shared client
// (@gliderzone/auth-client) mints a short-lived EdDSA JWT via the session cookie;
// the browser sends it as `Authorization: Bearer <token>` and we check it
// against https://auth.gliderzone.com/.well-known/jwks.json.
//
// Claim contract (pinned by the auth service, GLI-171): sub, email, name,
// emailVerified, image, iss/aud = the auth baseURL, exp = 15m. Don't widen the
// reliance here without updating that contract.

import { createMiddleware } from "hono/factory";
import {
  createRemoteJWKSet,
  jwtVerify,
  type JWTPayload,
  type JWTVerifyGetKey,
} from "jose";

/** Auth service base URL — overridable so local dev can point at localhost. */
export const AUTH_BASE_URL =
  process.env.AUTH_BASE_URL ?? "https://auth.gliderzone.com";

/** The identity we expose to gated route handlers. */
export interface AuthUser {
  readonly id: string;
  readonly email: string;
  readonly name: string;
  readonly emailVerified: boolean;
  readonly image: string | null;
}

/** Hono context variables set by `requireUser`. */
export interface AuthVariables {
  user: AuthUser;
}

export interface RequireUserOptions {
  /** JWKS resolver. Defaults to the auth service's remote set; injected in tests. */
  readonly jwks?: JWTVerifyGetKey;
  readonly issuer?: string;
  readonly audience?: string;
}

const asString = (value: unknown): string | undefined =>
  typeof value === "string" ? value : undefined;

function toAuthUser(payload: JWTPayload): AuthUser {
  return {
    id: payload.sub ?? "",
    email: asString(payload.email) ?? "",
    name: asString(payload.name) ?? "",
    emailVerified: payload.emailVerified === true,
    image: asString(payload.image) ?? null,
  };
}

function bearerToken(header: string | undefined): string | undefined {
  if (!header?.startsWith("Bearer ")) return undefined;
  const token = header.slice("Bearer ".length).trim();
  return token.length > 0 ? token : undefined;
}

/**
 * Hono middleware that requires a valid auth JWT. On success the verified
 * identity is available via `c.get("user")`; otherwise the request is rejected
 * with 401 before reaching the handler. The remote JWKS is created once per
 * `requireUser()` call and cached by `jose` (it refetches keys only on an
 * unknown `kid`), so reuse a single instance across routes.
 */
export function requireUser(options: RequireUserOptions = {}) {
  const jwks =
    options.jwks ??
    createRemoteJWKSet(new URL(`${AUTH_BASE_URL}/.well-known/jwks.json`));
  const issuer = options.issuer ?? AUTH_BASE_URL;
  const audience = options.audience ?? AUTH_BASE_URL;

  return createMiddleware<{ Variables: AuthVariables }>(async (c, next) => {
    const token = bearerToken(c.req.header("authorization"));
    if (!token) {
      return c.json({ error: "missing bearer token" }, 401);
    }

    try {
      const { payload } = await jwtVerify(token, jwks, { issuer, audience });
      c.set("user", toAuthUser(payload));
    } catch {
      return c.json({ error: "invalid token" }, 401);
    }

    await next();
  });
}
