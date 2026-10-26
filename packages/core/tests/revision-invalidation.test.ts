import { describe, expect, it } from "vitest";
import { applyCommand, createFiveSlideBlueprint, createFiveSlideDocument, inspectPresentation, qualityReportForRevision, type PresentationDocument } from "../src/index.js";

function fixture(): PresentationDocument {
  const brief = { topic: "版本失效测试", audience: ["项目负责人"], answers: {}, sources: [], language: "zh-CN" };
  return createFiveSlideDocument({
    projectId: "project-revision-test",
    presentationId: "presentation-revision-test",
    brief,
    blueprint: createFiveSlideBlueprint(brief),
    now: "2026-08-22T00:00:00.000Z",
  });
}

describe("revision-bound quality state", () => {
  it("binds a quality report to the exact revision that was checked", () => {
    const original = fixture();
    const originalReport = inspectPresentation(original);
    expect(originalReport.checkedRevision).toBe(original.revision);

    const edited = applyCommand(original, {
      id: "revision-edit-1",
      baseRevision: original.revision,
      command: {
        type: "slide.update",
        slideId: original.slides[0]!.id,
        patch: { title: "版本失效测试 · 已修改" },
      },
    }).document;

    expect(edited.revision).toBe(original.revision + 1);
    expect(originalReport.checkedRevision).not.toBe(edited.revision);
    expect(qualityReportForRevision(originalReport, edited.revision)).toMatchObject({ revision: original.revision, status: "stale" });

    const currentReport = inspectPresentation(edited);
    expect(currentReport.checkedRevision).toBe(edited.revision);
    expect(currentReport.checkedRevision).not.toBe(originalReport.checkedRevision);
  });

  it("does not allow a stale command to mutate the newer revision", () => {
    const original = fixture();
    const edited = applyCommand(original, {
      id: "revision-edit-2",
      baseRevision: original.revision,
      command: {
        type: "slide.update",
        slideId: original.slides[0]!.id,
        patch: { title: "新版本" },
      },
    }).document;

    expect(() => applyCommand(edited, {
      id: "stale-edit",
      baseRevision: original.revision,
      command: {
        type: "slide.update",
        slideId: original.slides[0]!.id,
        patch: { title: "旧任务不应覆盖" },
      },
    })).toThrow(/Revision conflict/);
    expect(edited.slides[0]?.title).toBe("新版本");
  });
});
