import { createHash, randomUUID } from "node:crypto";
import type { ObjectStore } from "../storage/object-store.js";
import { ResourceUploadScanner } from "./upload-scanner.js";
import { ResourceError, type RedistributableLicense, type ResourceAccess, type ResourceCheckout, type ResourceEntitlement, type ResourceKind, type ResourcePackageManifestV2, type ResourceRecord, type ResourceStore, type ResourceVisibility } from "./types.js";

const PUBLIC_LICENSES = new Set<RedistributableLicense>(["CC0-1.0", "PDM-1.0", "CC-BY-4.0", "MIT", "Apache-2.0", "Proprietary-Platform-License"]);

export interface ResourceUploadInput {
  userId: string;
  filename: string;
  contentType: string;
  data: Uint8Array;
  manifest: Omit<ResourcePackageManifestV2, "schemaVersion" | "contentSha256" | "objectKey" | "createdAt">;
}

export class ResourceService {
  constructor(private readonly store: ResourceStore, private readonly objects: ObjectStore, private readonly scanner = new ResourceUploadScanner()) {}

  async upload(input: ResourceUploadInput): Promise<ResourceRecord> {
    this.assertManifest(input.manifest);
    if (await this.store.getResource(input.manifest.id, input.manifest.version)) throw new ResourceError("RESOURCE_VERSION_EXISTS", "This resource version already exists", 409);
    const scan = this.scanner.scan({ filename: input.filename, contentType: input.contentType, data: input.data, declaredKind: input.manifest.kind });
    const hash = createHash("sha256").update(input.data).digest("hex");
    const extension = input.filename.toLocaleLowerCase().split(".").pop()?.replace(/[^a-z0-9]/g, "") || "bin";
    const objectKey = `resources/${input.userId}/${input.manifest.id}/${input.manifest.version}/${hash}.${extension}`;
    await this.objects.put(objectKey, input.data, input.contentType);
    const now = new Date().toISOString();
    const record: ResourceRecord = {
      manifest: { ...input.manifest, schemaVersion: 2, contentSha256: hash, objectKey, createdAt: now },
      ownerId: input.userId,
      visibility: "private",
      status: "draft",
      moderationReasons: scan.reasons,
      installedBy: [],
      updatedAt: now,
    };
    return this.store.putResource(record);
  }

