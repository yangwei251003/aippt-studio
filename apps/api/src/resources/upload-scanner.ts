import path from "node:path";
import { ZipArchive } from "../upload/zip.js";
import { ResourceError, type ResourceKind } from "./types.js";

export interface UploadScanInput { filename: string; contentType: string; data: Uint8Array; declaredKind: ResourceKind; }
export interface UploadScanResult { accepted: boolean; requiresContainer: boolean; reasons: string[]; entries: string[]; }

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
const SECRET_PATTERN = /(?:sk-[a-z0-9_-]{16,}|AKIA[0-9A-Z]{16}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|(?:api[_-]?key|secret|token)\s*[:=]\s*["'][^"']{12,})/i;
const SCRIPT_EXTENSION = /\.(?:js|mjs|cjs|ts|tsx|py|sh|bat|cmd|ps1|exe|dll|com|jar|wasm)$/i;

function textEntries(archive: ZipArchive): Array<{ name: string; text: string }> {
  return archive.names().filter((name) => /\.(?:xml|rels|json|md|html|css|txt|ya?ml)$/i.test(name)).map((name) => ({ name, text: archive.get(name)?.toString("utf8") ?? "" }));
}

function assertSafeNames(names: string[]): void {
  for (const name of names) {
    const normalized = name.replaceAll("\\", "/");
    if (path.posix.isAbsolute(normalized) || normalized.split("/").includes("..") || normalized.includes("\0")) throw new ResourceError("UNSAFE_ARCHIVE_PATH", `Unsafe archive entry: ${name}`, 422);
  }
}

export class ResourceUploadScanner {
  scan(input: UploadScanInput): UploadScanResult {
    if (!input.data.byteLength || input.data.byteLength > MAX_UPLOAD_BYTES) throw new ResourceError("UPLOAD_SIZE_INVALID", "Upload must be between 1 byte and 50 MiB", 413);
    if (/\.pptm$/i.test(input.filename)) throw new ResourceError("MACRO_NOT_ALLOWED", "Macro-enabled PowerPoint files are not accepted", 422);
    if (input.declaredKind === "media") return this.scanMedia(input);
    if (!/\.(?:pptx|potx|zip)$/i.test(input.filename)) throw new ResourceError("UNSUPPORTED_RESOURCE_FILE", "Resource packages must be PPTX, POTX, or ZIP", 415);
    let archive: ZipArchive;
    try { archive = ZipArchive.open(Buffer.from(input.data)); }
    catch (error) { throw new ResourceError("INVALID_ARCHIVE", error instanceof Error ? error.message : "Invalid ZIP package", 422); }
    const entries = archive.names();
    assertSafeNames(entries);
    const texts = textEntries(archive);
    if (texts.some(({ text }) => SECRET_PATTERN.test(text))) throw new ResourceError("SECRET_DETECTED", "Package appears to contain a credential or private key", 422);

    if (input.declaredKind === "native-pptx") this.assertSafePptx(archive, entries, texts);
    if (input.declaredKind === "html-deck") this.assertSafeHtml(entries, texts);
    if (input.declaredKind === "image-style" && !entries.includes("resource-package.json")) throw new ResourceError("IMAGE_STYLE_MANIFEST_REQUIRED", "Image style ZIP requires resource-package.json", 422);
    if (input.declaredKind === "skill") return this.scanSkill(archive, entries, texts);
    return { accepted: true, requiresContainer: false, reasons: [], entries };
  }

  private scanMedia(input: UploadScanInput): UploadScanResult {
    const signatures: Array<[string, number[]]> = [["image/png", [0x89, 0x50, 0x4e, 0x47]], ["image/jpeg", [0xff, 0xd8, 0xff]], ["image/webp", [0x52, 0x49, 0x46, 0x46]]];
    const expected = signatures.find(([mime]) => mime === input.contentType);
    if (!expected || !expected[1].every((byte, index) => input.data[index] === byte)) throw new ResourceError("IMAGE_MAGIC_MISMATCH", "Only PNG, JPEG, and WebP images with matching file signatures are accepted", 415);
    if (input.contentType === "image/webp" && new TextDecoder().decode(input.data.slice(8, 12)) !== "WEBP") throw new ResourceError("IMAGE_MAGIC_MISMATCH", "WebP RIFF signature is incomplete", 415);
    return { accepted: true, requiresContainer: false, reasons: [], entries: [] };
  }

  private assertSafePptx(archive: ZipArchive, entries: string[], texts: Array<{ name: string; text: string }>): void {
    if (!archive.has("ppt/presentation.xml") || !archive.has("[Content_Types].xml")) throw new ResourceError("NOT_A_PRESENTATION", "OOXML package has no PowerPoint presentation", 422);
    if (entries.some((name) => /(?:vbaProject\.bin|ppt\/embeddings\/|activeX\/|oleObject)/i.test(name))) throw new ResourceError("ACTIVE_CONTENT_NOT_ALLOWED", "Macros, OLE objects, embeddings, and ActiveX are not accepted", 422);
    if (texts.some(({ name, text }) => name.endsWith(".rels") && /TargetMode=["']External["']/i.test(text))) throw new ResourceError("EXTERNAL_RELATIONSHIP_NOT_ALLOWED", "PowerPoint packages must not contain external relationships", 422);
  }

  private assertSafeHtml(entries: string[], texts: Array<{ name: string; text: string }>): void {
    if (!entries.includes("resource-package.json") || !entries.some((name) => /(?:^|\/)index\.html$/i.test(name))) throw new ResourceError("HTML_MANIFEST_REQUIRED", "HTML deck ZIP requires resource-package.json and index.html", 422);
    if (entries.some((name) => SCRIPT_EXTENSION.test(name))) throw new ResourceError("SCRIPT_NOT_ALLOWED", "HTML deck packages cannot contain executable scripts", 422);
    if (texts.some(({ text }) => /<script\b|\bon\w+\s*=|@import\s+url|(?:src|href)\s*=\s*["'](?:https?:)?\/\//i.test(text))) throw new ResourceError("REMOTE_OR_ACTIVE_HTML", "HTML packages must contain only offline, passive HTML and CSS", 422);
  }

  private scanSkill(archive: ZipArchive, entries: string[], texts: Array<{ name: string; text: string }>): UploadScanResult {
    if (!archive.has("SKILL.md") || !archive.has("skill-package.json")) throw new ResourceError("SKILL_MANIFEST_REQUIRED", "Skill ZIP requires SKILL.md and skill-package.json", 422);
    const manifestText = archive.get("skill-package.json")?.toString("utf8") ?? "";
    let manifest: unknown;
    try { manifest = JSON.parse(manifestText); } catch { throw new ResourceError("SKILL_MANIFEST_INVALID", "skill-package.json must be valid JSON", 422); }
    if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) throw new ResourceError("SKILL_MANIFEST_INVALID", "Skill manifest must be an object", 422);
    const scripts = entries.filter((name) => SCRIPT_EXTENSION.test(name));
    const networkClaims = texts.some(({ text }) => /\b(?:network|internet|fetch|curl|wget)\s*[:=]\s*(?:true|allow|enabled)/i.test(text));
    return { accepted: true, requiresContainer: scripts.length > 0, reasons: [...(scripts.length ? ["contains-executable-files"] : []), ...(networkClaims ? ["declares-network-access"] : [])], entries };
  }
}
