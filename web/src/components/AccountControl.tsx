import { useState } from "react";
import { LogIn, LogOut, ShieldCheck } from "lucide-react";
import { authClient } from "@/lib/authClient";
import { apiUrl } from "@/lib/api";

// First gated feature (GLI-203): a compact account widget that proves the whole
// auth path end to end — Google login via the shared auth service, the
// cross-app SSO cookie, and crucially server-side JWT validation: "Verify with
// API" mints a short-lived JWT from the session and calls the worker's gated
// /me, which checks it locally against the auth JWKS.

interface VerifiedUser {
  readonly id: string;
  readonly email: string;
  readonly name: string;
  readonly emailVerified: boolean;
  readonly image: string | null;
}

const PANEL = "rounded-lg bg-zinc-900/90 text-zinc-200 shadow-lg backdrop-blur-sm";

export function AccountControl() {
  const { data: session, isPending } = authClient.useSession();
  const [verified, setVerified] = useState<VerifiedUser | null>(null);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Avoid a flash of the signed-out state while the session resolves.
  if (isPending) return null;

  async function signIn() {
    await authClient.signIn.social({
      provider: "google",
      callbackURL: window.location.href,
    });
  }

  async function signOut() {
    await authClient.signOut();
    setVerified(null);
    setVerifyError(null);
  }

  async function verifyWithApi() {
    setBusy(true);
    setVerifyError(null);
    setVerified(null);
    try {
      const { data, error } = await authClient.token();
      if (error || !data?.token) throw new Error("could not mint token");
      const res = await fetch(apiUrl("/me"), {
        headers: { authorization: `Bearer ${data.token}` },
      });
      if (!res.ok) throw new Error(`worker returned ${res.status}`);
      const body = (await res.json()) as { user: VerifiedUser };
      setVerified(body.user);
    } catch (e) {
      setVerifyError(e instanceof Error ? e.message : "verification failed");
    } finally {
      setBusy(false);
    }
  }

  if (!session) {
    return (
      <div className={`${PANEL} p-2`}>
        <button
          onClick={signIn}
          className="flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium hover:bg-zinc-800"
        >
          <LogIn className="h-4 w-4" />
          Sign in
        </button>
      </div>
    );
  }

  return (
    <div className={`${PANEL} flex flex-col gap-2 p-3 text-sm`}>
      <div className="flex items-center gap-2">
        {session.user.image ? (
          <img
            src={session.user.image}
            alt=""
            className="h-6 w-6 rounded-full"
            referrerPolicy="no-referrer"
          />
        ) : null}
        <span className="text-zinc-300">
          Signed in as{" "}
          <span className="font-medium text-white">{session.user.name}</span>
        </span>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={verifyWithApi}
          disabled={busy}
          className="flex items-center gap-1.5 rounded-md bg-[#F0A93C] px-2.5 py-1 text-xs font-medium text-zinc-900 hover:bg-[#e09a2c] disabled:opacity-50"
        >
          <ShieldCheck className="h-3.5 w-3.5" />
          {busy ? "Verifying…" : "Verify with API"}
        </button>
        <button
          onClick={signOut}
          className="flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
        >
          <LogOut className="h-3.5 w-3.5" />
          Sign out
        </button>
      </div>
      {verified ? (
        <p className="text-xs text-emerald-400">
          API verified {verified.email} (sub {verified.id})
        </p>
      ) : null}
      {verifyError ? (
        <p className="text-xs text-red-400">API check failed: {verifyError}</p>
      ) : null}
    </div>
  );
}
