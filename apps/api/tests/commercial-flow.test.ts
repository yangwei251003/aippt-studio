import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { PGliteAppStore } from "../src/db/pglite-store.js";
import { createApi } from "../src/runtime.js";
import { FakePresentationModel } from "../src/model/fake-model.js";
import { LocalObjectStore } from "../src/storage/object-store.js";
import type { SlideRenderService } from "../src/export/slide-renderer.js";

const openApps: Array<Awaited<ReturnType<typeof createApi>>> = [];
const renderer: SlideRenderService = {
  async renderPdf() { return new TextEncoder().encode("%PDF-commercial-test"); },
  async renderPngArchive() { return new Uint8Array([0x50, 0x4b, 0x03, 0x04]); },
};

async function app(env: NodeJS.ProcessEnv = {}) {
  const objectRoot = await mkdtemp(path.join(tmpdir(), "aippt-commercial-test-"));
  const instance = await createApi({
    env: { NODE_ENV: "development", ...env },
    store: new PGliteAppStore("memory://"),
    model: new FakePresentationModel(),
    objects: new LocalObjectStore(objectRoot),
    slideRenderer: renderer,
    inlineJobs: true,
  });
  openApps.push(instance);
  return instance;
}

const userHeaders = { "x-user-id": "commercial-user" };
const json = <T>(response: { json: <U>() => U }) => response.json<T>();

function usageBody(body: any) {
  return body.usage ?? body.account ?? body;
}

function balanceOf(body: any): number {
  const usage = usageBody(body);
  const value = usage.balance ?? usage.creditBalance ?? usage.credits?.balance ?? usage.credits?.remaining;
  expect(typeof value).toBe("number");
  return value;
}

async function createOwnedProject(instance: Awaited<ReturnType<typeof createApi>>, name: string): Promise<string> {
  const response = await instance.inject({ method: "POST", url: "/api/projects", headers: userHeaders, payload: { name, topic: name } });
  expect(response.statusCode).toBe(201);
  return json<{ project: { id: string } }>(response).project.id;
}

afterEach(async () => { await Promise.all(openApps.splice(0).map((instance) => instance.close())); });

