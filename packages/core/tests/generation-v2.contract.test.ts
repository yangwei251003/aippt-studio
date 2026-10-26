import { describe, expect, it } from "vitest";
import {
  CORE_LAYOUT_CONTRACTS,
  createPresentationDocumentV2,
  inspectPresentationV2,
  presentationDocumentSchema,
  workflowArtifactSchema,
} from "../src/index.js";

describe("AIPPT generation V2 contracts", () => {
  it("ships at least fifteen executable layouts with explicit slot capacity", () => {
    expect(CORE_LAYOUT_CONTRACTS.length).toBeGreaterThanOrEqual(15);
    expect(new Set(CORE_LAYOUT_CONTRACTS.map(({ id }) => id)).size).toBe(CORE_LAYOUT_CONTRACTS.length);
    for (const layout of CORE_LAYOUT_CONTRACTS) {
      expect(layout.slots.length).toBeGreaterThan(0);
      expect(layout.slots.every(({ maxCharacters, maxLines }) => maxCharacters > 0 && maxLines > 0)).toBe(true);
      expect(layout.fallbackLayoutIds).not.toContain(layout.id);
    }
  });

  it("keeps native chart and table data editable and bound to evidence", () => {
    const document = createPresentationDocumentV2({ id: "deck-v2", projectId: "project-v2", title: "可编辑数据表达", now: "2026-08-24T00:00:00.000Z" });
    document.slides[0]!.elements = [
      {
        id: "chart-1", type: "chart", x: 0.8, y: 1.8, width: 7.2, height: 4.8, rotation: 0, opacity: 1, locked: false,
        semanticRole: "data-visual", readingOrder: 2, decorative: false, evidenceRefs: ["evidence-1"], overlapPolicy: "none",
        chartType: "bar", categories: ["A", "B"], series: [{ name: "营收", values: [12, 18] }], unit: "亿元", sourceEvidenceId: "evidence-1",
        showLegend: true, showValues: true, colorScheme: ["#B7F34A"],
      },
      {
        id: "table-1", type: "table", x: 8.4, y: 1.8, width: 4.1, height: 4.8, rotation: 0, opacity: 1, locked: false,
        semanticRole: "data-table", readingOrder: 3, decorative: false, evidenceRefs: ["evidence-1"], overlapPolicy: "none",
        columns: [{ key: "metric", label: "指标" }, { key: "value", label: "数值" }], rows: [{ metric: "营收", value: "18 亿元" }],
        headerColor: "#B7F34A", bodyColor: "#F4F4EF", textColor: "#0A0A0A", sourceEvidenceId: "evidence-1",
      },
    ];
    expect(presentationDocumentSchema.parse(document).slides[0]?.elements.map(({ type }) => type)).toEqual(["chart", "table"]);
  });

  it("separates blocking hard gates from weighted quality dimensions", () => {
    const document = createPresentationDocumentV2({ id: "deck-quality", projectId: "project-quality", title: "质量合同", now: "2026-08-24T00:00:00.000Z" });
    document.slides[0]!.title = "";
    document.slides[0]!.elements = [{
      id: "tiny", type: "text", x: 0.5, y: 0.5, width: 5, height: 1, rotation: 0, opacity: 1, locked: false,
      semanticRole: "body", readingOrder: 1, decorative: false, evidenceRefs: [], overlapPolicy: "none",
      text: "TODO", fontFamily: "Aptos", fontSize: 10, color: "#0A0A0A", bold: false, italic: false, align: "left", verticalAlign: "top",
    }];
    const report = inspectPresentationV2(document, { renderedSlides: [] });
    expect(report.version).toBe("2.0.0");
    expect(report.status).toBe("needs_review");
    expect(report.hardGates.some(({ status }) => status === "failed")).toBe(true);
    expect(report.dimensions.map(({ id }) => id)).toEqual(["narrative", "layout", "visuals", "accessibility", "consistency", "evidence", "speakerFit"]);
    expect(report.manualReviews).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "facts", status: "manual" }),
      expect.objectContaining({ id: "copyright", status: "manual" }),
    ]));
    expect(report.score).toBeLessThan(85);
  });

  it("does not let an unrelated page-level evidence id launder a numeric claim", () => {
    const document = createPresentationDocumentV2({ id: "deck-evidence", projectId: "project-evidence", title: "Evidence", now: "2026-08-24T00:00:00.000Z" });
    document.sources = [{ id: "source-1", title: "Source", kind: "upload", authorized: true }];
    document.evidenceLedger = [{ id: "evidence-1", claim: "已核对的增长率为 12%", title: "Source", sourceId: "source-1", locator: "page 3", accessedAt: "2026-08-24T00:00:00.000Z", license: "user-provided", status: "manual-review" }];
    document.slides[0]!.title = "增长率判断";
    document.slides[0]!.elements = [{
      id: "claim", type: "text", x: 1, y: 2, width: 10, height: 2, rotation: 0, opacity: 1, locked: false,
      semanticRole: "body", readingOrder: 1, decorative: false, evidenceRefs: ["evidence-1"], overlapPolicy: "none",
      text: "增长率达到 18%", fontFamily: "Aptos", fontSize: 24, color: "#F4F4EF", bold: true, italic: false, align: "left", verticalAlign: "top",
    }];
    const report = inspectPresentationV2(document, { renderedSlides: [{ slideId: "slide-1", width: 1920, height: 1080 }] });
    expect(report.issues).toEqual(expect.arrayContaining([expect.objectContaining({ ruleId: "evidence.numeric-mismatch", severity: "error" })]));
    expect(report.hardGates.find(({ id }) => id === "evidence")?.status).toBe("failed");
  });

  it("rejects untyped workflow payloads instead of accepting arbitrary records", () => {
    expect(() => workflowArtifactSchema.parse({ schemaVersion: "2.0.0", step: "story-architecture", summary: "bad", data: { anything: true } })).toThrow();
    expect(() => workflowArtifactSchema.parse({ schemaVersion: "2.0.0", step: "delivery", summary: "bad", data: { qualityReport: { score: 100 } } })).toThrow();
  });
});
