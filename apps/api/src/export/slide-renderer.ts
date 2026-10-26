import type { PresentationDocument } from "@aippt/core";

export interface SlideRenderService {
  renderPdf(document: PresentationDocument): Promise<Uint8Array>;
  renderPngArchive(document: PresentationDocument): Promise<Uint8Array>;
}

export class HttpSlideRenderService implements SlideRenderService {
  constructor(private readonly webOrigin: string, private readonly fetcher: typeof globalThis.fetch = globalThis.fetch) {}

  renderPdf(document: PresentationDocument): Promise<Uint8Array> { return this.render("pdf", document); }
  renderPngArchive(document: PresentationDocument): Promise<Uint8Array> { return this.render("png", document); }

  private async render(format: "pdf" | "png", document: PresentationDocument): Promise<Uint8Array> {
    const response = await this.fetcher(`${this.webOrigin.replace(/\/$/, "")}/api/render/${format}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ document }),
    });
    if (!response.ok) throw new Error(`Web renderer failed for ${format} (${response.status}). Provide the Playwright-backed /api/render/${format} route.`);
    return new Uint8Array(await response.arrayBuffer());
  }
}
