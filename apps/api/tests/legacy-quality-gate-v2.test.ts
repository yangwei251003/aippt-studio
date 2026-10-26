import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import JSZip from "jszip";
import sharp from "sharp";
import { afterEach, describe, expect, it } from "vitest";
import { PGliteAppStore } from "../src/db/pglite-store.js";
import type { SlideRenderService } from "../src/export/slide-renderer.js";
import { FakePresentationModel } from "../src/model/fake-model.js";
import { createApi } from "../src/runtime.js";
import { LocalObjectStore } from "../src/storage/object-store.js";

const openApps: Array<Awaited<ReturnType<typeof createApi>>> = [];
afterEach(async () => { await Promise.all(openApps.splice(0).map((app) => app.close())); });

describe("V2 quality gate with the legacy generator", { timeout: 90_000 }, () => {
  it("keeps rollback generation available but never exports it as qualified without a passed V2 report", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "aippt-legacy-v2-gate-"));
    const renderer: SlideRenderService = {
      async renderPdf() { return new Uint8Array(); },
      async renderPngArchive(document) {
        const zip = new JSZip();
        for (let index = 0; index < document.slides.length; index += 1) {
          zip.file(`slide-${String(index + 1).padStart(2, "0")}.png`, await sharp({ create: { width: 1920, height: 1080, channels: 3, background: "#182018" } }).png().toBuffer());
        }
        return new Uint8Array(await zip.generateAsync({ type: "uint8array" }));
      },
    };
    const app = await createApi({
      env: { NODE_ENV: "test", FEATURE_GENERATION_WORKFLOW_V2: "false", AIPPT_ENFORCE_QUALITY_GATE_V2: "true" },
      store: new PGliteAppStore("memory://"), model: new FakePresentationModel(),
      objects: new LocalObjectStore(path.join(root, "objects")), slideRenderer: renderer, inlineJobs: true,
    });
    openApps.push(app);

    const created = await app.inject({ method: "POST", url: "/api/projects", payload: { name: "Legacy rollback", topic: "Legacy rollback" } });
    const projectId = created.json<{ project: { id: string } }>().project.id;
    const generated = await app.inject({ method: "POST", url: `/api/projects/${projectId}/generate`, payload: { slideCount: 3 } });
    expect(generated.statusCode).toBe(201);
    const presentationId = generated.json<{ presentation: { id: string } }>().presentation.id;

    const beforeReview = await app.inject({ method: "POST", url: `/api/presentations/${presentationId}/exports`, payload: { format: "pptx" } });
    expect(beforeReview.statusCode).toBe(422);
    expect(beforeReview.json()).toMatchObject({ error: { code: "QUALITY_GATE_FAILED" } });

    const review = await app.inject({ method: "POST", url: `/api/presentations/${presentationId}/quality`, payload: { revision: 0 } });
    expect(review.statusCode).toBe(200);
    expect(review.json().quality).toMatchObject({ version: "2.0.0", status: "needs_review" });

    const afterReview = await app.inject({ method: "POST", url: `/api/presentations/${presentationId}/exports`, payload: { format: "pptx" } });
    expect(afterReview.statusCode).toBe(422);
    expect(afterReview.json()).toMatchObject({ error: { code: "QUALITY_GATE_FAILED" } });
  });
});
