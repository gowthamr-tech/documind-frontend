"use client";
import { Badge, Spinner } from "@/components/ui";
import { AnswerCard } from "@/features/AnswerCard";
import type { Turn } from "@/hooks/useAsk";

const LABEL: Record<string, string> = {
  supervisor: "Understanding the question", approval_gate: "Checking access", classify_documents: "Choosing documents",
  retrieve: "Searching documents", table_analysis: "Reading tables", chart_analysis: "Reading charts",
  reasoning: "Drafting an answer", verify: "Verifying every claim", respond: "Finalising",
};

export function Conversation({ turns }: { turns: Turn[] }) {
  return (
    <div className="space-y-6">
      {turns.map((t, i) => (
        <div key={i} className="space-y-2">
          <div className="ml-auto max-w-[85%] rounded-lg bg-brand-600 px-3 py-2 text-sm text-white">{t.question}</div>
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            {t.steps.length > 0 && !t.answer && (
              <ol className="mb-2 flex flex-wrap gap-1">{t.steps.map((s, j) => <li key={j}><Badge>{LABEL[s.node] ?? s.node}</Badge></li>)}</ol>
            )}
            {t.state === "failed" ? <p role="alert" className="text-sm text-bad">{t.error}</p>
              : t.state === "stopped" ? <p className="text-sm text-slate-500">{t.error}</p>
              : t.pending ? <p className="text-sm text-warn">This question involves confidential documents and is waiting for an administrator&apos;s approval (request {t.pending.approval_id.slice(0, 8)}).</p>
              : t.answer ? <AnswerCard a={t.answer} />
              : t.partial ? <p className="text-sm">{t.partial}</p>
              : <Spinner label="Working…" />}
          </div>
        </div>
      ))}
    </div>
  );
}
