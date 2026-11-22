import { describe, expect, it } from "vitest";
import { Answer, DocumentPage, FigureInfo, TableInfo, TokenPair } from "./contracts";
import { answer, documentSummary } from "@/test/fixtures";

describe("contracts", () => {
  it("accepts real backend payloads and strips unknown (additive) fields", () => {
    const page = DocumentPage.parse({ items: [documentSummary], next_cursor: null });
    expect(page.items[0]?.title).toBe("Annual report");
    expect(page.items[0]).not.toHaveProperty("some_future_field");
    expect(Answer.parse(answer).citations[0]?.verification).toBe("verified");
  });

  it("rejects drift in fields the UI depends on", () => {
    expect(DocumentPage.safeParse({ items: [{ ...documentSummary, title: 42 }], next_cursor: null }).success).toBe(false);
    expect(Answer.safeParse({}).success).toBe(false); // backend sends {} when the graph produced no final
    expect(Answer.safeParse({ ...answer, verification_summary: "trust_me" }).success).toBe(false);
    expect(TokenPair.safeParse({ access_token: "a", refresh_token: "", expires_in: 900 }).success).toBe(false);
  });

  it("defaults optional collections the backend may omit", () => {
    const t = TableInfo.parse({
      id: "t1", page_start: 1, page_end: 1, bbox: null, caption: null, footnotes: [], units: null, header_depth: 1,
      n_rows: 0, n_cols: 0, section_path: [], markdown: "", stitched_from: 1,
    });
    expect(t.cells).toEqual([]);
  });

  it("tolerates malformed model-generated chart data instead of failing the whole response", () => {
    const base = {
      id: "f1", page_no: 2, bbox: null, figure_type: "chart", classifier_label: null, classifier_confidence: null,
      caption: null, section_path: [], analysis_status: "succeeded", description: null, values_are_estimated: true,
      validation: null, model: "gemini", error: null,
    };
    expect(FigureInfo.parse({ ...base, chart: { chart_type: "bar" } }).chart).toEqual({
      chart_type: "bar", title: null, series: [], trends: [],
    });
    expect(FigureInfo.parse({ ...base, chart: "not an object" }).chart).toBeNull();
    const pts = FigureInfo.parse({ ...base, chart: { chart_type: "line", series: [{ name: "Rev", points: [{ x: 2024, y: "n/a" }] }] } });
    expect(pts.chart?.series[0]?.points[0]).toEqual({ x: "2024", y: null, value_label_visible: false });
    expect(FigureInfo.parse({ ...base, chart: null }).has_image).toBe(false);
  });
});
