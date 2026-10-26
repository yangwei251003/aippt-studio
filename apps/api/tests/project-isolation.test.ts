import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { PresentationDocument } from "@aippt/core";
import { afterEach, describe, expect, it } from "vitest";
import { PGliteAppStore } from "../src/db/pglite-store.js";
import type { SlideRenderService } from "../src/export/slide-renderer.js";
import { FakePresentationModel } from "../src/model/fake-model.js";
import { createApi } from "../src/runtime.js";
import { LocalObjectStore } from "../src/storage/object-store.js";

const openApps: Array<Awaited<ReturnType<typeof createApi>>> = [];
const PGLITE_INTEGRATION_TIMEOUT_MS = 90_000;

const renderer: SlideRenderService = {
  async renderPdf() { return new TextEncoder().encode("%PDF-isolation-test"); },
  async renderPngArchive() { return new Uint8Array([0x50, 0x4b, 0x03, 0x04]); },
};

class FailOnceRenderer implements SlideRenderService {
  private attempts = 0;

  async renderPdf() {
    if (this.attempts++ === 0) throw new Error("transient renderer failure");
    return new TextEncoder().encode("%PDF-retried");
  }

  async renderPngArchive() { return new Uint8Array([0x50, 0x4b, 0x03, 0x04]); }
}

class DelayedPresentationModel extends FakePresentationModel {
  readonly started: Promise<void>;
  private signalStarted!: () => void;
  private readonly released: Promise<void>;
  private signalReleased!: () => void;

  constructor() {
    super();
    this.started = new Promise((resolve) => { this.signalStarted = resolve; });
    this.released = new Promise((resolve) => { this.signalReleased = resolve; });
  }

  release(): void { this.signalReleased(); }

  override async generatePresentation(input: Parameters<FakePresentationModel["generatePresentation"]>[0]): Promise<PresentationDocument> {
    this.signalStarted();
    await this.released;
    return super.generatePresentation(input);
  }
}

afterEach(async () => {
  await Promise.all(openApps.splice(0).map((app) => app.close()));
});

async function app(options: { inlineJobs?: boolean; slideRenderer?: SlideRenderService } = {}) {
  const objectRoot = await mkdtemp(path.join(tmpdir(), "aippt-p0-isolation-"));
  const instance = await createApi({
    store: new PGliteAppStore("memory://"),
    model: new FakePresentationModel(),
    objects: new LocalObjectStore(objectRoot),
    slideRenderer: options.slideRenderer ?? renderer,
    inlineJobs: options.inlineJobs ?? true,
  });
  openApps.push(instance);
  return instance;
}

async function createProject(instance: Awaited<ReturnType<typeof createApi>>, name: string, topic: string): Promise<string> {
  const response = await instance.inject({ method: "POST", url: "/api/projects", payload: { name, topic } });
  expect(response.statusCode).toBe(201);
  return response.json<{ project: { id: string } }>().project.id;
}

async function generate(instance: Awaited<ReturnType<typeof createApi>>, projectId: string): Promise<PresentationDocument> {
  const response = await instance.inject({ method: "POST", url: `/api/projects/${projectId}/generate`, payload: {} });
  expect(response.statusCode).toBe(201);
  return response.json<{ presentation: PresentationDocument }>().presentation;
}

async function waitForJob(instance: Awaited<ReturnType<typeof createApi>>, jobId: string): Promise<{ id: string; status: string; error?: string }> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const response = await instance.inject({ method: "GET", url: `/api/jobs/${jobId}` });
    const job = response.json<{ job: { id: string; status: string; error?: string } }>().job;
    if (["success", "completed", "failed", "stale", "cancelled"].includes(job.status)) return job;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`Timed out waiting for job ${jobId}`);
}

function workbenchPayload(response: Awaited<ReturnType<ReturnType<typeof createApi>["inject"]>>): Record<string, unknown> {
  const body = response.json<Record<string, unknown>>();
  return (body.workbench as Record<string, unknown> | undefined) ?? body;
}

