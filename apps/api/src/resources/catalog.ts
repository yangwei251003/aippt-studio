import { randomUUID } from "node:crypto";
import type { ResourceCatalogQuery, ResourceCheckout, ResourceEntitlement, ResourceRecord, ResourceReport, ResourceStore } from "./types.js";

function key(id: string, version: string): string { return `${id}@${version}`; }

export class InMemoryResourceStore implements ResourceStore {
  private readonly resources = new Map<string, ResourceRecord>();
  private readonly entitlements = new Map<string, ResourceEntitlement>();
  private readonly checkouts = new Map<string, ResourceCheckout>();
  private readonly reports = new Map<string, ResourceReport>();

  async putResource(record: ResourceRecord): Promise<ResourceRecord> {
    this.resources.set(key(record.manifest.id, record.manifest.version), structuredClone(record));
    return structuredClone(record);
  }
  async getResource(id: string, version?: string): Promise<ResourceRecord | undefined> {
    const matches = [...this.resources.values()].filter((item) => item.manifest.id === id && (!version || item.manifest.version === version));
    const value = matches.sort((a, b) => b.manifest.version.localeCompare(a.manifest.version, undefined, { numeric: true }))[0];
    return value ? structuredClone(value) : undefined;
  }
  async listResources(): Promise<ResourceRecord[]> { return [...this.resources.values()].map((item) => structuredClone(item)); }
  async putEntitlement(record: ResourceEntitlement): Promise<ResourceEntitlement> {
    const entitlementKey = `${record.userId}:${key(record.resourceId, record.resourceVersion)}`;
    const existing = this.entitlements.get(entitlementKey);
    if (existing) return structuredClone(existing);
    this.entitlements.set(entitlementKey, structuredClone(record));
    return structuredClone(record);
  }
  async getEntitlement(userId: string, resourceId: string, version: string): Promise<ResourceEntitlement | undefined> {
    const value = this.entitlements.get(`${userId}:${key(resourceId, version)}`);
    return value ? structuredClone(value) : undefined;
  }
  async putCheckout(record: ResourceCheckout): Promise<ResourceCheckout> {
    const checkoutKey = `${record.userId}:${record.idempotencyKey}`;
    const existing = this.checkouts.get(checkoutKey);
    if (existing) return structuredClone(existing);
    this.checkouts.set(checkoutKey, structuredClone(record));
    return structuredClone(record);
  }
  async getCheckoutByIdempotencyKey(userId: string, idempotencyKey: string): Promise<ResourceCheckout | undefined> {
    const value = this.checkouts.get(`${userId}:${idempotencyKey}`);
    return value ? structuredClone(value) : undefined;
  }
  async completeCheckout(checkout: ResourceCheckout, entitlement: ResourceEntitlement): Promise<{ checkout: ResourceCheckout; entitlement: ResourceEntitlement }> {
    const persistedCheckout = await this.putCheckout(checkout);
    const persistedEntitlement = await this.putEntitlement({ ...entitlement, checkoutId: persistedCheckout.id });
    return { checkout: persistedCheckout, entitlement: persistedEntitlement };
  }
  async putReport(record: ResourceReport): Promise<ResourceReport> { this.reports.set(record.id, structuredClone(record)); return structuredClone(record); }
}

export class ResourceCatalog {
  constructor(private readonly store: ResourceStore) {}

  async list(query: ResourceCatalogQuery = {}): Promise<ResourceRecord[]> {
    const needle = query.search?.trim().toLocaleLowerCase();
    return (await this.store.listResources())
      .filter((item) => item.status === "auto-reviewed")
      .filter((item) => item.visibility === "public" || query.includeUnlistedOwnedBy === item.ownerId)
      .filter((item) => !query.kind || item.manifest.kind === query.kind)
      .filter((item) => !query.access || item.manifest.access === query.access)
      .filter((item) => !query.tag || item.manifest.tags.includes(query.tag))
      .filter((item) => !query.industry || item.manifest.industries.includes(query.industry))
      .filter((item) => !needle || `${item.manifest.name} ${item.manifest.summary} ${item.manifest.tags.join(" ")}`.toLocaleLowerCase().includes(needle))
      .sort((left, right) => left.manifest.name.localeCompare(right.manifest.name, "zh-CN"));
  }

  async getVisible(id: string, userId?: string, version?: string): Promise<ResourceRecord | undefined> {
    const item = await this.store.getResource(id, version);
    if (!item || item.status === "takedown" || item.status === "blocked") return undefined;
    if (item.visibility === "public" || item.ownerId === userId) return item;
    return undefined;
  }

  async report(resourceId: string, reporterId: string, reason: ResourceReport["reason"], detail = ""): Promise<ResourceReport> {
    return this.store.putReport({ id: randomUUID(), resourceId, reporterId, reason, detail: detail.slice(0, 2_000), createdAt: new Date().toISOString() });
  }
}
