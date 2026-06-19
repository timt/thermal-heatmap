import { Hono } from "hono";
import { requireUser, type AuthVariables } from "../auth.ts";

// Gated identity endpoint — the first authenticated route, proving server-side
// JWT validation end to end (GLI-203). `requireUser` rejects anything without a
// valid Bearer token before this handler runs, so `user` is always present.
export const meRoute = new Hono<{ Variables: AuthVariables }>();

meRoute.get("/me", requireUser(), (c) => {
  return c.json({ user: c.get("user") });
});
