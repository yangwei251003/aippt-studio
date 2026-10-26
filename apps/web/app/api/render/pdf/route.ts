import { launchRenderBrowser, waitForSlideAssets } from "../../../../lib/render-browser";
import { renderDocumentHtml } from "../../../../lib/render-html";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let browser;
  try {
    const input = await request.json();
    browser = await launchRenderBrowser();
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
    await page.setContent(renderDocumentHtml(input, new URL(request.url).origin), { waitUntil: "networkidle" });
    await waitForSlideAssets(page);
    const pdf = await page.pdf({ printBackground: true, preferCSSPageSize: true, width: "1280px", height: "720px", margin: { top: "0", right: "0", bottom: "0", left: "0" } });
    return new Response(Uint8Array.from(pdf).buffer, { headers: { "content-type": "application/pdf", "content-disposition": "attachment; filename=aippt.pdf" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "PDF export failed" }, { status: 500 });
  } finally {
    await browser?.close();
  }
}
