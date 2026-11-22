"use client";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState, type DragEvent } from "react";
import { DocStatus } from "@/components/StatusBadge";
import { Badge, Button, Card, PageHeader } from "@/components/ui";
import { api, errorMessage, isAbort } from "@/lib/api";
import { StatusOut, UploadOut, type VersionStatus } from "@/lib/contracts";
import { formatBytes } from "@/lib/table";
import { validateUpload, ACCEPT, MAX_UPLOAD_BYTES } from "@/lib/upload";

interface Item {
  key: string; file: File; state: "pending" | "uploading" | "done" | "error"; message?: string;
  documentId?: string; status?: VersionStatus; dedup?: boolean; stage?: string;
}

const POLL_MS = 2000;
const POLL_LIMIT = 240; // ~8 minutes
const MAX_POLL_ERRORS = 5;
const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    const t = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => { clearTimeout(t); resolve(); }, { once: true });
  });

export default function UploadPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const lifetime = useRef<AbortController | null>(null);
  const qc = useQueryClient();

  // Stop uploads and status polling when the user leaves the page.
  useEffect(() => {
    const controller = new AbortController();
    lifetime.current = controller;
    return () => controller.abort();
  }, []);

  const update = (key: string, patch: Partial<Item>) =>
    setItems((xs) => xs.map((x) => (x.key === key ? { ...x, ...patch } : x)));

  function add(files: FileList | null) {
    if (!files?.length) return;
    const added = Array.from(files).map((file): Item => {
      const problem = validateUpload(file);
      return { key: crypto.randomUUID(), file, state: problem ? "error" : "pending", message: problem ?? undefined };
    });
    setItems((xs) => [...xs, ...added]);
  }

  async function poll(key: string, documentId: string, signal: AbortSignal) {
    let errors = 0;
    for (let n = 0; n < POLL_LIMIT && !signal.aborted; n++) {
      try {
        const s = await api(`documents/${encodeURIComponent(documentId)}/status`, StatusOut, { signal });
        errors = 0;
        const running = s.stages.find((st) => st.status === "running");
        update(key, { status: s.status, stage: running?.stage, message: s.error?.message });
        if (s.status === "ready" || s.status === "failed") break;
      } catch (err) {
        if (isAbort(err)) return;
        if (++errors >= MAX_POLL_ERRORS) {
          update(key, { message: `Lost track of processing: ${errorMessage(err)} It will continue in the background.` });
          break;
        }
      }
      await sleep(POLL_MS * Math.min(2 ** errors, 8), signal);
    }
    void qc.invalidateQueries({ queryKey: ["documents"] });
  }

  async function uploadOne(it: Item, signal: AbortSignal) {
    update(it.key, { state: "uploading", message: undefined });
    const form = new FormData();
    form.append("file", it.file);
    try {
      const out = await api("documents/upload", UploadOut, { method: "POST", body: form, signal });
      update(it.key, { state: "done", documentId: out.document_id, status: out.status, dedup: out.deduplicated });
      if (!out.deduplicated) void poll(it.key, out.document_id, signal);
    } catch (err) {
      if (isAbort(err)) return;
      update(it.key, { state: "error", message: errorMessage(err) });
    }
  }

  function uploadAll() {
    const signal = lifetime.current?.signal;
    if (!signal) return;
    const pending = items.filter((it) => it.state === "pending");
    // Mark them first so a quick double click can't upload the same file twice.
    setItems((xs) => xs.map((x) => (pending.some((p) => p.key === x.key) ? { ...x, state: "uploading" } : x)));
    void Promise.allSettled(pending.map((it) => uploadOne(it, signal)));
  }

  const onDrop = (e: DragEvent) => { e.preventDefault(); setDrag(false); add(e.dataTransfer.files); };

  return (
    <>
      <PageHeader title="Upload documents" subtitle={`PDF, scanned PDF, PNG/JPEG, DOCX, XLSX, PPTX — up to ${formatBytes(MAX_UPLOAD_BYTES)} each`} />
      <div
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={onDrop}
        className={`grid place-items-center rounded-lg border-2 border-dashed p-10 text-center ${drag ? "border-brand-500 bg-brand-50" : "border-slate-300 bg-white"}`}>
        <p className="text-sm text-slate-600">Drag files here, or</p>
        <Button variant="secondary" className="mt-2" onClick={() => input.current?.click()}>Choose files</Button>
        <input ref={input} type="file" multiple accept={ACCEPT} hidden aria-label="Choose files"
          onChange={(e) => { add(e.target.files); e.target.value = ""; }} />
      </div>
      {items.length > 0 && (
        <Card className="mt-4" title={`${items.length} file(s)`} actions={<Button onClick={uploadAll} disabled={!items.some((i) => i.state === "pending")}>Upload</Button>}>
          <ul className="divide-y divide-slate-100">
            {items.map((it) => (
              <li key={it.key} className="flex flex-wrap items-center justify-between gap-3 py-2 text-sm">
                <span className="min-w-0 truncate">{it.file.name} <span className="text-slate-400">· {formatBytes(it.file.size)}</span></span>
                <span className="flex items-center gap-2">
                  {it.state === "uploading" && <Badge tone="info">Uploading…</Badge>}
                  {it.state === "error" && <Badge tone="bad">Rejected</Badge>}
                  {it.dedup && <Badge tone="info" title="Identical content already exists">Already uploaded</Badge>}
                  {it.status && <DocStatus status={it.status} />}
                  {it.stage && it.status === "processing" && <span className="text-xs text-slate-500">{it.stage}</span>}
                  {it.documentId && <Link className="text-brand-700 hover:underline" href={`/documents/${it.documentId}`}>Open</Link>}
                </span>
                {it.message && <p role={it.state === "error" ? "alert" : undefined} className="w-full text-xs text-bad">{it.message}</p>}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
