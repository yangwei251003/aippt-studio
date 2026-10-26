import { createFiveSlideBlueprint, createFiveSlideDocument } from "@aippt/core";
import { describe, expect, it } from "vitest";
import { PptxRendererAdapter } from "../src/export/pptx-exporter.js";
import { TemplatePptxAdapter } from "../src/export/template-pptx-adapter.js";
import { parseUpload } from "../src/upload/index.js";

describe("professional template adapter", () => {
  it("copies selected slides through pptx-automizer while keeping a valid editable OOXML package", async () => {
    const brief = { topic: "企业模板", audience: [], answers: {}, sources: [], language: "zh-CN" };
    const source = await new PptxRendererAdapter().render(createFiveSlideDocument({ projectId: "p", presentationId: "d", brief, blueprint: createFiveSlideBlueprint(brief), now: "2026-08-22T00:00:00.000Z" }));
    const output = await new TemplatePptxAdapter().copySlides(source, [1, 3]);
    const parsed = await parseUpload(output, "composed.pptx", "application/vnd.openxmlformats-officedocument.presentationml.presentation");
    expect(parsed.template?.slideCount).toBe(2);
  }, 20_000);
});
