import { describe, expect, it } from "vitest";
import { applyCommand, applyCommandBatch, createFiveSlideBlueprint, createFiveSlideDocument, RevisionConflictError, ScopeViolationError } from "../src/index.js";

function fixture() {
  const brief = { topic: "AI 视觉巡检", audience: ["质量负责人"], answers: {}, sources: [], language: "zh-CN" };
  const blueprint = createFiveSlideBlueprint(brief);
  return createFiveSlideDocument({ projectId: "project-1", presentationId: "deck-1", brief, blueprint, now: "2026-08-22T00:00:00.000Z" });
}

describe("presentation commands", () => {
  it("applies an edit, advances revision, and creates an inverse that restores content without decreasing revision", () => {
    const original = fixture();
    const applied = applyCommand(original, { id: "c1", baseRevision: 0, command: { type: "element.update", slideId: "slide-1", elementId: "title-1", patch: { text: "新标题" } } });
    expect(applied.document.revision).toBe(1);
    expect(applied.document.slides[0]?.elements[1]).toMatchObject({ text: "新标题" });
    const undone = applyCommand(applied.document, applied.inverse);
    expect(undone.document.revision).toBe(2);
    expect(undone.document.slides[0]?.elements[1]).toMatchObject({ text: "AI 视觉巡检" });
  });

  it("rejects a stale base revision with a conflict", () => {
    const document = fixture();
    expect(() => applyCommand(document, { id: "stale", baseRevision: 3, command: { type: "slide.update", slideId: "slide-1", patch: { title: "stale" } } })).toThrow(RevisionConflictError);
  });

  it("rejects the entire AI batch when any command escapes the current slide", () => {
    const document = fixture();
    const commands = [
      { id: "a", baseRevision: 0, command: { type: "element.update" as const, slideId: "slide-1", elementId: "title-1", patch: { text: "allowed" } } },
      { id: "b", baseRevision: 1, command: { type: "element.update" as const, slideId: "slide-2", elementId: "title-2", patch: { text: "forbidden" } } },
    ];
    expect(() => applyCommandBatch(document, commands, "slide-1")).toThrow(ScopeViolationError);
    expect(document.slides[0]?.elements[1]).toMatchObject({ text: "AI 视觉巡检" });
  });
});
