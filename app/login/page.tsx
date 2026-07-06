"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Icon } from "@/components/icons";

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const params = useSearchParams();
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        const next = params.get("next");
        // Full navigation so middleware re-evaluates with the new cookie.
        window.location.href = next && next.startsWith("/") ? next : "/";
        return;
      }
      const data = await res.json().catch(() => ({}));
      setError(
        res.status === 401
          ? "Incorrect password."
          : data.message ?? "Login failed.",
      );
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-dvh grid place-items-center px-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-6 text-center">
          <span className="grid place-items-center w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-400 to-emerald-600 shadow-lg shadow-emerald-500/30 mb-3">
            <svg viewBox="0 0 24 24" className="w-6 h-6 text-[#04130d]" fill="currentColor">
              <path d="M12 2a10 10 0 0 0-8.7 15l-1.2 4.4a.8.8 0 0 0 1 1l4.5-1.2A10 10 0 1 0 12 2Zm0 3.3a1.4 1.4 0 1 1 0 2.8 1.4 1.4 0 0 1 0-2.8Zm2 12.2h-4a.9.9 0 0 1 0-1.8h.6v-4h-.5a.9.9 0 0 1 0-1.8h1.4c.5 0 .9.4.9.9v4.9h1.6a.9.9 0 0 1 0 1.8Z" />
            </svg>
          </span>
          <h1 className="text-lg font-bold">Wappr</h1>
          <p className="text-sm muted">Enter your password to continue</p>
        </div>

        <form onSubmit={handleSubmit} className="card p-6 space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="password" className="text-sm font-medium">
              Password
            </label>
            <input
              id="password"
              type="password"
              autoFocus
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input w-full"
              placeholder="••••••••"
            />
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <button
            type="submit"
            disabled={loading || password.length === 0}
            className="btn btn-primary w-full justify-center"
          >
            {loading ? (
              <>
                <Icon name="spinner" className="w-4 h-4 animate-spin" /> Signing in…
              </>
            ) : (
              "Sign in"
            )}
          </button>
        </form>

        <p className="text-[11px] muted text-center mt-4 leading-relaxed">
          Protect this over HTTPS. A password on plain HTTP can be intercepted.
        </p>
      </div>
    </div>
  );
}
