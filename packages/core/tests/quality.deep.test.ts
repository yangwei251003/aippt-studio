import { describe, expect, it } from "vitest";
import { createFiveSlideBlueprint, createFiveSlideDocument, inspectPresentation, type PresentationDocument } from "../src/index.js";

function fixture(): PresentationDocument {
  const brief = { topic: "华南区域经营分析与增长规划", goal: "帮助管理层确认增长规划", audience: ["管理层"], answers: {}, sources: [{ id: "source-1", title: "经营数据", url: "https://example.com/metrics" }], language: "zh-CN" };
  return createFiveSlideDocument({ projectId: "project-business", presentationId: "deck-business", brief, blueprint: createFiveSlideBlueprint(brief), now: "2026-08-22T00:00:00.000Z" });
}

describe("explainable P1 quality inspection", () => {
  it("requires slide-level attribution instead of allowing one global URL to cover every claim", () => {
    const document = fixture();
    document.slides[0]!.notes = "";
    const title = document.slides[0]!.elements.find((element) => element.type === "text");
    if (title?.type === "text") title.text = "2035 年覆盖 1000 家企业";
    expect(inspectPresentation(document).issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "UNVERIFIABLE_FACT", slideId: document.slides[0]!.id }),
    ]));
  });
  it("detects only explicit cross-project contamination and keeps normal generic chapters clean", () => {
    const document = fixture();
    const cleanReport = inspectPresentation(document);
    expect(cleanReport.issues.some(({ code }) => code === "CROSS_PROJECT_CONTENT")).toBe(false);

    const polluted = document.slides[2]!;
    polluted.title = "电气工程专业毕业答辩";
    polluted.elements.find((element) => element.type === "text")!.text = "论文导师与实验结果说明";
    const report = inspectPresentation(document);
    const finding = report.issues.find(({ code }) => code === "CROSS_PROJECT_CONTENT");
    expect(finding).toMatchObject({ slideId: polluted.id, verification: "risk" });
    expect(report.issues.find(({ code }) => code === "TITLE_REQUIREMENT_MISMATCH")).toMatchObject({ slideId: polluted.id });
    expect(report.checks.find(({ id }) => id === "cross-project")).toMatchObject({ status: "risk" });
  });

  it("returns location-aware deductions and never claims facts or copyright are automatically passed", () => {
    const document = fixture();
    const slide = document.slides[1]!;
    const body = slide.elements.find((element) => element.type === "text")!;
    body.text = "TODO：2025 年营收提升 25%";
    body.fontSize = 10;
    body.color = slide.background;

    const report = inspectPresentation(document);
    const placeholder = report.issues.find(({ code }) => code === "PLACEHOLDER_TEXT");
    expect(placeholder).toMatchObject({ slideId: slide.id, elementId: body.id, verification: "risk" });
    expect(report.deductions.some(({ code, elementId }) => code === "PLACEHOLDER_TEXT" && elementId === body.id)).toBe(true);
    expect(report.majorDeductions.length).toBeGreaterThan(0);
    expect(report.score).toBe(100 - report.deductions.reduce((sum, deduction) => sum + deduction.points, 0));
    expect(report.checks.find(({ id }) => id === "facts")).toMatchObject({ status: "manual" });
    expect(report.checks.find(({ id }) => id === "copyright")).toMatchObject({ status: "manual" });
  });

  it("marks missing sources and numerical claims unverifiable instead of verified", () => {
    const document = fixture();
    document.sources = [];
    const slide = document.slides[0]!;
    slide.elements.find((element) => element.type === "text")!.text = "2025 年营收增长 25%";
    const report = inspectPresentation(document);

    expect(report.checks.find(({ id }) => id === "sources")).toMatchObject({ status: "unverifiable" });
    expect(report.issues.find(({ code }) => code === "MISSING_SOURCE")).toMatchObject({ slideId: slide.id, verification: "unverifiable" });
    expect(report.issues.find(({ code }) => code === "UNVERIFIABLE_FACT")).toMatchObject({ slideId: slide.id, verification: "unverifiable" });
  });

  it("reports only exact duplicate pages or titles as duplicate viewpoints", () => {
    const document = fixture();
    const original = document.slides[0]!;
    const duplicate = document.slides[1]!;
    duplicate.title = original.title;
    duplicate.elements = structuredClone(original.elements);
    const report = inspectPresentation(document);

    expect(report.issues.find(({ code }) => code === "DUPLICATE_SLIDE")).toMatchObject({ slideId: duplicate.id });
    expect(report.issues.find(({ code }) => code === "DUPLICATE_VIEWPOINT")).toMatchObject({ slideId: duplicate.id });
  });
});
