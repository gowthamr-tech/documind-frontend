// Realistic backend payloads (shapes taken from the FastAPI response models) for tests.
export const version = {
  id: "11111111-1111-4111-8111-111111111111", version_no: 1, sha256: "ab".repeat(32), mime_type: "application/pdf",
  size_bytes: 2048, original_filename: "report.pdf", page_count: 5, status: "ready", pipeline_version: "1",
  error: null, created_at: "2026-11-21T10:00:00Z",
};

export const documentSummary = {
  id: "22222222-2222-4222-8222-222222222222", title: "Annual report", tags: ["finance"], sensitivity: "normal",
  classification: null, created_at: "2026-11-21T10:00:00Z", updated_at: "2026-11-21T10:00:00Z",
  current_version: version, some_future_field: true,
};

export const citation = {
  citation_id: "S1", chunk_id: "c1", document_id: documentSummary.id, version_id: version.id,
  document_title: "Annual report", page: 3, page_end: 3, section: ["Results"], bbox: [0.1, 0.2, 0.3, 0.4],
  bbox_page: 3, chunk_type: "text", quote: "Revenue grew 12%.", quote_is_verbatim: true, verification: "verified",
};

export const answer = {
  answer_markdown: "Revenue grew **12%** [S1].",
  claims: [{ text: "Revenue grew 12%", citation_ids: ["S1"], status: "verified", invalid_citations: [],
    ungrounded_numbers: [], lexical_support: 0.9, judge: null, notes: [] }],
  citations: [citation],
  computations: {},
  verification_summary: "verified",
  limitations: [],
  route: ["supervisor", "retrieve", "reasoning", "verify", "respond"],
  plan: {},
  evidence_count: 4,
  conversation_id: "33333333-3333-4333-8333-333333333333",
  run_id: "44444444-4444-4444-8444-444444444444",
  message_id: "55555555-5555-4555-8555-555555555555",
  usage: { prompt_tokens: 100, completion_tokens: 20, cost_usd: null, latency_ms: 1500 },
};
