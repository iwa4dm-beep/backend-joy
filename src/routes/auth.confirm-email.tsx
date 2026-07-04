import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Zap, CheckCircle2, XCircle } from "lucide-react";
import { isLive, live } from "@/lib/pluto/live";

export const Route = createFileRoute("/auth/confirm-email")({
  ssr: false,
  head: () => ({ meta: [{ title: "Confirm your email — Pluto BaaS" }] }),
  component: ConfirmEmailPage,
});

function ConfirmEmailPage() {
  const [state, setState] = useState<"working" | "ok" | "error">("working");
  const [err, setErr] = useState<string>("");

  useEffect(() => {
    const hash = window.location.hash.replace(/^#/, "");
    const token = new URLSearchParams(hash).get("token") ?? "";
    if (!token) { setState("error"); setErr("Missing token"); return; }
    if (!isLive()) { setState("ok"); return; }
    live.auth.confirmEmail(token)
      .then(() => setState("ok"))
      .catch((e: Error) => { setState("error"); setErr(e.message); });
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2 justify-center mb-8">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Zap className="h-4 w-4" />
          </div>
          <span className="font-semibold tracking-tight text-lg">Pluto BaaS</span>
        </div>

        <div className="rounded-lg border border-border bg-card p-6 text-center space-y-3">
          {state === "working" && <div className="text-sm text-muted-foreground py-6">Confirming your email…</div>}
          {state === "ok" && (
            <>
              <CheckCircle2 className="h-8 w-8 text-primary mx-auto" />
              <div className="text-sm font-medium">Email confirmed</div>
              <Link to="/dashboard" className="text-xs text-primary hover:underline">Go to dashboard</Link>
            </>
          )}
          {state === "error" && (
            <>
              <XCircle className="h-8 w-8 text-destructive mx-auto" />
              <div className="text-sm font-medium">Could not confirm email</div>
              <div className="text-xs text-muted-foreground">{err || "Invalid or expired token."}</div>
              <Link to="/auth" className="text-xs text-primary hover:underline">Back to sign in</Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
