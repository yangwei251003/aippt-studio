export type ResourceKind = "template-pptx" | "template-html" | "template-image" | "skill" | "media" | "showcase" | "website";
export type ResourceTier = "free" | "pro" | "single-purchase";
export type ResourceVisibility = "private" | "public" | "unlisted";
export type ResourceReviewStatus = "private" | "scanning" | "auto-reviewed" | "blocked" | "taken-down";
export type CreationMode = "standard" | "html" | "image";

export interface ResourceSummary {
  id: string;
  version: string;
  kind: ResourceKind;
  title: string;
  summary: string;
  author: string;
  styles: string[];
  industries: string[];
  license: string;
  tier: ResourceTier;
  priceCents?: number;
  currency?: "CNY" | string;
  visibility: ResourceVisibility;
  reviewStatus: ResourceReviewStatus;
  installed: boolean;
  entitled: boolean;
  previewUrl?: string;
  sourceUrl?: string;
  creationMode?: CreationMode;
  editable?: boolean;
  capabilities: string[];
  updatedAt?: string;
}

export interface ResourceDetail extends ResourceSummary {
  description?: string;
  notices?: string[];
  compatibility?: string[];
  previewUrls?: string[];
  provenance?: Array<{ label: string; value: string; url?: string }>;
}

export interface ResourceListFilters {
  query?: string;
  kind?: ResourceKind;
  tier?: ResourceTier;
  style?: string;
  industry?: string;
  cursor?: string;
  limit?: number;
}

export interface ResourceListResult {
  resources: ResourceSummary[];
  nextCursor?: string;
  total?: number;
  facets?: { styles?: string[]; industries?: string[] };
}

export interface ResourceProject {
  id: string;
  name: string;
  topic?: string;
  updatedAt?: string;
}

export interface ResourceBinding {
  resourceId: string;
  resourceVersion: string;
  creationMode: CreationMode;
  skillIds?: string[];
  assetPolicy?: { providers: Array<"seed" | "openverse" | "wikimedia" | "pexels" | "pixabay" | "unsplash-preview" | "openai" | "stability">; licenseAllowlist: Array<"CC0-1.0" | "PDM-1.0" | "CC-BY-4.0" | "generated" | "platform-distribution">; allowAiGeneration: boolean; requireAttribution: boolean };
}

export interface ResourceUploadInput {
  file: File;
  title: string;
  kind: Exclude<ResourceKind, "showcase" | "website">;
  license: string;
  publish: boolean;
  rightsAttested: boolean;
  tier: ResourceTier;
  priceCents?: number;
}