describe("P2 commercial API contract", { timeout: 90_000 }, () => {
  it("serves one centralized Free/Pro configuration and grants Free users 300 initial points", async () => {
    const instance = await app();
    const plansResponse = await instance.inject({ method: "GET", url: "/api/billing/plans", headers: userHeaders });
    expect(plansResponse.statusCode).toBe(200);
    const plans = json<{ plans: Array<any> }>(plansResponse).plans;
    expect(plans).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "free", credits: 300, maxPages: 10, maxProjects: 3 }),
      expect.objectContaining({ id: "pro", monthlyCredits: 3000, maxPages: 30, monthlyPrice: 29, yearlyPrice: 268 }),
    ]));

    const usageResponse = await instance.inject({ method: "GET", url: "/api/account/usage", headers: userHeaders });
    expect(usageResponse.statusCode).toBe(200);
    expect(usageBody(json<any>(usageResponse))).toEqual(expect.objectContaining({ planId: "free" }));
    expect(balanceOf(json<any>(usageResponse))).toBe(300);
  });

  it("reserves atomically, never goes negative, settles, and is idempotent", async () => {
    const instance = await app();
    const projectId = await createOwnedProject(instance, "project-a");
    const reserve = async (pageCount: number, idempotencyKey: string) => instance.inject({
      method: "POST", url: "/api/credits/reserve", headers: userHeaders,
      payload: { action: "generate", pageCount, projectId, jobId: "job-a", idempotencyKey },
    });

    const first = await reserve(8, "generate-job-a");
    expect(first.statusCode).toBe(201);
    const firstReservation = json<{ reservation: { id: string; amount: number } }>(first).reservation;
    expect(firstReservation.amount).toBe(40);
    expect(balanceOf(json<any>(await instance.inject({ method: "GET", url: "/api/account/usage", headers: userHeaders })))).toBe(260);

    const replay = await reserve(8, "generate-job-a");
    expect([200, 201]).toContain(replay.statusCode);
    expect(json<{ reservation: { id: string } }>(replay).reservation.id).toBe(firstReservation.id);
    expect(balanceOf(json<any>(await instance.inject({ method: "GET", url: "/api/account/usage", headers: userHeaders })))).toBe(260);

    for (let index = 0; index < 5; index += 1) expect((await reserve(10, `drain-${index}`)).statusCode).toBe(201);
    const tooMuch = await reserve(10, "too-much");
    expect([402, 409]).toContain(tooMuch.statusCode);
    expect(balanceOf(json<any>(await instance.inject({ method: "GET", url: "/api/account/usage", headers: userHeaders })))).toBe(10);

    const settled = await instance.inject({ method: "POST", url: `/api/credits/${firstReservation.id}/settle`, headers: userHeaders, payload: { actualCost: 0 } });
    expect(settled.statusCode).toBe(200);
    expect(json<{ reservation: { status: string; amount: number; projectId: string; jobId: string } }>(settled).reservation).toMatchObject({ status: "settled", amount: 40, projectId, jobId: "job-a" });
  });

  it("prevents clients from refunding a live server reservation", async () => {
    const instance = await app();
    const projectId = await createOwnedProject(instance, "project-refund");
    const reserved = await instance.inject({
      method: "POST", url: "/api/credits/reserve", headers: userHeaders,
      payload: { action: "generate", pageCount: 10, projectId, jobId: "job-refund", idempotencyKey: "refund-job" },
    });
    const reservation = json<{ reservation: { id: string } }>(reserved).reservation;
    const refunded = await instance.inject({ method: "POST", url: `/api/credits/${reservation.id}/refund`, headers: userHeaders, payload: { reason: "generation_failed" } });
    expect(refunded.statusCode).toBe(403);
    expect(balanceOf(json<any>(await instance.inject({ method: "GET", url: "/api/account/usage", headers: userHeaders })))).toBe(250);
  });

  it("exposes Free/Pro page, project, model, template, history and export entitlements", async () => {
    const instance = await app();
    const free = usageBody(json<any>(await instance.inject({ method: "GET", url: "/api/account/usage", headers: userHeaders })));
    expect(free.entitlements).toEqual(expect.objectContaining({ maxPages: 10, maxProjects: 3, textModel: "standard", imageModel: "standard", brandedPptx: true, unbrandedPptx: false, pdf: false, png: false }));

    const upgraded = await instance.inject({ method: "POST", url: "/api/checkout", headers: userHeaders, payload: { plan: "pro", interval: "month", returnTo: "/projects/project-a/export", resumeAction: "unbranded-pptx" } });
    expect(upgraded.statusCode).toBe(200);
    const pro = usageBody(json<any>(await instance.inject({ method: "GET", url: "/api/account/usage", headers: userHeaders })));
    expect(pro.planId).toBe("pro");
    expect(pro.entitlements).toEqual(expect.objectContaining({ maxPages: 30, textModel: "advanced", imageModel: "advanced", brandedPptx: false, unbrandedPptx: true, pdf: true, png: true }));
    expect(balanceOf(pro)).toBe(3000);
  });

  it("uses an explicitly marked MockBillingProvider in development and rejects fake success in production", async () => {
    const development = await app({ BILLING_PROVIDER: "mock" });
    const dev = await development.inject({ method: "POST", url: "/api/checkout", headers: userHeaders, payload: { plan: "pro", interval: "year", returnTo: "/pricing", resumeAction: "export" } });
    expect(dev.statusCode).toBe(200);
    expect(json<any>(dev)).toEqual(expect.objectContaining({ provider: "MockBillingProvider", mode: "development", plan: "pro", interval: "year" }));

    const production = await app({ NODE_ENV: "production", BILLING_PROVIDER: "mock", AUTH_TRUSTED_USER_HEADER: "x-authenticated-user-id", AUTH_PROXY_SHARED_SECRET: "commercial-production-secret" });
    const productionHeaders = { "x-authenticated-user-id": "commercial-user", "x-aippt-auth-proxy-secret": "commercial-production-secret" };
    const prod = await production.inject({ method: "POST", url: "/api/checkout", headers: productionHeaders, payload: { plan: "pro", interval: "month", returnTo: "/pricing", resumeAction: "export" } });
    expect([403, 409, 501]).toContain(prod.statusCode);
    expect(balanceOf(json<any>(await production.inject({ method: "GET", url: "/api/account/usage", headers: productionHeaders })))).toBe(300);
  });
});
