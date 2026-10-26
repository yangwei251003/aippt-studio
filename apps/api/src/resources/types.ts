export type ResourceKind = "native-pptx" | "html-deck" | "image-style" | "skill" | "media" | "showcase" | "website";
export type ResourceAccess = "free" | "pro" | "single-purchase";
export type ResourceVisibility = "private" | "public" | "unlisted";
export type ResourceStatus = "draft" | "auto-reviewed" | "blocked" | "takedown";
export type RedistributableLicense = "CC0-1.0" | "PDM-1.0" | "CC-BY-4.0" | "MIT" | "Apache-2.0" | "Proprietary-Platform-License";

export interface ResourcePackageManifestV2 {
  schemaVersion: 2;
  id: string;
  version: string;
  kind: ResourceKind;
  name: string;
  summary: string;
  author: { name: string; url?: string };
  source?: { url: string; revision?: string };
  license: RedistributableLicense;
  access: ResourceAccess;
  priceCny?: number;
  tags: string[];
  industries: string[];
  previewKeys: string[];
  objectKey?: string;
  contentSha256: string;
  capabilities: string[];
  createdAt: string;
}

export interface ResourceRecord {
  manifest: ResourcePackageManifestV2;
  ownerId: string;
  visibility: ResourceVisibility;
  status: ResourceStatus;
  rightsAttestedAt?: string;
  moderationReasons: string[];
  installedBy: string[];
  updatedAt: string;
}

export interface ResourceEntitlement {
  id: string;
  userId: string;
  resourceId: string;
  resourceVersion: string;
  source: "free" | "pro" | "single-purchase" | "owner";
  checkoutId?: string;
  createdAt: string;
}

export interface ResourceCheckout {
  id: string;
  userId: string;
  resourceId: string;
  resourceVersion: string;
  amountCny: number;
  provider: "MockResourceBillingProvider";
  mode: "development";
  idempotencyKey: string;
  status: "completed";
  createdAt: string;
}

export interface ResourceReport {
  id: string;
  resourceId: string;
  reporterId: string;
  reason: "copyright" | "malware" | "misleading" | "other";
  detail: string;
  createdAt: string;
}

export interface ResourceCatalogQuery {
  kind?: ResourceKind;
  access?: ResourceAccess;
  tag?: string;
  industry?: string;
  search?: string;
  includeUnlistedOwnedBy?: string;
}

export interface ResourceStore {
  putResource(record: ResourceRecord): Promise<ResourceRecord>;
  getResource(id: string, version?: string): Promise<ResourceRecord | undefined>;
  listResources(): Promise<ResourceRecord[]>;
  putEntitlement(record: ResourceEntitlement): Promise<ResourceEntitlement>;
  getEntitlement(userId: string, resourceId: string, version: string): Promise<ResourceEntitlement | undefined>;
  putCheckout(record: ResourceCheckout): Promise<ResourceCheckout>;
  getCheckoutByIdempotencyKey(userId: string, key: string): Promise<ResourceCheckout | undefined>;
  completeCheckout(checkout: ResourceCheckout, entitlement: ResourceEntitlement): Promise<{ checkout: ResourceCheckout; entitlement: ResourceEntitlement }>;
  putReport(record: ResourceReport): Promise<ResourceReport>;
}

export interface TemplateBinding {
  resourceId: string;
  resourceVersion: string;
  creationMode: "standard" | "html" | "image";
  skillIds: string[];
  assetPolicy: "seed-only" | "open-license" | "provider-search" | "generate";
}

export class ResourceError extends Error {
  constructor(readonly code: string, message: string, readonly statusCode = 400, readonly details: Record<string, unknown> = {}) {
    super(message);
    this.name = "ResourceError";
  }
}
