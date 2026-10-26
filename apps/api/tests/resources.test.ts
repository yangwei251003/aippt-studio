import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { LocalObjectStore } from "../src/storage/object-store.js";
import { AssetSearchService, DeclarativeSkillRunner, InMemoryResourceStore, InMemorySkillRunStore, ResourceCatalog, ResourceError, ResourceService, ResourceUploadScanner, SeedAssetProvider, type ResourceUploadInput, type SkillPackageManifestV2 } from "../src/resources/index.js";

async function zip(entries: Record<string, string>): Promise<Uint8Array> {
  const archive = new JSZip();
  for (const [name, value] of Object.entries(entries)) archive.file(name, value);
  return archive.generateAsync({ type: "uint8array" });
}

async function pptx(extra: Record<string, string> = {}): Promise<Uint8Array> {
  return zip({
    "[Content_Types].xml": "<Types/>",
    "ppt/presentation.xml": "<p:presentation/>",
    "ppt/slides/slide1.xml": "<p:sld/>",
    ...extra,
  });
}

function uploadInput(data: Uint8Array, overrides: Partial<ResourceUploadInput["manifest"]> = {}): ResourceUploadInput {
  return {
    userId: "creator",
    filename: "consulting.pptx",
    contentType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    data,
    manifest: {
      id: "consulting-minimal",
      version: "1.0.0",
      kind: "native-pptx",
      name: "Consulting Minimal",
      summary: "An editable strategy presentation theme",
      author: { name: "AIPPT" },
      license: "Proprietary-Platform-License",
      access: "single-purchase",
      priceCny: 29.9,
      tags: ["strategy"],
      industries: ["consulting"],
      previewKeys: [],
      capabilities: ["editable"],
      ...overrides,
    },
  };
}

describe("resource upload security", () => {
  const scanner = new ResourceUploadScanner();

  it("accepts passive PPTX but rejects macros, embeddings, external relations and secrets", async () => {
    expect(scanner.scan({ filename: "safe.pptx", contentType: "application/vnd.openxmlformats-officedocument.presentationml.presentation", data: await pptx(), declaredKind: "native-pptx" }).accepted).toBe(true);
    expect(() => scanner.scan({ filename: "unsafe.pptm", contentType: "application/octet-stream", data: new Uint8Array([1]), declaredKind: "native-pptx" })).toThrowError(expect.objectContaining({ code: "MACRO_NOT_ALLOWED" }));
    const embedded = await pptx({ "ppt/embeddings/payload.bin": "payload" });
    const external = await pptx({ "ppt/_rels/presentation.xml.rels": '<Relationship TargetMode="External" Target="http://127.0.0.1"/>' });
    const leaked = await zip({ "SKILL.md": "api_key='this-is-a-secret-key-value'", "skill-package.json": "{}" });
    expect(() => scanner.scan({ filename: "unsafe.pptx", contentType: "application/octet-stream", data: embedded, declaredKind: "native-pptx" })).toThrowError(expect.objectContaining({ code: "ACTIVE_CONTENT_NOT_ALLOWED" }));
    expect(() => scanner.scan({ filename: "unsafe.pptx", contentType: "application/octet-stream", data: external, declaredKind: "native-pptx" })).toThrowError(expect.objectContaining({ code: "EXTERNAL_RELATIONSHIP_NOT_ALLOWED" }));
    expect(() => scanner.scan({ filename: "leak.zip", contentType: "application/zip", data: leaked, declaredKind: "skill" })).toThrowError(expect.objectContaining({ code: "SECRET_DETECTED" }));
  });

  it("permits passive offline HTML and classifies executable skills without executing them", async () => {
    const html = await zip({ "resource-package.json": "{}", "index.html": "<main>Offline deck</main>", "theme.css": "main { color: navy }" });
    expect(scanner.scan({ filename: "deck.zip", contentType: "application/zip", data: html, declaredKind: "html-deck" })).toMatchObject({ accepted: true, requiresContainer: false });
    const activeHtml = await zip({ "resource-package.json": "{}", "index.html": '<script src="https://example.test/deck.js"></script>' });
    expect(() => scanner.scan({ filename: "active.zip", contentType: "application/zip", data: activeHtml, declaredKind: "html-deck" })).toThrowError(expect.objectContaining({ code: "REMOTE_OR_ACTIVE_HTML" }));
    const skill = await zip({ "SKILL.md": "# Formatter", "skill-package.json": "{}", "scripts/run.py": "print('never executed')" });
    expect(scanner.scan({ filename: "skill.zip", contentType: "application/zip", data: skill, declaredKind: "skill" })).toMatchObject({ accepted: true, requiresContainer: true, reasons: ["contains-executable-files"] });
  });
});

