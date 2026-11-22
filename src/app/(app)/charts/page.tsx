"use client";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Empty, ErrorBox, PageHeader, Spinner } from "@/components/ui";
import { DocSelect } from "@/features/DocSelect";
import { FigureCard } from "@/features/FigureCard";
import { api } from "@/lib/api";
import { FigureList } from "@/lib/contracts";

export default function ChartsPage() {
  const [doc, setDoc] = useState("");
  const figs = useQuery({ queryKey: ["figures", doc], queryFn: ({ signal }) => api(`documents/${doc}/charts`, FigureList, { signal }), enabled: !!doc });
  return (
    <>
      <PageHeader title="Chart analysis" subtitle="Chart readings are cross-checked against OCR; unverified values are labelled as estimates" />
      <DocSelect value={doc} onChange={setDoc} />
      <div className="mt-4 space-y-4">
        {!doc ? <Empty title="Choose a document to see its charts and figures" /> : figs.isLoading ? <Spinner /> : figs.error ? <ErrorBox error={figs.error} onRetry={() => void figs.refetch()} />
          : !figs.data?.length ? <Empty title="No charts or figures were found" />
          : figs.data.map((f) => <FigureCard key={f.id} docId={doc} f={f} />)}
      </div>
    </>
  );
}
