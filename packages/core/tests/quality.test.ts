import { describe, expect, it } from "vitest";
import { createFiveSlideBlueprint, createFiveSlideDocument, inspectPresentation, qualityReportForRevision } from "../src/index.js";

describe("three-stage quality inspection", () => {
  it("returns page-level content, geometry, and render results instead of a fixed score", () => {
    const brief = { topic: "质量测试", audience: [], answers: {}, sources: [], language: "zh-CN" };
    const document = createFiveSlideDocument({ projectId: "p", presentationId: "d", brief, blueprint: createFiveSlideBlueprint(brief), now: "2026-08-22T00:00:00.000Z" });
    const first = document.slides[0]!;
    first.elements.push({ id: "outside", type: "text", x: 12.9, y: 7.1, width: 1, height: 1, rotation: 0, opacity: 1, locked: false, text: "TODO placeholder", fontFamily: "Aptos", fontSize: 20, color: "#fff", bold: false, italic: false, align: "left", verticalAlign: "top" });

    const report = inspectPresentation(document);
    expect(report.score).toBeLessThan(100);
    expect(report.pages).toHaveLength(5);
    expect(report).toMatchObject({ projectId: "p", presentationId: "d", revision: 0, checkedRevision: 0, status: "valid" });
    expect(report.pages[0]).toMatchObject({ slideId: "slide-1", stages: { content: "warning", geometry: "warning" } });
    expect(report.issues.map(({ code }) => code)).toEqual(expect.arrayContaining(["OUT_OF_BOUNDS", "PLACEHOLDER_TEXT", "MISSING_SOURCE"]));
  });

  it("marks a report stale when the presentation revision advances", () => {
    const brief = { topic: "版本测试", audience: [], answers: {}, sources: [], language: "zh-CN" };
    const document = createFiveSlideDocument({ projectId: "project-a", presentationId: "deck-a", brief, blueprint: createFiveSlideBlueprint(brief), now: "2026-08-22T00:00:00.000Z" });
    const report = inspectPresentation(document);

    expect(qualityReportForRevision(report, 1)).toMatchObject({ projectId: "project-a", presentationId: "deck-a", revision: 0, status: "stale" });
    expect(qualityReportForRevision(report, 0).status).toBe("valid");
  });
});
