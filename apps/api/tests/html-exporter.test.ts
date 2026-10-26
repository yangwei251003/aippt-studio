import { createFiveSlideBlueprint, createFiveSlideDocument } from "@aippt/core";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { HtmlExportService } from "../src/export/html-exporter.js";

const brief = { topic: "HTML 演示", audience: [], answers: {}, sources: [], language: "zh-CN" };
const document = createFiveSlideDocument({ projectId: "p", presentationId: "d", brief, blueprint: createFiveSlideBlueprint(brief), now: "2026-08-22T00:00:00.000Z" });

describe("Reveal HTML exporter", () => {
  it("exports a self-contained offline Reveal deck from native scene elements", async () => {
    const html = new TextDecoder().decode(await new HtmlExportService().renderSingleFile(document));
    expect(html).toContain("Reveal.initialize");
    expect(html).toContain("plugins:[RevealNotes]");
    expect(html).toContain(document.slides[0]?.title);
    expect(html).not.toMatch(/(?:src|href)=["']https?:\/\//);
  });

  it("exports a maintainable archive with deck JSON, theme, assets, and index", async () => {
    const zip = await JSZip.loadAsync(await new HtmlExportService().renderArchive(document));
    expect(Object.keys(zip.files)).toEqual(expect.arrayContaining(["index.html", "deck.json", "theme.css", "assets/reveal.js", "assets/reveal-notes.js", "assets/reveal.css"]));
  });
});
