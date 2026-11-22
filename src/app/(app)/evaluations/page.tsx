"use client";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Badge, Card, Empty, ErrorBox, PageHeader, Spinner } from "@/components/ui";
import { api, isApiError } from "@/lib/api";
import { EvalRunList } from "@/lib/contracts";

export default function EvaluationsPage() {
  const runs = useQuery({
    queryKey: ["evals"],
    queryFn: ({ signal }) => api("evaluations", EvalRunList, { signal }),
    retry: (n, err) => !isApiError(err, 404) && n < 1,
  });
  const [open, setOpen] = useState<string | null>(null);
  return (
    <>
      <PageHeader title="Evaluation dashboard" subtitle="Measured results only — each run records its dataset hash, configuration and code version" />
      {runs.isLoading ? <Spinner /> : isApiError(runs.error, 404) ? (
        <Empty title="Evaluation results are not available yet">The backend does not expose an evaluation API yet (Phase 7). Offline benchmark reports live in the backend repository under <code>evaluation/results/</code>.</Empty>
      ) : runs.error ? <ErrorBox error={runs.error} onRetry={() => void runs.refetch()} /> : !runs.data?.length ? (
        <Empty title="No evaluation runs recorded yet">Run <code>python -m benchmarks.run_all</code> in the backend to record one.</Empty>
      ) : (
        <div className="space-y-4">
          {runs.data.map((r) => {
            const rows = r.summary.rows ?? [];
            const cols = rows[0] ? Object.keys(rows[0]) : [];
            return (
              <Card key={r.id} title={<span>{r.experiment} <span className="font-normal text-slate-500">· {new Date(r.started_at).toLocaleString()}</span></span>}
                actions={<><Badge>code {r.git}</Badge><button className="text-sm text-brand-700 hover:underline" onClick={() => setOpen(open === r.id ? null : r.id)}>{open === r.id ? "Hide" : "Details"}</button></>}>
                {r.summary.headline && (
                  <div className="mb-3 grid grid-cols-2 gap-3 md:grid-cols-4">
                    {Object.entries(r.summary.headline).map(([k, v]) => (
                      <div key={k} className="rounded border border-slate-200 p-3"><p className="text-xs text-slate-500">{k}</p><p className="text-lg font-semibold tabular-nums">{typeof v === "number" ? v.toFixed(3) : String(v)}</p></div>
                    ))}
                  </div>
                )}
                <p className="text-xs text-slate-500">Dataset: {Object.entries(r.dataset).map(([k, v]) => `${k}=${String(v)}`).join(" · ")}</p>
                {open === r.id && rows.length > 0 && (
                  <div className="mt-3 overflow-x-auto">
                    <table className="min-w-full text-xs">
                      <thead><tr>{cols.map((c) => <th key={c} className="border-b border-slate-200 px-2 py-1 text-left">{c}</th>)}</tr></thead>
                      <tbody>{rows.map((row, i) => <tr key={i}>{cols.map((c) => <td key={c} className="border-b border-slate-100 px-2 py-1 tabular-nums">{typeof row[c] === "number" ? (row[c] as number).toFixed(3) : String(row[c])}</td>)}</tr>)}</tbody>
                    </table>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
