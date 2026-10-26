import type { ObjectStore } from "../storage/object-store.js";
import { AssetSearchService, SeedAssetProvider, type AssetSearchResult, type ControlledAssetIngress } from "./assets.js";
import { ResourceCatalog } from "./catalog.js";
import { ResourceService } from "./service.js";
import { DeclarativeSkillRunner, InMemorySkillRunStore, type SkillRunStore } from "./skills.js";
import { ResourceUploadScanner } from "./upload-scanner.js";
import type { ResourceStore } from "./types.js";

export interface ResourceModule {
  catalog: ResourceCatalog;
  resources: ResourceService;
  assets: AssetSearchService;
  skills: DeclarativeSkillRunner;
}

/**
 * Composition seam for runtime.ts. Production callers provide a transactional
 * ResourceStore, the existing ObjectStore, and a controlled asset ingress that
 * resolves provider IDs without accepting arbitrary client URLs.
 */
export function createResourceModule(input: {
  store: ResourceStore;
  objects: ObjectStore;
  seedAssets?: AssetSearchResult[];
  assetIngress?: ControlledAssetIngress;
  skillRuns?: SkillRunStore;
}): ResourceModule {
  return {
    catalog: new ResourceCatalog(input.store),
    resources: new ResourceService(input.store, input.objects, new ResourceUploadScanner()),
    assets: new AssetSearchService([new SeedAssetProvider(input.seedAssets ?? [])], input.assetIngress),
    skills: new DeclarativeSkillRunner(input.skillRuns ?? new InMemorySkillRunStore()),
  };
}
