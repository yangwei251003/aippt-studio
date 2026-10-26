import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createPresentationBlueprint, createPresentationDocument } from "@aippt/core";
import { afterEach, describe, expect, it } from "vitest";
import { PGliteAppStore } from "../src/db/pglite-store.js";
import { FakePresentationModel } from "../src/model/fake-model.js";
import { createApi } from "../src/runtime.js";
import { LocalObjectStore } from "../src/storage/object-store.js";
import type { WorkflowStepExecutor } from "../src/workflow/presentation-workflow.js";

const openApps: Array<Awaited<ReturnType<typeof createApi>>> = [];
afterEach(async () => { await Promise.all(openApps.splice(0).map((app) => app.close())); });

async function app(env: NodeJS.ProcessEnv = { NODE_ENV: "test" }, database = "memory://", workflowExecutor?: WorkflowStepExecutor) {
  const root = await mkdtemp(path.join(tmpdir(), "aippt-workflow-test-"));
  const instance = await createApi({
    env,
    store: new PGliteAppStore(database),
    model: new FakePresentationModel(),
    objects: new LocalObjectStore(path.join(root, "objects")),
    ...(workflowExecutor ? { workflowExecutor } : {}),
    inlineJobs: false,
  });
  openApps.push(instance);
  return instance;
}

async function project(instance: Awaited<ReturnType<typeof createApi>>) {
  const response = await instance.inject({ method: "POST", url: "/api/projects", payload: { name: "工作流测试" } });
  return response.json<{ project: { id: string } }>().project;
}

