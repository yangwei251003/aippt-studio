import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const packages = new Map();
function collectManifest(path) {
  try {
    const manifest = JSON.parse(readFileSync(path, "utf8")); if (!manifest.name || !manifest.version) return;
    const key = `${manifest.name}@${manifest.version}`;
    packages.set(key, { SPDXID: `SPDXRef-${Buffer.from(key).toString("hex").slice(0, 48)}`, name: manifest.name, versionInfo: manifest.version, downloadLocation: "NOASSERTION", filesAnalyzed: false, licenseConcluded: manifest.license ?? "NOASSERTION", licenseDeclared: manifest.license ?? "NOASSERTION", copyrightText: "NOASSERTION" });
  } catch {}
}
for (const entry of readdirSync(resolve(root, "node_modules", ".pnpm"), { withFileTypes: true })) {
  if (!entry.isDirectory()) continue; const modules = join(root, "node_modules", ".pnpm", entry.name, "node_modules");
  try { for (const child of readdirSync(modules, { withFileTypes: true })) {
    if (!child.isDirectory()) continue;
    if (child.name.startsWith("@")) {
      for (const scoped of readdirSync(join(modules, child.name), { withFileTypes: true })) {
        if (scoped.isDirectory()) collectManifest(join(modules, child.name, scoped.name, "package.json"));
      }
    } else {
      collectManifest(join(modules, child.name, "package.json"));
    }
  } } catch {}
}
for (const manifest of ["package.json", "apps/api/package.json", "apps/web/package.json", "apps/worker/package.json", "packages/core/package.json"]) collectManifest(resolve(root, manifest));
const document = { spdxVersion: "SPDX-2.3", dataLicense: "CC0-1.0", SPDXID: "SPDXRef-DOCUMENT", name: "AIPPT-FastBuild-3.2.0", documentNamespace: "https://aippt.local/sbom/3.2.0", creationInfo: { created: new Date().toISOString(), creators: ["Tool: scripts/generate-sbom.mjs"] }, packages: [...packages.values()].sort((a, b) => `${a.name}@${a.versionInfo}`.localeCompare(`${b.name}@${b.versionInfo}`)) };
mkdirSync(resolve(root, "output"), { recursive: true });
writeFileSync(resolve(root, "output", "sbom.spdx.json"), `${JSON.stringify(document, null, 2)}\n`);
console.log(`Wrote output/sbom.spdx.json with ${document.packages.length} packages`);