describe("P0 project isolation and revision-bound jobs", { timeout: PGLITE_INTEGRATION_TIMEOUT_MS }, () => {
  it("conceals every project-bound resource from another account", async () => {
    const instance = await app();
    const projectId = await createProject(instance, "账户隔离项目", "账户隔离验证");
    const document = await generate(instance, projectId);
    const queued = await instance.inject({ method: "POST", url: `/api/presentations/${document.id}/exports`, payload: { format: "html", revision: document.revision } });
    expect(queued.statusCode).toBe(202);
    const exported = queued.json<{ export: { id: string; jobId: string } }>().export;
    expect((await waitForJob(instance, exported.jobId)).status).toBe("success");
    const intruder = { "x-user-id": "intruder-user" };

    const list = await instance.inject({ method: "GET", url: "/api/projects", headers: intruder });
    expect(list.json<{ projects: unknown[] }>().projects).toEqual([]);
    for (const url of [
      `/api/projects/${projectId}`,
      `/api/projects/${projectId}/workbench`,
      `/api/projects/${projectId}/presentations`,
      `/api/presentations/${document.id}`,
      `/api/presentations/${document.id}/quality`,
      `/api/jobs/${exported.jobId}`,
      `/api/exports/${exported.id}/status`,
      `/api/exports/${exported.id}/download`,
    ]) expect((await instance.inject({ method: "GET", url, headers: intruder })).statusCode).toBe(404);

    expect((await instance.inject({ method: "PATCH", url: `/api/projects/${projectId}`, headers: intruder, payload: { name: "越权修改" } })).statusCode).toBe(404);
    expect((await instance.inject({ method: "POST", url: `/api/presentations/${document.id}/quality`, headers: intruder, payload: {} })).statusCode).toBe(404);
    expect((await instance.inject({ method: "POST", url: `/api/jobs/${exported.jobId}/retry`, headers: intruder, payload: {} })).statusCode).toBe(404);
    expect((await instance.inject({ method: "POST", url: "/api/credits/reserve", headers: intruder, payload: { action: "generate", pageCount: 1, projectId, jobId: "intruder-job", idempotencyKey: "intruder" } })).statusCode).toBe(404);
    expect((await instance.inject({ method: "DELETE", url: `/api/projects/${projectId}`, headers: intruder })).statusCode).toBe(404);
    expect((await instance.inject({ method: "GET", url: `/api/projects/${projectId}` })).statusCode).toBe(200);
  });

  it("requeues an interrupted running export and completes it after service restart", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "aippt-p0-restart-"));
    const databasePath = path.join(root, "database");
    const objectRoot = path.join(root, "objects");
    const first = await createApi({ store: new PGliteAppStore(databasePath), model: new FakePresentationModel(), objects: new LocalObjectStore(objectRoot), slideRenderer: renderer, inlineJobs: false });
    const projectId = await createProject(first, "重启恢复项目", "重启恢复验证");
    const document = await generate(first, projectId);
    const queued = await first.inject({ method: "POST", url: `/api/presentations/${document.id}/exports`, payload: { format: "html", revision: document.revision } });
    const jobId = queued.json<{ export: { jobId: string } }>().export.jobId;
    const services = (first as unknown as { backendServices: { store: { claimJob(id: string): Promise<{ status: string } | undefined> } } }).backendServices;
    expect((await services.store.claimJob(jobId))?.status).toBe("running");
    await first.close();

    const second = await createApi({ store: new PGliteAppStore(databasePath), model: new FakePresentationModel(), objects: new LocalObjectStore(objectRoot), slideRenderer: renderer, inlineJobs: true });
    try {
      expect((await waitForJob(second, jobId)).status).toBe("success");
    } finally {
      await second.close();
    }
  });

  it("marks generated pages, quality and exports stale when the brief or blueprint changes", async () => {
    const instance = await app();
    const projectId = await createProject(instance, "输入失效项目", "输入失效验证");
    const document = await generate(instance, projectId);
    expect((await instance.inject({ method: "POST", url: `/api/presentations/${document.id}/quality`, payload: {} })).statusCode).toBe(200);
    const queued = await instance.inject({ method: "POST", url: `/api/presentations/${document.id}/exports`, payload: { format: "html", revision: document.revision } });
    const jobId = queued.json<{ export: { jobId: string } }>().export.jobId;
    expect((await waitForJob(instance, jobId)).status).toBe("success");

    const changed = await instance.inject({ method: "POST", url: `/api/projects/${projectId}/blueprint`, payload: { goal: "改为面向董事会的资源决策" } });
    expect(changed.statusCode).toBe(200);
    const workbench = (await instance.inject({ method: "GET", url: `/api/projects/${projectId}/workbench` })).json<{
      project: { derivedDataStale: boolean };
      qualityReport: { status: string };
      exports: Array<{ status: string }>;
      jobs: Array<{ status: string }>;
    }>();
    expect(workbench.project.derivedDataStale).toBe(true);
    expect(workbench.qualityReport.status).toBe("stale");
    expect(workbench.exports.every(({ status }) => status === "stale")).toBe(true);
    expect(workbench.jobs.filter(({ status }) => status !== "failed").every(({ status }) => status === "stale")).toBe(true);
  });

  it("rejects a generation result when the brief changes while the model is running", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "aippt-p0-running-invalidation-"));
    const model = new DelayedPresentationModel();
    const instance = await createApi({ store: new PGliteAppStore("memory://"), model, objects: new LocalObjectStore(root), slideRenderer: renderer, inlineJobs: true });
    openApps.push(instance);
    const projectId = await createProject(instance, "运行中失效项目", "初始董事会汇报");

    const generationPromise = instance.inject({ method: "POST", url: `/api/projects/${projectId}/generate`, payload: {} });
    await model.started;
    const changed = await instance.inject({ method: "POST", url: `/api/projects/${projectId}/blueprint`, payload: { purpose: "改为投资委员会资源决策" } });
    expect(changed.statusCode).toBe(200);
    model.release();

    const generation = await generationPromise;
    expect(generation.statusCode).toBe(202);
    expect(generation.json<{ job: { status: string } }>().job.status).toBe("stale");
    const workbench = (await instance.inject({ method: "GET", url: `/api/projects/${projectId}/workbench` })).json<{
      project: { derivedDataStale: boolean; sourceRevision: number };
      presentations: unknown[];
    }>();
    expect(workbench.project).toMatchObject({ derivedDataStale: true, sourceRevision: 2 });
    expect(workbench.presentations).toEqual([]);
    const usage = (await instance.inject({ method: "GET", url: "/api/account/usage" })).json<{ usage: { balance: number } }>();
    expect(usage.usage.balance).toBe(300);
  });

  it("keeps two projects' content, quality findings, workbench and exports isolated", async () => {
    const instance = await app();
    const projectA = await createProject(instance, "项目 A", "华南区域经营分析");
    const projectB = await createProject(instance, "项目 B", "电气工程毕业答辩");
    const deckA = await generate(instance, projectA);
    const deckB = await generate(instance, projectB);

    expect(deckA.projectId).toBe(projectA);
    expect(deckB.projectId).toBe(projectB);
    expect(deckA.title).toContain("华南区域经营分析");
    expect(deckB.title).toContain("电气工程毕业答辩");

    const aTitle = deckA.slides[0]?.elements.find((element) => element.type === "text");
    expect(aTitle?.id).toBeTruthy();
    const changedA = await instance.inject({
      method: "POST",
      url: `/api/presentations/${deckA.id}/commands`,
      payload: {
        command: {
          id: "p0-isolation-a-quality-marker",
          baseRevision: deckA.revision,
          command: { type: "element.update", slideId: deckA.slides[0]!.id, elementId: aTitle!.id, patch: { text: "华南区域经营分析 TODO-A" } },
        },
      },
    });
    expect(changedA.statusCode).toBe(200);
    const currentA = changedA.json<{ presentation: PresentationDocument }>().presentation;
    expect(currentA.revision).toBe(deckA.revision + 1);

    const checkedA = await instance.inject({ method: "POST", url: `/api/presentations/${deckA.id}/quality` });
    const checkedB = await instance.inject({ method: "POST", url: `/api/presentations/${deckB.id}/quality` });
    expect(checkedA.statusCode).toBe(200);
    expect(checkedB.statusCode).toBe(200);
    const qualityA = checkedA.json<{ quality: { checkedRevision: number; issues: Array<{ code: string; elementId?: string }> } }>().quality;
    const qualityB = checkedB.json<{ quality: { checkedRevision: number; issues: Array<{ code: string; elementId?: string }> } }>().quality;
    expect(qualityA.checkedRevision).toBe(currentA.revision);
    expect(qualityA.issues.some(({ code, elementId }) => code === "PLACEHOLDER_TEXT" && elementId === aTitle!.id)).toBe(true);
    expect(qualityB.issues.some(({ code }) => code === "PLACEHOLDER_TEXT")).toBe(false);

    const workbenchAResponse = await instance.inject({ method: "GET", url: `/api/projects/${projectA}/workbench` });
    const workbenchBResponse = await instance.inject({ method: "GET", url: `/api/projects/${projectB}/workbench` });
    expect(workbenchAResponse.statusCode).toBe(200);
    expect(workbenchBResponse.statusCode).toBe(200);
    const workbenchA = workbenchPayload(workbenchAResponse);
    const workbenchB = workbenchPayload(workbenchBResponse);
    expect((workbenchA.project as { id: string }).id).toBe(projectA);
    expect((workbenchB.project as { id: string }).id).toBe(projectB);
    expect((workbenchA.presentations as PresentationDocument[]).every(({ projectId }) => projectId === projectA)).toBe(true);
    expect((workbenchB.presentations as PresentationDocument[]).every(({ projectId }) => projectId === projectB)).toBe(true);
    expect(JSON.stringify(workbenchA)).not.toContain("电气工程毕业答辩");
    expect(JSON.stringify(workbenchB)).not.toContain("华南区域经营分析 TODO-A");

    const exportAResponse = await instance.inject({
      method: "POST",
      url: `/api/presentations/${deckA.id}/exports`,
      payload: { format: "html", revision: currentA.revision, idempotencyKey: "p0-isolation-a" },
    });
    const exportBResponse = await instance.inject({
      method: "POST",
      url: `/api/presentations/${deckB.id}/exports`,
      payload: { format: "html", revision: deckB.revision, idempotencyKey: "p0-isolation-b" },
    });
    expect(exportAResponse.statusCode).toBe(202);
    expect(exportBResponse.statusCode).toBe(202);
    const exportA = exportAResponse.json<{ export: { id: string; jobId: string; projectId: string; revision: number } }>().export;
    const exportB = exportBResponse.json<{ export: { id: string; jobId: string; projectId: string; revision: number } }>().export;
    expect(exportA).toMatchObject({ projectId: projectA, revision: currentA.revision });
    expect(exportB).toMatchObject({ projectId: projectB, revision: deckB.revision });

    const duplicateAResponse = await instance.inject({
      method: "POST",
      url: `/api/presentations/${deckA.id}/exports`,
      payload: { format: "html", revision: currentA.revision, idempotencyKey: "p0-isolation-a" },
    });
    expect(duplicateAResponse.statusCode).toBe(202);
    expect(duplicateAResponse.json<{ export: { id: string; jobId: string } }>().export).toMatchObject({ id: exportA.id, jobId: exportA.jobId });

    expect(["success", "completed"]).toContain((await waitForJob(instance, exportA.jobId)).status);
    expect(["success", "completed"]).toContain((await waitForJob(instance, exportB.jobId)).status);
    const downloadA = await instance.inject({ method: "GET", url: `/api/exports/${exportA.id}/download` });
    const downloadB = await instance.inject({ method: "GET", url: `/api/exports/${exportB.id}/download` });
    expect(downloadA.statusCode).toBe(200);
    expect(downloadB.statusCode).toBe(200);
    expect(downloadA.body).toContain("华南区域经营分析");
    expect(downloadA.body).not.toContain("电气工程毕业答辩");
    expect(downloadB.body).toContain("电气工程毕业答辩");
    expect(downloadB.body).not.toContain("华南区域经营分析 TODO-A");
  });

  it("marks an old revision export stale instead of overwriting the newer document", async () => {
    const instance = await app({ inlineJobs: false });
    const projectId = await createProject(instance, "版本项目", "版本失效验证");
    const document = await generate(instance, projectId);
    const queued = await instance.inject({
      method: "POST",
      url: `/api/presentations/${document.id}/exports`,
      payload: { format: "html", revision: document.revision, idempotencyKey: "p0-stale-export" },
    });
    expect(queued.statusCode).toBe(202);
    const oldExport = queued.json<{ export: { id: string; jobId: string; revision: number } }>().export;
    expect(oldExport.revision).toBe(document.revision);

    const updated = await instance.inject({
      method: "PATCH",
      url: `/api/presentations/${document.id}`,
      payload: { baseRevision: document.revision, title: "版本失效验证 · 新版本" },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json<{ presentation: PresentationDocument }>().presentation.revision).toBe(document.revision + 1);

    const services = (instance as unknown as { backendServices: { jobs: { processNext(): Promise<boolean> } } }).backendServices;
    expect(await services.jobs.processNext()).toBe(true);
    const job = await waitForJob(instance, oldExport.jobId);
    const status = (await instance.inject({ method: "GET", url: `/api/exports/${oldExport.id}/status` })).json<{ export: { status: string } }>().export;
    expect(job.status).toBe("stale");
    expect(status.status).toBe("stale");
    expect((await instance.inject({ method: "GET", url: `/api/exports/${oldExport.id}/download` })).statusCode).toBe(404);
  });

  it("allows a failed job to be retried and keeps retry idempotent", async () => {
    const instance = await app({ slideRenderer: new FailOnceRenderer() });
    const projectId = await createProject(instance, "重试项目", "任务失败重试");
    const document = await generate(instance, projectId);
    expect((await instance.inject({ method: "POST", url: "/api/checkout", payload: { plan: "pro", interval: "month", returnTo: `/projects/${projectId}/export`, resumeAction: "retry-export" } })).statusCode).toBe(200);
    const queued = await instance.inject({
      method: "POST",
      url: `/api/presentations/${document.id}/exports`,
      payload: { format: "pdf", revision: document.revision, idempotencyKey: "p0-failed-export" },
    });
    expect(queued.statusCode).toBe(202);
    const exportRecord = queued.json<{ export: { id: string; jobId: string } }>().export;
    expect((await waitForJob(instance, exportRecord.jobId)).status).toBe("failed");

    const retry = await instance.inject({ method: "POST", url: `/api/jobs/${exportRecord.jobId}/retry` });
    expect([200, 202]).toContain(retry.statusCode);
    const retried = retry.json<{ job?: { id: string; status: string }; export?: { id: string } }>();
    expect(retried.job?.id ?? exportRecord.jobId).toBe(exportRecord.jobId);
    expect(["success", "completed"]).toContain((await waitForJob(instance, exportRecord.jobId)).status);

    const duplicate = await instance.inject({
      method: "POST",
      url: `/api/presentations/${document.id}/exports`,
      payload: { format: "pdf", revision: document.revision, idempotencyKey: "p0-failed-export" },
    });
    expect(duplicate.statusCode).toBe(202);
    expect(duplicate.json<{ export: { id: string; jobId: string } }>().export).toMatchObject({ id: exportRecord.id, jobId: exportRecord.jobId });
  });
});
