import { randomUUID } from "node:crypto";
import type { RedistributableLicense } from "./types.js";

export interface AssetSearchQuery { query: string; orientation?: "landscape" | "portrait" | "square"; page?: number; limit?: number; }
export interface AssetSearchResult {
  provider: string;
  providerAssetId: string;
  title: string;
  previewUrl: string;
  sourceUrl: string;
  author: { name: string; url?: string };
  license: RedistributableLicense | "provider-terms";
  width: number;
  height: number;
  requiresAttribution: boolean;
  importable: boolean;
}
export interface AssetProvider { readonly id: string; isConfigured(): boolean; search(query: AssetSearchQuery): Promise<AssetSearchResult[]>; }
export interface MediaAsset {
  id: string;
  ownerId: string;
  provider: string;
  providerAssetId: string;
  objectKey: string;
  contentType: "image/png" | "image/jpeg" | "image/webp";
  width: number;
  height: number;
  author: AssetSearchResult["author"];
  sourceUrl: string;
  license: AssetSearchResult["license"];
  contentSha256: string;
  createdAt: string;
}

export class SeedAssetProvider implements AssetProvider {
  readonly id = "seed";
  constructor(private readonly assets: AssetSearchResult[]) {}
  isConfigured(): boolean { return true; }
  async search(query: AssetSearchQuery): Promise<AssetSearchResult[]> {
    const needle = query.query.trim().toLocaleLowerCase();
    return this.assets.filter((asset) => `${asset.title} ${asset.providerAssetId}`.toLocaleLowerCase().includes(needle)).slice(0, query.limit ?? 24);
  }
}

export interface ControlledAssetIngress {
  import(input: { provider: string; providerAssetId: string; ownerId: string }): Promise<Omit<MediaAsset, "id" | "createdAt">>;
}

export class AssetSearchService {
  constructor(private readonly providers: AssetProvider[], private readonly ingress?: ControlledAssetIngress) {}
  configuration(): Array<{ id: string; configured: boolean }> { return this.providers.map((provider) => ({ id: provider.id, configured: provider.isConfigured() })); }
  async search(query: AssetSearchQuery): Promise<{ results: AssetSearchResult[]; providers: Array<{ id: string; configured: boolean }> }> {
    const enabled = this.providers.filter((provider) => provider.isConfigured());
    const settled = await Promise.allSettled(enabled.map((provider) => provider.search(query)));
    const results = settled.flatMap((result) => result.status === "fulfilled" ? result.value : []);
    return { results: results.slice(0, query.limit ?? 24), providers: this.configuration() };
  }
  async import(ownerId: string, provider: string, providerAssetId: string): Promise<MediaAsset> {
    if (!this.ingress) throw new Error("Controlled asset ingress is not configured");
    const item = await this.ingress.import({ ownerId, provider, providerAssetId });
    return { ...item, id: randomUUID(), createdAt: new Date().toISOString() };
  }
}
