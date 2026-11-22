"use client";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { cx, ErrorBox, Spinner } from "@/components/ui";
import { useMe } from "@/hooks/queries";
import { isApiError } from "@/lib/api";

const NAV = [
  ["/", "Dashboard"], ["/documents", "Documents"], ["/documents/upload", "Upload"], ["/chat", "AI Chat"],
  ["/compare", "Compare"], ["/tables", "Extracted tables"], ["/charts", "Chart analysis"],
  ["/processing", "Processing history"], ["/evaluations", "Evaluation"],
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const me = useMe();
  const qc = useQueryClient();
  const [signingOut, setSigningOut] = useState(false);
  const unauthenticated = isApiError(me.error, 401);

  useEffect(() => {
    if (unauthenticated) router.replace(`/login?next=${encodeURIComponent(path)}`);
  }, [unauthenticated, path, router]);

  async function logout() {
    setSigningOut(true);
    // The BFF clears the cookies even if the backend is unreachable, so failure here is harmless.
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    qc.clear(); // drop the previous user's cached data before anyone else signs in
    router.replace("/login");
  }

  if (me.isLoading || unauthenticated) return <div className="grid h-screen place-items-center"><Spinner /></div>;
  if (me.error) {
    return (
      <div className="mx-auto max-w-md p-8">
        <ErrorBox error={me.error} onRetry={() => void me.refetch()} />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-56 shrink-0 flex-col border-r border-slate-200 bg-white md:flex">
        <div className="px-4 py-4 text-base font-semibold text-slate-900">DocuMind <span className="text-brand-600">AI</span></div>
        <nav className="flex-1 space-y-0.5 px-2" aria-label="Main">
          {NAV.map(([href, label]) => {
            const active = href === "/" ? path === "/" : path === href || (path.startsWith(href) && !(href === "/documents" && path.startsWith("/documents/upload")));
            return (
              <Link key={href} href={href} aria-current={active ? "page" : undefined}
                className={cx("block rounded-md px-3 py-2 text-sm", active ? "bg-brand-50 font-medium text-brand-700" : "text-slate-600 hover:bg-slate-50")}>
                {label}
              </Link>
            );
          })}
        </nav>
        {me.data && (
          <div className="border-t border-slate-100 p-3 text-xs text-slate-500">
            <p className="truncate font-medium text-slate-700">{me.data.email}</p>
            <p className="truncate">{me.data.org_name} · {me.data.role}</p>
            <button onClick={() => void logout()} disabled={signingOut} className="mt-2 text-brand-700 hover:underline disabled:opacity-60">
              {signingOut ? "Signing out…" : "Sign out"}
            </button>
          </div>
        )}
      </aside>
      <main className="min-w-0 flex-1 px-4 py-6 md:px-8">{children}</main>
    </div>
  );
}
