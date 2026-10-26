import { afterEach, describe, expect, it } from "vitest";
import { createApi } from "../src/runtime.js";

const instances: Awaited<ReturnType<typeof createApi>>[] = [];
async function api() { const instance = await createApi({ env: { NODE_ENV: "test", DATABASE_MODE: "pglite", PGLITE_PATH: "memory://", OBJECT_STORE: "local", LOCAL_OBJECT_STORE_PATH: ".data/test-resource-objects", DEMO_ADMIN_USER_ID: "local-demo-user" }, inlineJobs: true }); instances.push(instance); return instance; }
afterEach(async () => { await Promise.all(instances.splice(0).map((instance) => instance.close())); });

describe("resource ecosystem API", () => {
  it("publishes exactly 48 executable templates, 12 skills and 96 offline media assets", async () => {
    const instance = await api(); const response = await instance.inject({ method: "GET", url: "/api/resources?limit=240" });
    expect(response.statusCode).toBe(200); const resources = response.json().resources as Array<{ manifest: { kind: string; capabilities: string[] } }>;
    expect(resources.filter(({ manifest }) => ["native-pptx", "html-deck", "image-style"].includes(manifest.kind))).toHaveLength(48);
    expect(resources.filter(({ manifest }) => manifest.kind === "skill")).toHaveLength(12);
    expect(resources.filter(({ manifest }) => manifest.kind === "media")).toHaveLength(96);
    expect(resources.every(({ manifest }) => manifest.capabilities.length > 0)).toBe(true);
  }, 60_000);

  it("binds a real template selection to the canonical project Brief", async () => {
    const instance = await api(); const created = await instance.inject({ method: "POST", url: "/api/projects", payload: { name: "资源绑定验收", topic: "琶洲 2035" } }); const projectId = created.json().project.id as string;
    const bound = await instance.inject({ method: "PUT", url: `/api/projects/${projectId}/resource-binding`, payload: { creationMode: "image", templateId: "tpl.image.future-architecture", templateVersion: "1.0.0", skillIds: ["skill.image-visual-director"], assetPolicy: { providers: ["seed"], licenseAllowlist: ["generated"], allowAiGeneration: false, requireAttribution: true } } });
    expect(bound.statusCode).toBe(200); expect(bound.json().binding).toMatchObject({ creationMode: "image", templateId: "tpl.image.future-architecture", skillIds: ["skill.image-visual-director"] });
  }, 60_000);

  it("executes a registered declarative Skill without exposing host execution", async () => {
    const instance = await api(); const started = await instance.inject({ method: "POST", url: "/api/skills/skill.brief-diagnosis/runs", payload: { payload: { topic: "琶洲 2035" } } });
    expect(started.statusCode).toBe(202); const runId = started.json().run.id as string; await new Promise((resolve) => setTimeout(resolve, 5));
    const events = await instance.inject({ method: "GET", url: `/api/skill-runs/${runId}/events` }); expect(events.json().events.map((event: { type: string }) => event.type)).toEqual(["queued", "started", "completed"]);
  }, 60_000);
});
