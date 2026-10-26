import JSZip from "jszip";
import { launchRenderBrowser, waitForSlideAssets } from "../../../../lib/render-browser";
import { normalizeRenderableDocument, renderDocumentHtml } from "../../../../lib/render-html";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let browser;
  try {
    const input = await request.json();
    const document = normalizeRenderableDocument(input);
    browser = await launchRenderBrowser();
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1.5 });
    await page.setContent(renderDocumentHtml(document, new URL(request.url).origin), { waitUntil: "networkidle" });
    await waitForSlideAssets(page);
    const zip = new JSZip();
    const slides = page.locator(".slide");
    for (let index = 0; index < document.slides.length; index += 1) {
      const png = await slides.nth(index).screenshot({ type: "png" });
      zip.file(`slide-${String(index + 1).padStart(2, "0")}.png`, png);
    }
    const archive = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
    return new Response(Uint8Array.from(archive).buffer, { headers: { "content-type": "application/zip", "content-disposition": "attachment; filename=aippt-png.zip" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "PNG export failed" }, { status: 500 });
  } finally {
    await browser?.close();
  }
}
