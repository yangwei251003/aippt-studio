import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import JSZip from "jszip";
import { afterEach, describe, expect, it } from "vitest";
import { PGliteAppStore } from "../src/db/pglite-store.js";
import type { SlideRenderService } from "../src/export/slide-renderer.js";
import { FakePresentationModel } from "../src/model/fake-model.js";
import { createApi } from "../src/runtime.js";
import { LocalObjectStore } from "../src/storage/object-store.js";

const openApps: Array<Awaited<ReturnType<typeof createApi>>> = [];
afterEach(async () => { await Promise.all(openApps.splice(0).map((app) => app.close())); });

const renderer: SlideRenderService = {
  async renderPdf() { return new TextEncoder().encode("%PDF-commercial"); },
  async renderPngArchive() { return new Uint8Array([0x50, 0x4b, 0x03, 0x04]); },
};

async function waitForExport(instance: Awaited<ReturnType<typeof createApi>>, exportId: string, headers: Record<string, string>): Promise<void> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const response = await instance.inject({ method: "GET", url: `/api/exports/${exportId}/status`, headers });
    const status = response.json<{ export: { status: string } }>().export.status;
    if (status === "success") return;
    if (status === "failed") throw new Error(`Export ${exportId} failed`);
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`Export ${exportId} timed out`);
}

async function slideXml(buffer: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buffer);
  const names = Object.keys(zip.files).filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name));
  return (await Promise.all(names.map((name) => zip.file(name)?.async("string") ?? ""))).join("\n");
}

describe("P2 export entitlements", { timeout: 90_000 }, () => {
  it("brands the one Free editable PPTX, gates PDF, and exports unbranded PPTX after Pro checkout", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "aippt-commercial-export-"));
    const instance = await createApi({ env: { NODE_ENV: "development" }, store: new PGliteAppStore("memory://"), model: new FakePresentationModel(), objects: new LocalObjectStore(root), slideRenderer: renderer, inlineJobs: true });
    openApps.push(instance);
    const headers = { "x-user-id": "export-user" };
    const projectResponse = await instance.inject({ method: "POST", url: "/api/projects", headers, payload: { name: "商业导出演示" } });
    const projectId = projectResponse.json<{ project: { id: string } }>().project.id;
    const generated = await instance.inject({ method: "POST", url: `/api/projects/${projectId}/generate`, headers, payload: { slideCount: 3 } });
    const presentationId = generated.json<{ presentation: { id: string } }>().presentation.id;
    const usageAfterGeneration = await instance.inject({ method: "GET", url: "/api/account/usage", headers });
    expect(usageAfterGeneration.json<{ usage: { balance: number } }>().usage.balance).toBe(285);

    const freePdf = await instance.inject({ method: "POST", url: `/api/presentations/${presentationId}/exports`, headers, payload: { format: "pdf" } });
    expect(freePdf.statusCode).toBe(403);

    const freePptx = await instance.inject({ method: "POST", url: `/api/presentations/${presentationId}/exports`, headers, payload: { format: "pptx" } });
    expect(freePptx.statusCode).toBe(202);
    const freeExport = freePptx.json<{ export: { id: string; branding: string } }>().export;
    expect(freeExport.branding).toBe("aippt");
    await waitForExport(instance, freeExport.id, headers);
    const freeDownload = await instance.inject({ method: "GET", url: `/api/exports/${freeExport.id}/download`, headers });
    expect(await slideXml(freeDownload.rawPayload)).toContain("AIPPT 免费版");

    await instance.inject({ method: "POST", url: "/api/checkout", headers, payload: { plan: "pro", interval: "month", returnTo: `/projects/${projectId}/export`, resumeAction: "unbranded-pptx" } });
    const proPptx = await instance.inject({ method: "POST", url: `/api/presentations/${presentationId}/exports`, headers, payload: { format: "pptx" } });
    expect(proPptx.statusCode).toBe(202);
    const proExport = proPptx.json<{ export: { id: string; branding: string } }>().export;
    expect(proExport.branding).toBe("none");
    expect(proExport.id).not.toBe(freeExport.id);
    await waitForExport(instance, proExport.id, headers);
    const proDownload = await instance.inject({ method: "GET", url: `/api/exports/${proExport.id}/download`, headers });
    expect(await slideXml(proDownload.rawPayload)).not.toContain("AIPPT 免费版");
  });

  it("refunds an integrated generation reservation when the model fails", async () => {
    class FailingModel extends FakePresentationModel {
      override async generatePresentation(): Promise<never> { throw new Error("generation failed for commercial test"); }
    }
    const root = await mkdtemp(path.join(tmpdir(), "aippt-commercial-refund-"));
    const instance = await createApi({ env: { NODE_ENV: "development" }, store: new PGliteAppStore("memory://"), model: new FailingModel(), objects: new LocalObjectStore(root), slideRenderer: renderer, inlineJobs: true });
    openApps.push(instance);
    const headers = { "x-user-id": "refund-user" };
    const projectResponse = await instance.inject({ method: "POST", url: "/api/projects", headers, payload: { name: "失败退款" } });
    const projectId = projectResponse.json<{ project: { id: string } }>().project.id;
    const generation = await instance.inject({ method: "POST", url: `/api/projects/${projectId}/generate`, headers, payload: { slideCount: 3, idempotencyKey: "failed-generation" } });
    expect(generation.statusCode).toBe(500);
    const usageResponse = await instance.inject({ method: "GET", url: "/api/account/usage", headers });
    const usage = usageResponse.json<{ usage: { balance: number }; ledger: Array<{ type: string; projectId?: string; jobId?: string }> }>();
    expect(usage.usage.balance).toBe(300);
    const reserve = usage.ledger.find(({ type }) => type === "reserve");
    const refund = usage.ledger.find(({ type }) => type === "refund");
    expect(reserve).toMatchObject({ projectId });
    expect(refund).toMatchObject({ projectId, jobId: reserve?.jobId });
  });
});
