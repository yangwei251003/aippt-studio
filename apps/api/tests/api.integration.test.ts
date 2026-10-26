import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Blueprint, CreationBrief, PresentationDocument, PresentationModelAdapter } from "@aippt/core";
import { afterEach, describe, expect, it } from "vitest";
import { PGliteAppStore } from "../src/db/pglite-store.js";
import type { SlideRenderService } from "../src/export/slide-renderer.js";
import { FakePresentationModel } from "../src/model/fake-model.js";
import { createApi } from "../src/runtime.js";
import { LocalObjectStore } from "../src/storage/object-store.js";

const openApps: Array<Awaited<ReturnType<typeof createApi>>> = [];
afterEach(async () => { await Promise.all(openApps.splice(0).map((app) => app.close())); });

const renderer: SlideRenderService = {
  async renderPdf() { return new TextEncoder().encode("%PDF-test"); },
  async renderPngArchive() { return new Uint8Array([0x50, 0x4b, 0x03, 0x04]); },
};

async function app(model: PresentationModelAdapter = new FakePresentationModel()) {
  const objectRoot = await mkdtemp(path.join(tmpdir(), "aippt-api-test-"));
  const instance = await createApi({ store: new PGliteAppStore("memory://"), model, objects: new LocalObjectStore(objectRoot), slideRenderer: renderer, inlineJobs: true });
  openApps.push(instance);
  return instance;
}

async function generatedDeck(instance: Awaited<ReturnType<typeof createApi>>) {
  const projectResponse = await instance.inject({ method: "POST", url: "/api/projects", payload: { name: "AI 视觉巡检" } });
  expect(projectResponse.statusCode).toBe(201);
  const projectId = projectResponse.json<{ project: { id: string } }>().project.id;
  const generation = await instance.inject({ method: "POST", url: `/api/projects/${projectId}/generate`, payload: {} });
  expect(generation.statusCode).toBe(201);
  return generation.json<{ presentation: PresentationDocument }>().presentation;
}

const PGLITE_INTEGRATION_TIMEOUT_MS = 90_000;

