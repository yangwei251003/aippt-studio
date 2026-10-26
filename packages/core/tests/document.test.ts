import { describe, expect, it } from "vitest";
import { createFiveSlideBlueprint, createFiveSlideDocument, createPresentationBlueprint, createPresentationDocument, presentationDocumentSchema } from "../src/index.js";

describe("presentation document", () => {
  it("creates exactly five editable 16:9 slides using text and shape native elements", () => {
    const brief = { topic: "制造业增长计划", audience: [], answers: {}, sources: [], language: "zh-CN" };
    const blueprint = createFiveSlideBlueprint(brief);
    const document = createFiveSlideDocument({ projectId: "p", presentationId: "d", brief, blueprint, now: "2026-08-22T00:00:00.000Z" });
    expect(presentationDocumentSchema.parse(document).slides).toHaveLength(5);
    expect(document.aspectRatio).toBe("16:9");
    expect(new Set(document.slides.flatMap((slide) => slide.elements.map((element) => element.type)))).toEqual(new Set(["text", "shape"]));
  });

  it("builds a requested eight-page V2 deck with semantic layouts and storyboard traceability", () => {
    const brief = { topic: "企业 AI 产品发布", goal: "获得采购试点", audience: ["业务负责人"], desiredAction: "批准试点", answers: {}, sources: [], language: "zh-CN", slideCount: 8 };
    const blueprint = createPresentationBlueprint(brief);
    const document = createPresentationDocument({ projectId: "p", presentationId: "d", brief, blueprint, now: "2026-08-22T00:00:00.000Z" });

    expect(document.schemaVersion).toBe("2.0.0");
    expect(document.slides).toHaveLength(8);
    expect(document.storyboard).toHaveLength(8);
    expect(new Set(document.slides.map((slide) => slide.elements.map((element) => `${element.x},${element.y},${element.width},${element.height}`).join("|"))).size).toBeGreaterThanOrEqual(4);
    expect(document.brief).toMatchObject({ goal: "获得采购试点", audience: ["业务负责人"], desiredAction: "批准试点" });
  });

  it("keeps the requested presentation mode in the generated document", () => {
    const brief = { topic: "网页产品发布", audience: [], answers: {}, sources: [], language: "zh-CN" };
    const blueprint = createFiveSlideBlueprint(brief);
    expect(createPresentationDocument({ projectId: "p", presentationId: "html", brief, blueprint, mode: "html" }).mode).toBe("html");
    expect(createPresentationDocument({ projectId: "p", presentationId: "image", brief, blueprint, mode: "image" }).mode).toBe("image");
  });
});