describe("resource catalog, publishing, and mock single purchase", () => {
  it("keeps uploads private, requires rights attestation, and grants an idempotent entitlement", async () => {
    const store = new InMemoryResourceStore();
    const objects = new LocalObjectStore(await mkdtemp(path.join(tmpdir(), "aippt-resource-test-")));
    const service = new ResourceService(store, objects);
    const catalog = new ResourceCatalog(store);
    const uploaded = await service.upload(uploadInput(await pptx()));
    expect(uploaded).toMatchObject({ visibility: "private", status: "draft", ownerId: "creator" });
    await expect(service.publish("creator", uploaded.manifest.id, { rightsAttested: false })).rejects.toMatchObject({ code: "RIGHTS_ATTESTATION_REQUIRED" });
    await service.publish("creator", uploaded.manifest.id, { rightsAttested: true });
    expect(await catalog.list({ kind: "native-pptx", search: "strategy" })).toHaveLength(1);

    const first = await service.checkout("buyer", uploaded.manifest.id, "buy-consulting", { NODE_ENV: "development" });
    const replay = await service.checkout("buyer", uploaded.manifest.id, "buy-consulting", { NODE_ENV: "development" });
    expect(replay.checkout.id).toBe(first.checkout.id);
    expect(replay.entitlement.id).toBe(first.entitlement.id);
    await expect(service.checkout("buyer", uploaded.manifest.id, "another-key", { NODE_ENV: "production" })).rejects.toMatchObject({ code: "MOCK_BILLING_DISABLED" });
  });

  it("does not auto-publish a Skill package that requires a container or declares network access", async () => {
    const store = new InMemoryResourceStore();
    const service = new ResourceService(store, new LocalObjectStore(await mkdtemp(path.join(tmpdir(), "aippt-resource-test-"))));
    const data = await zip({ "SKILL.md": "# Network helper\nnetwork: allow", "skill-package.json": "{}", "scripts/run.py": "print('container only')" });
    const uploaded = await service.upload({ ...uploadInput(data, { id: "network-skill", kind: "skill", access: "free", priceCny: undefined }), filename: "network-skill.zip", contentType: "application/zip" });
    expect(uploaded.moderationReasons).toEqual(expect.arrayContaining(["contains-executable-files", "declares-network-access"]));
    await expect(service.publish("creator", uploaded.manifest.id, { rightsAttested: true })).rejects.toMatchObject({ code: "RESOURCE_REQUIRES_REVIEW" });
  });

  it("enforces ownership, Pro access, and administrator moderation", async () => {
    const store = new InMemoryResourceStore();
    const service = new ResourceService(store, new LocalObjectStore(await mkdtemp(path.join(tmpdir(), "aippt-resource-test-"))));
    const uploaded = await service.upload(uploadInput(await pptx(), { id: "pro-deck", access: "pro", priceCny: undefined }));
    await expect(service.publish("stranger", uploaded.manifest.id, { rightsAttested: true })).rejects.toMatchObject({ code: "RESOURCE_FORBIDDEN" });
    await service.publish("creator", uploaded.manifest.id, { rightsAttested: true });
    await expect(service.install("free-user", uploaded.manifest.id, false)).rejects.toMatchObject({ code: "PRO_REQUIRED" });
    expect((await service.install("pro-user", uploaded.manifest.id, true)).source).toBe("pro");
    await expect(service.moderate(false, uploaded.manifest.id, "takedown", "copyright")).rejects.toMatchObject({ code: "ADMIN_REQUIRED" });
    expect((await service.moderate(true, uploaded.manifest.id, "takedown", "copyright")).status).toBe("takedown");
  });
});

describe("asset providers and trusted declarative skills", () => {
  it("searches the no-key seed provider and exposes provider configuration", async () => {
    const provider = new SeedAssetProvider([{ provider: "seed", providerAssetId: "city-01", title: "Pazhou city skyline", previewUrl: "/assets/city-01.jpg", sourceUrl: "/assets/city-01.jpg", author: { name: "AIPPT" }, license: "CC0-1.0", width: 1600, height: 900, requiresAttribution: false, importable: true }]);
    const result = await new AssetSearchService([provider]).search({ query: "city" });
    expect(result.providers).toEqual([{ id: "seed", configured: true }]);
    expect(result.results[0]).toMatchObject({ providerAssetId: "city-01", importable: true });
  });

  it("executes only registered declarative handlers and refuses container skills", async () => {
    const store = new InMemorySkillRunStore();
    const runner = new DeclarativeSkillRunner(store);
    const manifest: SkillPackageManifestV2 = { schemaVersion: 2, id: "brief-diagnosis", version: "1.0.0", name: "Brief diagnosis", description: "Checks a brief", allowedTools: ["presentation.read"], execution: "declarative", inputSchema: {}, outputSchema: {} };
    runner.register(manifest, async (input, context) => ({ input, tools: context.allowedTools }));
    const run = await runner.start({ userId: "user-a", skillId: manifest.id, version: manifest.version, payload: { topic: "Pazhou" } });
    await expect.poll(async () => (await store.getRun(run.id))?.status).toBe("completed");
    expect(await runner.events(run.id, "user-a")).toEqual(expect.arrayContaining([expect.objectContaining({ type: "queued" }), expect.objectContaining({ type: "started" }), expect.objectContaining({ type: "completed" })]));
    runner.register({ ...manifest, id: "external-script", execution: "requires-container" });
    await expect(runner.start({ userId: "user-a", skillId: "external-script", version: "1.0.0", payload: {} })).rejects.toMatchObject({ code: "SANDBOX_UNAVAILABLE" });
    await expect(runner.events(run.id, "other-user")).rejects.toMatchObject({ code: "SKILL_RUN_NOT_FOUND" });
  });
});

describe("ResourceError", () => {
  it("carries stable API details", () => {
    expect(new ResourceError("EXAMPLE", "message", 409, { safe: true })).toMatchObject({ code: "EXAMPLE", statusCode: 409, details: { safe: true } });
  });
});