describe("AIPPT API", { timeout: PGLITE_INTEGRATION_TIMEOUT_MS }, () => {
  it("honors the default page count, saves a command, returns 409 for stale edits, and undoes with a monotonic revision", async () => {
    const instance = await app();
    const document = await generatedDeck(instance);
    expect(document.slides).toHaveLength(8);

    const saved = await instance.inject({
      method: "POST", url: `/api/presentations/${document.id}/commands`,
      payload: { command: { id: "cmd-1", baseRevision: 0, command: { type: "element.update", slideId: "slide-1", elementId: "body-1", patch: { text: "已保存内容" } } } },
    });
    expect(saved.statusCode).toBe(200);
    expect(saved.json<{ presentation: PresentationDocument }>().presentation.revision).toBe(1);

    const stale = await instance.inject({
      method: "POST", url: `/api/presentations/${document.id}/commands`,
      payload: { command: { id: "cmd-stale", baseRevision: 0, command: { type: "element.update", slideId: "slide-1", elementId: "body-1", patch: { text: "不应写入" } } } },
    });
    expect(stale.statusCode).toBe(409);

    const undone = await instance.inject({ method: "POST", url: `/api/presentations/${document.id}/undo`, payload: { baseRevision: 1 } });
    expect(undone.statusCode).toBe(200);
    const restored = undone.json<{ presentation: PresentationDocument }>().presentation;
    expect(restored.revision).toBe(2);
    expect(restored.slides[0]?.elements.find(({ id }) => id === "body-1")).toMatchObject({ text: "清晰介绍AI 视觉巡检" });
  });

  it("persists an HTML or AI-image presentation mode through the generation job", async () => {
    const instance = await app();
    const project = await instance.inject({ method: "POST", url: "/api/projects", payload: { name: "三种展现模式" } });
    const projectId = project.json<{ project: { id: string } }>().project.id;
    const generated = await instance.inject({ method: "POST", url: `/api/projects/${projectId}/generate`, payload: { mode: "html" } });
    expect(generated.statusCode).toBe(201);
    const document = generated.json<{ presentation: PresentationDocument }>().presentation;
    expect(document.mode).toBe("html");
    const restored = await instance.inject({ method: "GET", url: `/api/presentations/${document.id}` });
    expect(restored.json<{ presentation: PresentationDocument }>().presentation.mode).toBe("html");
  });

  it("rejects a model command batch atomically when one edit targets another slide", async () => {
    class EscapingModel implements PresentationModelAdapter {
      readonly name = "escaping-test-model";
      private readonly delegate = new FakePresentationModel();
      generateQuestions(brief: CreationBrief) { return this.delegate.generateQuestions(brief); }
      generateBlueprint(brief: CreationBrief): Promise<Blueprint> { return this.delegate.generateBlueprint(brief); }
      generatePresentation(input: { projectId: string; presentationId: string; brief: CreationBrief; blueprint: Blueprint }) { return this.delegate.generatePresentation(input); }
      async editCurrentSlide(input: { document: PresentationDocument; slideId: string; instruction: string }) {
        return [
          { id: "ai-1", baseRevision: input.document.revision, command: { type: "element.update", slideId: input.slideId, elementId: "body-1", patch: { text: "当前页" } } },
          { id: "ai-2", baseRevision: input.document.revision + 1, command: { type: "element.update", slideId: "slide-2", elementId: "body-2", patch: { text: "越界" } } },
        ];
      }
    }
    const instance = await app(new EscapingModel());
    const document = await generatedDeck(instance);
    const response = await instance.inject({ method: "POST", url: `/api/presentations/${document.id}/ai-edit`, payload: { slideId: "slide-1", instruction: "优化", baseRevision: 0 } });
    expect(response.statusCode).toBe(422);
    const persisted = await instance.inject({ method: "GET", url: `/api/presentations/${document.id}` });
    expect(persisted.json<{ presentation: PresentationDocument }>().presentation.revision).toBe(0);
  });

  it("applies element, page, section/deck scopes and exposes version history", async () => {
    const instance = await app();
    const document = await generatedDeck(instance);
    const deckEdit = await instance.inject({ method: "POST", url: `/api/presentations/${document.id}/ai-edit`, payload: { slideId: "slide-1", scope: "deck", instruction: "统一为结论先行", baseRevision: 0 } });
    expect(deckEdit.statusCode).toBe(200);
    const deck = deckEdit.json<{ presentation: PresentationDocument; affectedSlideIds: string[] }>();
    expect(deck.affectedSlideIds).toHaveLength(document.slides.length);
    expect(deck.presentation.revision).toBe(document.slides.length);

    const elementEdit = await instance.inject({ method: "POST", url: `/api/presentations/${document.id}/ai-edit`, payload: { slideId: "slide-1", elementId: "body-1", scope: "element", instruction: "只改这个元素", baseRevision: deck.presentation.revision } });
    expect(elementEdit.statusCode).toBe(200);
    const elementDocument = elementEdit.json<{ presentation: PresentationDocument }>().presentation;
    expect(elementDocument.slides[0]?.elements.find(({ id }) => id === "body-1")).toMatchObject({ text: "只改这个元素" });

    const history = await instance.inject({ method: "GET", url: `/api/presentations/${document.id}/history` });
    expect(history.statusCode).toBe(200);
    expect(history.json<{ history: unknown[] }>().history.length).toBeGreaterThanOrEqual(document.slides.length + 1);
  });

  it("persists an editor snapshot and rejects a stale autosave revision", async () => {
    const instance = await app();
    const document = await generatedDeck(instance);
    const changed = {
      ...document,
      slides: document.slides.map((slide, index) => index === 0 ? { ...slide, title: "已持久化的首页" } : slide),
    };
    const saved = await instance.inject({ method: "PUT", url: `/api/presentations/${document.id}`, payload: { baseRevision: 0, document: changed } });
    expect(saved.statusCode).toBe(200);
    const persisted = saved.json<{ presentation: PresentationDocument }>().presentation;
    expect(persisted.revision).toBe(1);
    expect(persisted.slides[0]?.title).toBe("已持久化的首页");

    const stale = await instance.inject({ method: "PUT", url: `/api/presentations/${document.id}`, payload: { baseRevision: 0, document: changed } });
    expect(stale.statusCode).toBe(409);
    const restored = await instance.inject({ method: "GET", url: `/api/presentations/${document.id}` });
    expect(restored.json<{ presentation: PresentationDocument }>().presentation.revision).toBe(1);
    expect(restored.json<{ presentation: PresentationDocument }>().presentation.slides[0]?.title).toBe("已持久化的首页");
  });

  it("restores a presentation after a file-backed PGlite restart", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "aippt-pglite-restart-"));
    const databasePath = path.join(root, "database");
    const first = await createApi({ store: new PGliteAppStore(databasePath), model: new FakePresentationModel(), objects: new LocalObjectStore(path.join(root, "objects")), slideRenderer: renderer, inlineJobs: true });
    const document = await generatedDeck(first);
    const snapshot = { ...document, title: "重启后仍存在的快照" };
    const saved = await first.inject({ method: "PUT", url: `/api/presentations/${document.id}`, payload: { baseRevision: 0, document: snapshot } });
    expect(saved.statusCode).toBe(200);
    await first.close();

    const second = await createApi({ store: new PGliteAppStore(databasePath), model: new FakePresentationModel(), objects: new LocalObjectStore(path.join(root, "objects")), slideRenderer: renderer, inlineJobs: true });
    openApps.push(second);
    const restored = await second.inject({ method: "GET", url: `/api/presentations/${document.id}` });
    expect(restored.statusCode).toBe(200);
    expect(restored.json<{ presentation: PresentationDocument }>().presentation).toMatchObject({ id: document.id, revision: 1, title: "重启后仍存在的快照" });
  });

  it("executes a PPTX export job and exposes a downloadable native-object file", async () => {
    const instance = await app();
    const document = await generatedDeck(instance);
    const queued = await instance.inject({ method: "POST", url: `/api/presentations/${document.id}/exports`, payload: { format: "pptx" } });
    expect(queued.statusCode).toBe(202);
    const record = queued.json<{ export: { id: string }; job: { id: string } }>();

    let status = "queued";
    for (let attempt = 0; attempt < 30 && status !== "success"; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 20));
      const poll = await instance.inject({ method: "GET", url: `/api/jobs/${record.job.id}` });
      status = poll.json<{ job: { status: string } }>().job.status;
    }
    expect(status).toBe("success");
    const download = await instance.inject({ method: "GET", url: `/api/exports/${record.export.id}/download` });
    expect(download.statusCode).toBe(200);
    expect(download.rawPayload.subarray(0, 2).toString()).toBe("PK");
  });

  it("exposes the restricted skill/template ecosystem and exports offline HTML", async () => {
    const instance = await app();
    const ecosystem = await instance.inject({ method: "GET", url: "/api/presentation-ecosystem" });
    expect(ecosystem.statusCode).toBe(200);
    expect(ecosystem.json<{ skills: unknown[]; templates: unknown[] }>().skills).toHaveLength(14);
    expect(ecosystem.json<{ skills: unknown[]; templates: unknown[] }>().templates).toHaveLength(120);

    const document = await generatedDeck(instance);
    const queued = await instance.inject({ method: "POST", url: `/api/presentations/${document.id}/exports`, payload: { format: "html" } });
    const exportId = queued.json<{ export: { id: string } }>().export.id;
    let status = "queued";
    for (let attempt = 0; attempt < 30 && status !== "success"; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 20));
      status = (await instance.inject({ method: "GET", url: `/api/exports/${exportId}/status` })).json<{ export: { status: string } }>().export.status;
    }
    expect(status).toBe("success");
    const download = await instance.inject({ method: "GET", url: `/api/exports/${exportId}/download` });
    expect(download.headers["content-type"]).toContain("text/html");
    expect(download.body).toContain("Reveal.initialize");
  });
});
