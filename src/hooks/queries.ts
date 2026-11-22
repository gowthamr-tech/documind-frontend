"use client";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { DocumentDetail, DocumentPage, Me, type VersionStatus } from "@/lib/contracts";

export type { Me } from "@/lib/contracts";

const IN_FLIGHT: ReadonlySet<VersionStatus> = new Set(["uploaded", "queued", "processing"]);

export const useMe = () => useQuery({ queryKey: ["me"], queryFn: () => api("auth/me", Me), staleTime: 60_000 });

export const useDocuments = (params: Record<string, string> = {}) =>
  useQuery({
    queryKey: ["documents", params],
    queryFn: ({ signal }) => api(`documents?${new URLSearchParams({ limit: "100", ...params })}`, DocumentPage, { signal }),
    // keep polling while anything is still processing, but stop hammering a failing backend
    refetchInterval: (q) =>
      !q.state.error && q.state.data?.items.some((d) => d.current_version && IN_FLIGHT.has(d.current_version.status))
        ? 2500
        : false,
  });

export const useDocument = (id: string) =>
  useQuery({ queryKey: ["document", id], queryFn: ({ signal }) => api(`documents/${encodeURIComponent(id)}`, DocumentDetail, { signal }) });
