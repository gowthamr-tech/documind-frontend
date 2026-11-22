"use client";
import { useEffect } from "react";
import { Button } from "@/components/ui";

/** Shared body for Next.js error boundaries: never a blank screen, always a way forward. */
export function ErrorState({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div role="alert" className="mx-auto max-w-lg rounded-lg border border-red-200 bg-white p-6 shadow-sm">
      <h1 className="text-base font-semibold text-slate-900">Something went wrong</h1>
      <p className="mt-1 text-sm text-slate-600">This part of the page failed to load. Your documents are safe.</p>
      {error.digest && <p className="mt-2 font-mono text-xs text-slate-500">reference {error.digest}</p>}
      <div className="mt-4 flex gap-2">
        <Button onClick={reset}>Try again</Button>
        {/* Full reload on purpose: recovers even when client-side state is what broke. */}
        {/* eslint-disable-next-line @next/next/no-location-assign-relative-destination */}
        <Button variant="secondary" onClick={() => window.location.assign("/")}>Go to dashboard</Button>
      </div>
    </div>
  );
}
