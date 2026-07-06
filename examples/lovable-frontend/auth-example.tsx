/**
 * Minimal Sign-in / Sign-up component for a Lovable frontend
 * using Pluto BaaS. Drop into `src/components/PlutoAuth.tsx`.
 */
import { useEffect, useState } from "react";
import { pluto } from "@/lib/pluto";
import type { Session } from "@pluto/js";

export function PlutoAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setSession(pluto.auth.getSession().data.session);
    const { data } = pluto.auth.onAuthStateChange((_ev, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const fn =
      mode === "signup"
        ? pluto.auth.signUp({ email, password })
        : pluto.auth.signInWithPassword({ email, password });
    const { error } = await fn;
    setBusy(false);
    if (error) setError(error.message);
  }

  if (session) {
    return (
      <div className="p-4 border rounded">
        <p>Signed in as {session.user.email}</p>
        <button onClick={() => pluto.auth.signOut()}>Sign out</button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="p-4 border rounded space-y-3 max-w-sm">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setMode("signin")}
          disabled={mode === "signin"}
        >
          Sign in
        </button>
        <button
          type="button"
          onClick={() => setMode("signup")}
          disabled={mode === "signup"}
        >
          Sign up
        </button>
      </div>
      <input
        type="email"
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
      />
      <input
        type="password"
        placeholder="Password (min 8)"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        minLength={8}
        required
      />
      {error && <p className="text-red-600 text-sm">{error}</p>}
      <button type="submit" disabled={busy}>
        {busy ? "…" : mode === "signup" ? "Create account" : "Sign in"}
      </button>
    </form>
  );
}
