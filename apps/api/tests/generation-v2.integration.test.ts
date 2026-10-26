import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import JSZip from "jszip";
import sharp from "sharp";
import { PGliteAppStore } from "../src/db/pglite-store.js";
import { FakePresentationModel } from "../src/model/fake-model.js";
import { createApi } from "../src/runtime.js";
import { LocalObjectStore } from "../src/storage/object-store.js";
import type { SlideRenderService } from "../src/export/slide-renderer.js";

const openApps: Array<Awaited<ReturnType<typeof createApi>>> = [];
afterEach(async () => { await Promise.all(openApps.splice(0).map((app) => app.close())); });

describe("generation V2 public seams", { timeout: 90_000 }, () => {
  it("queues generation immediately with a persistent workflow run and quality profile", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "aippt-v2-api-"));
    const app = await createApi({
      env: { NODE_ENV: "test", FEATURE_GENERATION_WORKFLOW_V2: "true" },
      store: new PGliteAppStore("memory://"), model: new FakePresentationModel(),
      objects: new LocalObjectStore(path.join(root, "objects")), inlineJobs: false,
    });
    openApps.push(app);
    const created = await app.inject({ method: "POST", url: "/api/projects", payload: { name: "V2 生成合同", topic: "V2 生成合同" } });
    const projectId = created.json<{ project: { id: string } }>().project.id;
    expect((await app.inject({ method: "POST", url: `/api/projects/${projectId}/blueprint`, payload: { topic: "V2 生成合同", slideCount: 5, answers: {} } })).statusCode).toBe(409);
    await app.inject({ method: "POST", url: `/api/projects/${projectId}/questions`, payload: { topic: "V2 生成合同", slideCount: 5, answers: {} } });
    await app.inject({ method: "POST", url: `/api/projects/${projectId}/blueprint`, payload: { topic: "V2 生成合同", slideCount: 5, answers: {}, confirmed: true } });

    const response = await app.inject({
      method: "POST", url: `/api/projects/${projectId}/generate`,
      payload: { qualityProfile: "standard", idempotencyKey: "v2-public-contract" },
    });
    expect(response.statusCode).toBe(202);
    expect(response.json()).toMatchObject({
      qualityProfile: "standard",
      job: { type: "generate", status: "queued" },
      workflowRun: { projectId, workflowVersion: "2.0.0", qualityProfile: "standard", status: "running" },
    });
    expect(response.json().presentation).toBeUndefined();
    expect(response.json().job.id).toBeTruthy();
    expect(response.json().workflowRun.id).toBeTruthy();
  });

  it("executes the persisted DAG in the worker path and stores a V2 quality result", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "aippt-v2-worker-"));
    const renderer: SlideRenderService = {
      async renderPdf() { return new Uint8Array(); },
      async renderPngArchive(document) {
        const zip = new JSZip();
        for (let index = 0; index < document.slides.length; index += 1) {
          zip.file(`slide-${String(index + 1).padStart(2, "0")}.png`, await sharp({ create: { width: 1920, height: 1080, channels: 3, background: index % 2 ? "#111511" : "#182018" } }).png().toBuffer());
        }
        return new Uint8Array(await zip.generateAsync({ type: "uint8array" }));
      },
    };
    const app = await createApi({ env: { NODE_ENV: "test", FEATURE_GENERATION_WORKFLOW_V2: "true" }, store: new PGliteAppStore("memory://"), model: new FakePresentationModel(), objects: new LocalObjectStore(path.join(root, "objects")), slideRenderer: renderer, inlineJobs: true });
    openApps.push(app);
    const created = await app.inject({ method: "POST", url: "/api/projects", payload: { name: "V2 Worker", topic: "V2 Worker" } });
    const projectId = created.json<{ project: { id: string } }>().project.id;
    await app.inject({ method: "POST", url: `/api/projects/${projectId}/questions`, payload: { topic: "V2 Worker", slideCount: 5, answers: {} } });
    await app.inject({ method: "POST", url: `/api/projects/${projectId}/blueprint`, payload: { topic: "V2 Worker", slideCount: 5, answers: {}, confirmed: true } });
    const queued = await app.inject({ method: "POST", url: `/api/projects/${projectId}/generate`, payload: { qualityProfile: "standard", idempotencyKey: "v2-worker-contract" } });
    const { jobId, workflowRunId, presentationId } = queued.json<{ jobId: string; workflowRunId: string; presentationId: string }>();
    let job: { status: string; result?: Record<string, unknown>; error?: string } | undefined;
    for (let attempt = 0; attempt < 120; attempt += 1) {
      const response = await app.inject({ method: "GET", url: `/api/jobs/${jobId}` });
      job = response.json<{ job: typeof job }>().job;
      if (["success", "failed", "stale"].includes(job?.status ?? "")) break;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    expect(job?.status, job?.error).toBe("success");
    expect(job?.result).toMatchObject({ presentationId, workflowRunId, qualityStatus: expect.stringMatching(/^(passed|needs_review)$/), qualityReportId: expect.any(String) });
    expect((await app.inject({ method: "GET", url: `/api/workflow-runs/${workflowRunId}` })).json().run).toMatchObject({ status: "completed", workflowVersion: "2.0.0", bestArtifactId: expect.any(String) });
    const workbench = (await app.inject({ method: "GET", url: `/api/projects/${projectId}/workbench` })).json();
    expect(workbench.presentation).toMatchObject({ id: presentationId, schemaVersion: "2.0.0" });
    expect(workbench.quality).toMatchObject({ version: "2.0.0", status: expect.stringMatching(/^(passed|needs_review)$/), hardGates: expect.any(Array), renderRefs: expect.any(Array) });
    expect(workbench.quality.status, JSON.stringify(workbench.quality.issues)).toBe("needs_review");
    expect(workbench.quality.issues).toEqual(expect.arrayContaining([expect.objectContaining({ ruleId: "render.visual-review-unavailable", severity: "error" })]));
    const recheck = await app.inject({ method: "POST", url: `/api/presentations/${presentationId}/quality`, payload: { revision: 0, idempotencyKey: "v2-real-render-recheck" } });
    expect(recheck.statusCode).toBe(200);
    expect(recheck.json().quality).toMatchObject({ version: "2.0.0", status: "needs_review", renderRefs: expect.arrayContaining([expect.objectContaining({ width: 1920, height: 1080 })]) });
    const blockedExport = await app.inject({ method: "POST", url: `/api/presentations/${presentationId}/exports`, payload: { format: "pptx" } });
    expect(blockedExport.statusCode).toBe(422);
    expect(blockedExport.json()).toMatchObject({ error: { code: "QUALITY_GATE_FAILED" } });
  });
});