  async publish(userId: string, id: string, options: { rightsAttested: boolean; visibility?: Exclude<ResourceVisibility, "private"> } = { rightsAttested: false }): Promise<ResourceRecord> {
    const record = await this.requireOwned(userId, id);
    if (!options.rightsAttested) throw new ResourceError("RIGHTS_ATTESTATION_REQUIRED", "Publishing requires a rights and license attestation", 422);
    if (!PUBLIC_LICENSES.has(record.manifest.license)) throw new ResourceError("LICENSE_NOT_ALLOWED", "This license cannot be published in the resource catalog", 422);
    if (record.moderationReasons.length) throw new ResourceError("RESOURCE_REQUIRES_REVIEW", "Resources with executable files, network claims, or unresolved scanner findings cannot be auto-published", 422, { reasons: record.moderationReasons });
    const next: ResourceRecord = { ...record, visibility: options.visibility ?? "public", status: "auto-reviewed", rightsAttestedAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    return this.store.putResource(next);
  }

  async install(userId: string, id: string, hasPro = false): Promise<ResourceEntitlement> {
    const record = await this.requireVisibleOrOwned(userId, id);
    const existing = await this.store.getEntitlement(userId, id, record.manifest.version);
    if (existing) return existing;
    let source: ResourceEntitlement["source"];
    if (record.ownerId === userId) source = "owner";
    else if (record.manifest.access === "free") source = "free";
    else if (record.manifest.access === "pro" && hasPro) source = "pro";
    else if (record.manifest.access === "single-purchase") throw new ResourceError("PURCHASE_REQUIRED", "This resource requires a single-item purchase", 402, { priceCny: record.manifest.priceCny });
    else throw new ResourceError("PRO_REQUIRED", "This resource requires Pro", 403);
    const entitlement = await this.store.putEntitlement({ id: randomUUID(), userId, resourceId: id, resourceVersion: record.manifest.version, source, createdAt: new Date().toISOString() });
    await this.store.putResource({ ...record, installedBy: [...new Set([...record.installedBy, userId])], updatedAt: new Date().toISOString() });
    return entitlement;
  }

  async checkout(userId: string, resourceId: string, idempotencyKey: string, env: NodeJS.ProcessEnv = process.env): Promise<{ checkout: ResourceCheckout; entitlement: ResourceEntitlement }> {
    if (env.NODE_ENV === "production") throw new ResourceError("MOCK_BILLING_DISABLED", "Mock resource billing is disabled in production", 501);
    if (!idempotencyKey.trim()) throw new ResourceError("IDEMPOTENCY_KEY_REQUIRED", "An idempotency key is required", 400);
    const record = await this.requireVisibleOrOwned(userId, resourceId);
    if (record.manifest.access !== "single-purchase" || !record.manifest.priceCny) throw new ResourceError("RESOURCE_NOT_PURCHASABLE", "Resource is not configured for single purchase", 409);
    const existing = await this.store.getCheckoutByIdempotencyKey(userId, idempotencyKey);
    if (existing) {
      if (existing.resourceId !== resourceId) throw new ResourceError("IDEMPOTENCY_KEY_REUSED", "Idempotency key was already used for another resource", 409);
      const entitlement = await this.store.getEntitlement(userId, resourceId, existing.resourceVersion);
      if (!entitlement) throw new ResourceError("ENTITLEMENT_INCONSISTENT", "Completed checkout is missing its entitlement", 500);
      return { checkout: existing, entitlement };
    }
    const now = new Date().toISOString();
    const checkout: ResourceCheckout = { id: randomUUID(), userId, resourceId, resourceVersion: record.manifest.version, amountCny: record.manifest.priceCny, provider: "MockResourceBillingProvider", mode: "development", idempotencyKey, status: "completed", createdAt: now };
    const completed = await this.store.completeCheckout(checkout, { id: randomUUID(), userId, resourceId, resourceVersion: record.manifest.version, source: "single-purchase", checkoutId: checkout.id, createdAt: now });
    if (completed.checkout.resourceId !== resourceId) throw new ResourceError("IDEMPOTENCY_KEY_REUSED", "Idempotency key was already used for another resource", 409);
    return completed;
  }

  async moderate(admin: boolean, id: string, action: "block" | "takedown" | "restore", reason: string): Promise<ResourceRecord> {
    if (!admin) throw new ResourceError("ADMIN_REQUIRED", "Administrator permission is required", 403);
    const record = await this.store.getResource(id);
    if (!record) throw new ResourceError("RESOURCE_NOT_FOUND", "Resource not found", 404);
    const status = action === "restore" ? "auto-reviewed" : action === "block" ? "blocked" : "takedown";
    return this.store.putResource({ ...record, status, moderationReasons: reason ? [...record.moderationReasons, reason.slice(0, 500)] : record.moderationReasons, updatedAt: new Date().toISOString() });
  }

  private assertManifest(manifest: ResourceUploadInput["manifest"]): void {
    if (!/^[a-z0-9][a-z0-9-]{2,79}$/.test(manifest.id)) throw new ResourceError("INVALID_RESOURCE_ID", "Resource id must be a lowercase slug", 422);
    if (!/^\d+\.\d+\.\d+(?:-[a-z0-9.-]+)?$/.test(manifest.version)) throw new ResourceError("INVALID_RESOURCE_VERSION", "Resource version must use semantic versioning", 422);
    if (!manifest.name.trim() || !manifest.summary.trim() || !manifest.author.name.trim()) throw new ResourceError("INCOMPLETE_MANIFEST", "Name, summary, and author are required", 422);
    if (manifest.access === "single-purchase" && (!manifest.priceCny || manifest.priceCny <= 0)) throw new ResourceError("PRICE_REQUIRED", "Single-purchase resources require a positive CNY price", 422);
    if (manifest.access !== "single-purchase" && manifest.priceCny !== undefined) throw new ResourceError("UNEXPECTED_PRICE", "Only single-purchase resources can declare a price", 422);
  }

  private async requireOwned(userId: string, id: string): Promise<ResourceRecord> {
    const record = await this.store.getResource(id);
    if (!record) throw new ResourceError("RESOURCE_NOT_FOUND", "Resource not found", 404);
    if (record.ownerId !== userId) throw new ResourceError("RESOURCE_FORBIDDEN", "Resource belongs to another user", 403);
    return record;
  }
  private async requireVisibleOrOwned(userId: string, id: string): Promise<ResourceRecord> {
    const record = await this.store.getResource(id);
    if (!record || record.status === "blocked" || record.status === "takedown" || (record.visibility !== "public" && record.ownerId !== userId)) throw new ResourceError("RESOURCE_NOT_FOUND", "Resource not found", 404);
    return record;
  }
}

export type { ResourceKind, ResourceAccess };