describe("presentation workflow", { timeout: 60_000 }, () => {
  it("refuses production startup without trusted auth and ignores demo identity headers in production", async () => {
    await expect(app({ NODE_ENV: "production" })).rejects.toThrow(/AUTH_TRUSTED_USER_HEADER/);
    const instance = await app({ NODE_ENV: "production", AUTH_TRUSTED_USER_HEADER: "x-authenticated-user-id", AUTH_PROXY_SHARED_SECRET: "production-test-secret-123" });
    const forged = await instance.inject({ method: "GET", url: "/api/projects", headers: { "x-user-id": "victim" } });
    expect(forged.statusCode).toBe(401);
    const trusted = await instance.inject({ method: "POST", url: "/api/projects", headers: { "x-authenticated-user-id": "trusted-user", "x-aippt-auth-proxy-secret": "production-test-secret-123" }, payload: { name: "trusted" } });
    expect(trusted.statusCode).toBe(201);
  });

  it("persists a resumable run and exposes actual model assignments without hidden reasoning", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "aippt-workflow-restart-"));
    const database = path.join(root, "db");
    const first = await app({ NODE_ENV: "test", AIPPT_REASONING_MODEL: "reasoning-local", AIPPT_FAST_MODEL: "fast-local" }, database);
    const createdProject = await project(first);
    const started = await first.inject({
      method: "POST",
      url: `/api/projects/${createdProject.id}/workflow-runs`,
      payload: { idempotencyKey: "acceptance-run", source: "api" },
    });
    expect(started.statusCode).toBe(201);
    const runId = started.json<{ run: { id: string; currentStep: string }; events: Array<{ type: string; modelId?: string; payload: unknown }> }>().run.id;
    expect(started.json().run.currentStep).toBe("brief-research");
    expect(started.json().events).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "run.started" }),
      expect.objectContaining({ type: "agent.assigned", modelId: "reasoning-local" }),
    ]));
    expect(JSON.stringify(started.json().events)).not.toContain("reasoning-local-chain");
    await first.close();
    openApps.splice(openApps.indexOf(first), 1);

    const second = await app({ NODE_ENV: "test", AIPPT_REASONING_MODEL: "reasoning-local", AIPPT_FAST_MODEL: "fast-local", WORKFLOW_SSE_WAIT_MS: "5" }, database);
    const restored = await second.inject({ method: "GET", url: `/api/workflow-runs/${runId}` });
    expect(restored.statusCode).toBe(200);
    expect(restored.json().run).toMatchObject({ id: runId, projectId: createdProject.id, status: "running", currentStep: "brief-research" });
    const latest = await second.inject({ method: "GET", url: `/api/projects/${createdProject.id}/workflow-runs/latest` });
    expect(latest.statusCode).toBe(200);
    expect(latest.json()).toMatchObject({ run: { id: runId }, events: [{ type: "run.started" }, { type: "agent.assigned" }] });

    const rejectedClientArtifact = await second.inject({ method: "POST", url: `/api/workflow-runs/${runId}/continue`, payload: { output: { evidenceCount: 3 } } });
    expect(rejectedClientArtifact.statusCode).toBe(400);
    const continued = await second.inject({ method: "POST", url: `/api/workflow-runs/${runId}/execute`, payload: {} });
    expect(continued.statusCode).toBe(200);
    expect(continued.json().run.currentStep).toBe("evidence-ledger");
    expect(continued.json().run).toMatchObject({ artifacts: { "brief-research": { schemaVersion: "1.0.0", step: "brief-research" } }, usage: { inputTokens: 0, outputTokens: 0, costUsd: 0 } });
    expect(continued.json().events).toEqual(expect.arrayContaining([expect.objectContaining({ type: "step.completed", step: "brief-research" })]));

    const eventStream = await second.inject({ method: "GET", url: `/api/workflow-runs/${runId}/events?afterSequence=0` });
    expect(eventStream.headers["content-type"]).toContain("text/event-stream");
    expect(eventStream.body).toContain("event: run.started");
    expect(eventStream.body).toContain("event: step.completed");
    const heartbeat = await second.inject({ method: "GET", url: `/api/workflow-runs/${runId}/events?afterSequence=999` });
    expect(heartbeat.body).toContain(": heartbeat");
    await second.close();
    openApps.splice(openApps.indexOf(second), 1);
    const third = await app({ NODE_ENV: "test", AIPPT_REASONING_MODEL: "reasoning-local", AIPPT_FAST_MODEL: "fast-local" }, database);
    expect((await third.inject({ method: "GET", url: `/api/workflow-runs/${runId}` })).json().run).toMatchObject({ artifacts: { "brief-research": { step: "brief-research" } }, usage: { inputTokens: 0, outputTokens: 0, costUsd: 0 } });
  });

  it("fails closed when a server executor returns an artifact for the wrong step", async () => {
    const instance = await app({ NODE_ENV: "test" }, "memory://", {
      async execute() { return { artifact: { schemaVersion: "1.0.0", step: "delivery", summary: "wrong step", data: {} }, usage: { inputTokens: 1, outputTokens: 1, costUsd: 0 } }; },
    });
    const createdProject = await project(instance);
    const started = await instance.inject({ method: "POST", url: `/api/projects/${createdProject.id}/workflow-runs`, payload: {} });
    const runId = started.json().run.id as string;
    expect((await instance.inject({ method: "POST", url: `/api/workflow-runs/${runId}/execute`, payload: {} })).statusCode).toBe(500);
    expect((await instance.inject({ method: "GET", url: `/api/workflow-runs/${runId}` })).json().run).toMatchObject({ status: "failed", artifacts: {}, usage: { inputTokens: 0, outputTokens: 0, costUsd: 0 } });
  });

  it("cancels runs idempotently and prevents further continuation", async () => {
    const instance = await app();
    const createdProject = await project(instance);
    const started = await instance.inject({ method: "POST", url: `/api/projects/${createdProject.id}/workflow-runs`, payload: {} });
    const runId = started.json().run.id as string;

    expect((await instance.inject({ method: "POST", url: `/api/workflow-runs/${runId}/cancel` })).statusCode).toBe(200);
    expect((await instance.inject({ method: "POST", url: `/api/workflow-runs/${runId}/cancel` })).json().run.status).toBe("cancelled");
    expect((await instance.inject({ method: "POST", url: `/api/workflow-runs/${runId}/continue`, payload: {} })).statusCode).toBe(409);
  });

  it("gates the Codex Test Bridge to explicit localhost development use and records provenance", async () => {
    const disabled = await app({ NODE_ENV: "development", ENABLE_CODEX_TEST_BRIDGE: "false" });
    const disabledProject = await project(disabled);
    const rejected = await disabled.inject({ method: "POST", url: `/api/dev/codex-test-bridge/projects/${disabledProject.id}/presentations`, headers: { host: "localhost:3001" }, payload: {} });
    expect(rejected.statusCode).toBe(404);

    const enabled = await app({ NODE_ENV: "development", ENABLE_CODEX_TEST_BRIDGE: "true" });
    const createdProject = await project(enabled);
    const brief = { topic: "桥接测试", goal: "验收", audience: ["开发者"], desiredAction: "批准", slideCount: 21, durationMinutes: 20, language: "zh-CN" as const, answers: {}, sources: [] };
    const blueprint = createPresentationBlueprint(brief);
    const document = createPresentationDocument({ projectId: createdProject.id, presentationId: "codex-deck", brief, blueprint });
    const imported = await enabled.inject({
      method: "POST",
      url: `/api/dev/codex-test-bridge/projects/${createdProject.id}/presentations`,
      headers: { host: "localhost:3001" },
      payload: { document, idempotencyKey: "codex-import-1" },
    });
    expect(imported.statusCode).toBe(201);
    expect(imported.json()).toMatchObject({ provenance: "manual-codex-test", presentation: { id: "codex-deck", projectId: createdProject.id } });
    expect(imported.json().presentation.slides).toHaveLength(21);
    expect(imported.json().run.source).toBe("manual-codex-test");

    const remoteHost = await enabled.inject({
      method: "POST",
      url: `/api/dev/codex-test-bridge/projects/${createdProject.id}/presentations`,
      headers: { host: "example.com" },
      payload: { document: { ...document, id: "remote-deck" } },
    });
    expect(remoteHost.statusCode).toBe(404);

    const forgedLocalHost = await enabled.inject({
      method: "POST",
      url: `/api/dev/codex-test-bridge/projects/${createdProject.id}/presentations`,
      headers: { host: "localhost:3001" },
      remoteAddress: "198.51.100.7",
      payload: { document: { ...document, id: "forged-host-deck" } },
    });
    expect(forgedLocalHost.statusCode).toBe(404);
  });
});
