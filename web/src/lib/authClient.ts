import {
  createGlidingAuthClient,
  resolveAuthBaseURL,
} from "@gliderzone/auth-client";

// Our own client instance (rather than the package's prod-pinned singleton) so
// VITE_AUTH_URL can repoint it at a local auth service during development.
// Defaults to https://auth.gliderzone.com.
export const authClient = createGlidingAuthClient({
  baseURL: resolveAuthBaseURL(undefined, {
    VITE_AUTH_URL: import.meta.env.VITE_AUTH_URL,
  }),
});
