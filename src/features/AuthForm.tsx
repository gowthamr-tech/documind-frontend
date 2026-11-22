"use client";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button, ErrorBox, Field, Input } from "@/components/ui";
import { ApiError, toError } from "@/lib/api";
import { safeNext } from "@/lib/url";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const qc = useQueryClient();
  const next = safeNext(useSearchParams().get("next"));
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    const body = Object.fromEntries(new FormData(e.currentTarget).entries());
    try {
      const res = await fetch(`/api/auth/${mode}`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
      });
      if (!res.ok) {
        setError(await toError(res));
        return;
      }
      qc.clear(); // never show a previous account's cached data
      router.replace(next);
    } catch {
      setError(new ApiError(0, "Network error", "Could not reach the server. Check your connection and try again."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-screen place-items-center px-4">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <div>
          <h1 className="text-lg font-semibold">DocuMind <span className="text-brand-600">AI</span></h1>
          <p className="text-sm text-slate-500">{mode === "login" ? "Sign in to your workspace" : "Create a workspace"}</p>
        </div>
        <Field label="Email"><Input name="email" type="email" autoComplete="email" maxLength={320} required /></Field>
        <Field label="Password" hint={mode === "register" ? "At least 12 characters" : undefined}>
          <Input name="password" type="password" minLength={mode === "register" ? 12 : 1} maxLength={128}
            autoComplete={mode === "login" ? "current-password" : "new-password"} required />
        </Field>
        {mode === "register" && <Field label="Organization name"><Input name="org_name" minLength={2} maxLength={200} required /></Field>}
        {error != null && <ErrorBox error={error} />}
        <Button type="submit" disabled={busy} className="w-full">{busy ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}</Button>
        <p className="text-center text-sm text-slate-500">
          {mode === "login" ? <>No account? <Link className="text-brand-700 hover:underline" href="/register">Register</Link></>
            : <>Have an account? <Link className="text-brand-700 hover:underline" href="/login">Sign in</Link></>}
        </p>
      </form>
    </div>
  );
}
