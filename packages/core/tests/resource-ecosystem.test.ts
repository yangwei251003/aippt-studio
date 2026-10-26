import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  executableSkillCatalog,
  executableTemplateCatalog,
  mediaAssetManifestSchema,
  resourceLibrarySummary,
  resourcePackageManifestV2Schema,
  seedAssetCatalog,
  skillPackageManifestV2Schema,
} from "../src/resource-ecosystem.js";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

describe("resource ecosystem V2", () => {
  it("ships exactly 48 executable templates, split evenly across three modes", () => {
    expect(executableTemplateCatalog).toHaveLength(48);
    expect(new Set(executableTemplateCatalog.map((item) => item.id)).size).toBe(48);
    expect(executableTemplateCatalog.filter((item) => item.type === "native-pptx")).toHaveLength(16);
    expect(executableTemplateCatalog.filter((item) => item.type === "html")).toHaveLength(16);
    expect(executableTemplateCatalog.filter((item) => item.type === "image-deck")).toHaveLength(16);
    expect(executableTemplateCatalog.every((item) => resourcePackageManifestV2Schema.safeParse(item).success)).toBe(true);
    expect(executableTemplateCatalog.every((item) => item.capabilities.executable && item.capabilities.sceneCompatible)).toBe(true);
  });

  it("assigns 6 free, 8 pro, and 2 single-purchase templates per mode with the approved prices", () => {
    for (const type of ["native-pptx", "html", "image-deck"] as const) {
      const group = executableTemplateCatalog.filter((item) => item.type === type);
      expect(group.filter((item) => item.accessTier === "free")).toHaveLength(6);
      expect(group.filter((item) => item.accessTier === "pro")).toHaveLength(8);
      expect(group.filter((item) => item.accessTier === "single-purchase")).toHaveLength(2);
      expect(group.filter((item) => item.accessTier === "single-purchase").every((item) => item.priceCny === (type === "html" ? 19.9 : 29.9))).toBe(true);
    }
  });

  it("ships 12 declarative, one-shot skills without host shell or secret access", () => {
    expect(executableSkillCatalog).toHaveLength(12);
    expect(new Set(executableSkillCatalog.map((item) => item.id)).size).toBe(12);
    expect(executableSkillCatalog.filter((item) => item.accessTier === "free")).toHaveLength(6);
    expect(executableSkillCatalog.filter((item) => item.accessTier === "pro")).toHaveLength(6);
    expect(executableSkillCatalog.every((item) => skillPackageManifestV2Schema.safeParse(item).success)).toBe(true);
    expect(executableSkillCatalog.every((item) => item.execution.hostShell === false && item.execution.network === false)).toBe(true);
  });

  it("ships 96 original offline seed assets, eight in each of twelve categories", () => {
    expect(seedAssetCatalog).toHaveLength(96);
    expect(new Set(seedAssetCatalog.map((item) => item.id)).size).toBe(96);
    expect(new Set(seedAssetCatalog.map((item) => item.category)).size).toBe(12);
    for (const category of new Set(seedAssetCatalog.map((item) => item.category))) {
      expect(seedAssetCatalog.filter((item) => item.category === category)).toHaveLength(8);
    }
    expect(seedAssetCatalog.every((item) => mediaAssetManifestSchema.safeParse(item).success)).toBe(true);
    expect(seedAssetCatalog.every((item) => item.provenance.method === "aippt-original-vector")).toBe(true);
  });

  it("keeps every preview, asset, and skill instruction path inside the checked-in library", () => {
    const paths = [
      ...executableTemplateCatalog.map((item) => item.previewPath),
      ...executableSkillCatalog.map((item) => item.instructionPath),
      ...seedAssetCatalog.flatMap((item) => [item.assetPath, item.previewPath]),
    ];
    expect(paths.every((path) => path.startsWith("assets/resource-library/") && !path.includes(".."))).toBe(true);
    expect(paths.every((path) => existsSync(resolve(repositoryRoot, path)))).toBe(true);
  });

  it("keeps checked-in SVG resources offline and free from executable markup", () => {
    const svgPaths = [
      ...executableTemplateCatalog.map((item) => item.previewPath),
      ...seedAssetCatalog.map((item) => item.assetPath),
    ];
    for (const path of svgPaths) {
      const content = readFileSync(resolve(repositoryRoot, path), "utf8");
      expect(content).toMatch(/^<svg[^>]+width="1600"[^>]+height="900"/);
      expect(content).not.toMatch(/<script|javascript:|(?:href|src)=["']https?:\/\/|url\(["']?https?:\/\/|xlink:href|<foreignObject/i);
    }
  });

  it("publishes a stable catalog summary", () => {
    expect(resourceLibrarySummary).toEqual(expect.objectContaining({ templates: 48, skills: 12, seedAssets: 96 }));
  });
});
