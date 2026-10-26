import { describe, expect, it } from "vitest";
import {
  createPresentationDocumentV2,
  presentationDocumentSchema,
  skillCatalog,
  templateCatalog,
  thirdPartyCatalog,
} from "../src/index.js";

describe("presentation ecosystem contracts", () => {
  it("creates a V2 document as the shared source for slides, image decks, HTML, and canvas paths", () => {
    const document = createPresentationDocumentV2({
      id: "deck-1",
      projectId: "project-1",
      title: "增长计划",
      now: "2026-08-22T00:00:00.000Z",
    });

    expect(presentationDocumentSchema.parse(document)).toMatchObject({
      schemaVersion: "2.0.0",
      mode: "standard",
      brief: { language: "zh-CN" },
      storyboard: [],
      frames: [],
      path: [],
      assets: [],
      revisions: [],
    });
  });

  it("ships the approved restricted skills with versioned schemas and no arbitrary capabilities", () => {
    expect(skillCatalog).toHaveLength(14);
    expect(skillCatalog.map((skill) => skill.id)).toEqual(expect.arrayContaining([
      "ppt-orchestrator",
      "semantic-layout-router",
      "template-ingest",
      "technical-deck",
      "pptx-exporter",
      "html-exporter",
    ]));
    expect(skillCatalog.every((skill) => skill.permissions.shell === false && skill.permissions.secrets === false && skill.permissions.network === false)).toBe(true);
  });

  it("contains 120 distinct semantic layouts across the twelve approved scenarios", () => {
    expect(templateCatalog).toHaveLength(120);
    expect(new Set(templateCatalog.map((template) => template.scenario))).toHaveLength(12);
    expect(new Set(templateCatalog.map((template) => template.id))).toHaveLength(120);
    expect(templateCatalog.every((template) => template.slots.length > 0 && template.fallbackLayoutIds.length > 0)).toBe(true);
  });

  it("pins approved upstreams and records licenses and integration strategy", () => {
    const byId = Object.fromEntries(thirdPartyCatalog.map((entry) => [entry.id, entry]));
    expect(byId.pptxgenjs).toMatchObject({ version: "4.0.1", strategy: "adopt", license: "MIT" });
    expect(byId.revealjs).toMatchObject({ version: "6.0.1", strategy: "adopt", license: "MIT" });
    expect(byId.konva).toMatchObject({ version: "10.3.0", strategy: "adopt", license: "MIT" });
    expect(byId.pptist).toMatchObject({ strategy: "borrow", license: "AGPL-3.0" });
  });
});
