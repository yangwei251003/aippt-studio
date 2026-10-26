import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { PGliteAppStore } from "../../apps/api/dist/db/pglite-store.js";
import { FakePresentationModel } from "../../apps/api/dist/model/fake-model.js";
import { createApi } from "../../apps/api/dist/runtime.js";
import { LocalObjectStore } from "../../apps/api/dist/storage/object-store.js";

const root = resolve("artifacts/acceptance/pazhou-2035/final");
await mkdir(resolve(root, "bridge-objects"), { recursive: true });
const sourceDocument = JSON.parse(await readFile(resolve(root, "presentation-document.json"), "utf8"));
const api = await createApi({
  env: { NODE_ENV: "development", ENABLE_CODEX_TEST_BRIDGE: "true" },
  store: new PGliteAppStore("memory://"),
  model: new FakePresentationModel(),
  objects: new LocalObjectStore(resolve(root, "bridge-objects")),
  inlineJobs: true,
});

try {
  const headers = { "x-user-id": "codex-acceptance" };
  const created = await api.inject({ method: "POST", url: "/api/projects", headers, payload: { name: sourceDocument.title, topic: sourceDocument.title } });
  if (created.statusCode !== 201) throw new Error(`Project creation failed: ${created.body}`);
  const projectId = created.json().project.id;
  const document = { ...sourceDocument, id: "pazhou-2035-final-bridge", projectId };
  const imported = await api.inject({ method: "POST", url: `/api/dev/codex-test-bridge/projects/${projectId}/presentations`, headers: { ...headers, host: "localhost:3001" }, payload: { document, idempotencyKey: "pazhou-2035-acceptance-v1" } });
  if (imported.statusCode !== 201) throw new Error(`Bridge import failed: ${imported.body}`);
  if (imported.json().presentation.slides.length !== 21) throw new Error("Bridge did not preserve all 21 slides");

  const qualityResponse = await api.inject({ method: "POST", url: `/api/presentations/${document.id}/quality`, headers, payload: {} });
  if (qualityResponse.statusCode !== 200) throw new Error(`Quality check failed: ${qualityResponse.body}`);
  await api.inject({ method: "POST", url: "/api/checkout", headers, payload: { plan: "pro", interval: "month", returnTo: `/projects/${projectId}/export`, resumeAction: "acceptance-export" } });
  const exported = {};
  for (const format of ["pptx", "pdf", "png", "html"]) {
    const queued = await api.inject({ method: "POST", url: `/api/presentations/${document.id}/exports`, headers, payload: { format } });
    if (queued.statusCode !== 202) throw new Error(`${format} export queue failed: ${queued.body}`);
    const exportRecord = queued.json().export;
    let status = exportRecord.status;
    for (let attempt = 0; attempt < 200 && status !== "success"; attempt += 1) {
      await new Promise((resolveWait) => setTimeout(resolveWait, 50));
      const polled = await api.inject({ method: "GET", url: `/api/exports/${exportRecord.id}/status`, headers });
      status = polled.json().export.status;
      if (status === "failed") break;
    }
    if (status !== "success") throw new Error(`${format} export ended in ${status}`);
    const download = await api.inject({ method: "GET", url: `/api/exports/${exportRecord.id}/download`, headers });
    if (download.statusCode !== 200) throw new Error(`${format} download failed`);
    const extension = format === "png" ? "zip" : format;
    await writeFile(resolve(root, `pazhou-2035-final-via-api.${extension}`), download.rawPayload);
    exported[format] = { id: exportRecord.id, status, branding: exportRecord.branding, bytes: download.rawPayload.byteLength, contentType: download.headers["content-type"] };
  }
  if ((await readFile(resolve(root, "pazhou-2035-final-via-api.pptx"))).subarray(0, 2).toString() !== "PK") throw new Error("Downloaded PPTX is not an OOXML package");

  const latest = await api.inject({ method: "GET", url: `/api/projects/${projectId}/workflow-runs/latest`, headers });
  const events = await api.inject({ method: "GET", url: `/api/workflow-runs/${imported.json().run.id}/events?afterSequence=0`, headers });
  const record = {
    at: new Date().toISOString(),
    environment: "development",
    billing: "mock-pro",
    provenance: imported.json().provenance,
    projectId,
    presentationId: document.id,
    slideCount: imported.json().presentation.slides.length,
    quality: qualityResponse.json().quality,
    workflow: latest.json().run,
    eventStreamContentType: events.headers["content-type"],
    exports: exported,
  };
  await writeFile(resolve(root, "bridge-acceptance-record.json"), JSON.stringify(record, null, 2));
  console.log(JSON.stringify({ slideCount: record.slideCount, provenance: record.provenance, qualityScore: record.quality.score, exports: record.exports }));
} finally {
  await api.close();
}
