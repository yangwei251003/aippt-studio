import { describe, expect, it, vi } from "vitest";
import { createPresentationDocumentV2, inspectPresentationV2 } from "@aippt/core";
import { LicensedAssetPort, StructuredVisualReviewPort, type RenderBundle, type StructuredModelPort } from "../src/generation/ports.js";

describe("V2 licensed asset routing", () => {
  it("queries only providers frozen in the generation input", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ query: { pages: {} } }), { status: 200, headers: { "content-type": "application/json" } }));
    const port = new LicensedAssetPort(fetcher as typeof globalThis.fetch);

    await expect(port.find({ query: "Guangzhou skyline", factual: true, allowGeneration: false, providers: ["wikimedia"], licenseAllowlist: ["CC-BY-4.0"] })).resolves.toEqual([]);

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(String(fetcher.mock.calls[0]?.[0])).toContain("commons.wikimedia.org");
  });

  it("rejects search results whose license is outside the frozen allowlist before download", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ results: [{ id: "cc0-image", url: "https://images.example.com/photo.jpg", foreign_landing_url: "https://example.com/photo", license: "cc0", width: 2400, height: 1600 }] }), { status: 200, headers: { "content-type": "application/json" } }));
    const port = new LicensedAssetPort(fetcher as typeof globalThis.fetch);

    await expect(port.find({ query: "city", factual: true, allowGeneration: false, providers: ["openverse"], licenseAllowlist: ["CC-BY-4.0"] })).resolves.toEqual([]);

    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("rejects attribution licenses when author or landing-page provenance is missing", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ results: [{ id: "by-image", url: "https://images.example.com/photo.jpg", license: "by", license_version: "4.0", width: 2400, height: 1600 }] }), { status: 200, headers: { "content-type": "application/json" } }));
    const port = new LicensedAssetPort(fetcher as typeof globalThis.fetch);

    await expect(port.find({ query: "city", factual: true, allowGeneration: false, providers: ["openverse"], licenseAllowlist: ["CC-BY-4.0"], requireAttribution: true })).resolves.toEqual([]);

    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("sends every premium slide plus the contact sheet to an independent structured reviewer", async () => {
    const document = createPresentationDocumentV2({ id: "visual-deck", projectId: "visual-project", title: "Visual review", now: "2026-08-24T00:00:00.000Z" });
    const slideId = document.slides[0]!.id;
    const bundle: RenderBundle = {
      slides: [{ slideId, width: 1920, height: 1080, artifactKey: "slide.png", sha256: "slide-hash", data: new Uint8Array([1]), dataUrl: "data:image/png;base64,AQ==" }],
      contactSheet: { artifactKey: "contact.png", sha256: "contact-hash", data: new Uint8Array([2]), dataUrl: "data:image/png;base64,Ag==" },
    };
    const complete = vi.fn(async <T>(request: Parameters<StructuredModelPort["complete"]>[0]) => request.parse({ findings: [] }) as T);
    const reviewer = new StructuredVisualReviewPort({ name: "vision-test", complete });
    const deterministic = inspectPresentationV2(document, { renderedSlides: bundle.slides });

    await expect(reviewer.review({ document, bundle, profile: "premium", deterministic })).resolves.toMatchObject({ completed: true, reviewedSlideIds: [slideId], findings: [] });
    expect(complete).toHaveBeenCalledOnce();
    expect(complete.mock.calls[0]?.[0].images).toHaveLength(2);
  });
});
