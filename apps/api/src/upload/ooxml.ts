import path from "node:path";
import { UploadParseError, type UploadTextChunk } from "./types.js";
import { checkedText, decodeXml, textElements, xmlAttribute } from "./xml.js";
import { ZipArchive } from "./zip.js";

function xml(archive: ZipArchive, name: string): string | undefined {
  return archive.get(name)?.toString("utf8");
}

function requireMainXml(archive: ZipArchive, name: string): string {
  const value = xml(archive, name);
  if (!value) throw new UploadParseError("MAGIC_BYTES_MISMATCH", `The OOXML package does not contain ${name}`);
  if (!value.trimStart().startsWith("<") || !/<\/?[\w.-]+:?[\w.-]*/.test(value)) throw new UploadParseError("CORRUPT_FILE", `${name} is not valid XML`);
  return value;
}

function rejectMacros(archive: ZipArchive): void {
  if (archive.names().some((name) => /(?:^|\/)vbaProject\.bin$/i.test(name))) throw new UploadParseError("MACRO_NOT_ALLOWED", "Macro-enabled Office uploads are not supported");
  if (archive.has("EncryptedPackage") || archive.has("EncryptionInfo")) throw new UploadParseError("ENCRYPTED", "Encrypted Office uploads are not supported");
}

export function parseDocx(buffer: Buffer): { text: string; chunks: UploadTextChunk[] } {
  const archive = ZipArchive.open(buffer);
  rejectMacros(archive);
  const document = requireMainXml(archive, "word/document.xml");
  if (!/<(?:[\w.-]+:)?document\b/i.test(document) || !/<(?:[\w.-]+:)?body\b/i.test(document)) throw new UploadParseError("CORRUPT_FILE", "The DOCX document body is invalid");
  const chunks: UploadTextChunk[] = [];
  let paragraph = 0;
  for (const match of document.matchAll(/<(?:[\w.-]+:)?p\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?p\s*>/gi)) {
    paragraph += 1;
    const text = textElements(match[1] ?? "");
    if (text) chunks.push({ text, location: { kind: "paragraph", paragraph } });
  }
  return { text: checkedText(chunks), chunks };
}

function sharedStrings(archive: ZipArchive): string[] {
  const source = xml(archive, "xl/sharedStrings.xml");
  if (!source) return [];
  return [...source.matchAll(/<(?:[\w.-]+:)?si\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?si\s*>/gi)].map((match) => textElements(match[1] ?? ""));
}

function relationships(archive: ZipArchive): Map<string, string> {
  const source = xml(archive, "xl/_rels/workbook.xml.rels") ?? "";
  const result = new Map<string, string>();
  for (const match of source.matchAll(/<(?:[\w.-]+:)?Relationship\b([^>]*)\/?\s*>/gi)) {
    const id = xmlAttribute(match[1] ?? "", "Id");
    const target = xmlAttribute(match[1] ?? "", "Target");
    if (!id || !target || /^https?:/i.test(target)) continue;
    const normalized = target.startsWith("/") ? target.slice(1) : path.posix.normalize(path.posix.join("xl", target));
    if (!normalized.startsWith("../") && !normalized.includes("/../")) result.set(id, normalized);
  }
  return result;
}

interface SheetDescriptor { name: string; entry: string }

function sheets(archive: ZipArchive, workbook: string): SheetDescriptor[] {
  const relationMap = relationships(archive);
  const worksheetEntries = archive.names().filter((name) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(name)).sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
  const result: SheetDescriptor[] = [];
  let index = 0;
  for (const match of workbook.matchAll(/<(?:[\w.-]+:)?sheet\b([^>]*)\/?\s*>/gi)) {
    const attributes = match[1] ?? "";
    const name = xmlAttribute(attributes, "name") ?? `Sheet${index + 1}`;
    const relation = xmlAttribute(attributes, "r:id");
    const entry = relation ? relationMap.get(relation) : undefined;
    result.push({ name, entry: entry ?? worksheetEntries[index] ?? `xl/worksheets/sheet${index + 1}.xml` });
    index += 1;
  }
  if (!result.length) return worksheetEntries.map((entry, sheetIndex) => ({ name: `Sheet${sheetIndex + 1}`, entry }));
  return result;
}

function cellValue(body: string, type: string | undefined, strings: readonly string[]): string {
  if (type === "inlineStr") return textElements(body);
  const raw = /<(?:[\w.-]+:)?v\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?v\s*>/i.exec(body)?.[1];
  if (raw === undefined) return "";
  const value = decodeXml(raw).trim();
  if (type !== "s") return value;
  const index = Number.parseInt(value, 10);
  if (!Number.isInteger(index) || strings[index] === undefined) throw new UploadParseError("CORRUPT_FILE", "An XLSX shared-string reference is invalid");
  return strings[index];
}

export function parseXlsx(buffer: Buffer): { text: string; chunks: UploadTextChunk[] } {
  const archive = ZipArchive.open(buffer);
  rejectMacros(archive);
  const workbook = requireMainXml(archive, "xl/workbook.xml");
  if (!/<(?:[\w.-]+:)?workbook\b/i.test(workbook)) throw new UploadParseError("CORRUPT_FILE", "The XLSX workbook XML is invalid");
  const strings = sharedStrings(archive);
  const chunks: UploadTextChunk[] = [];
  for (const sheet of sheets(archive, workbook)) {
    const source = xml(archive, sheet.entry);
    if (!source) throw new UploadParseError("CORRUPT_FILE", `Worksheet ${sheet.entry} is missing`);
    for (const match of source.matchAll(/<(?:[\w.-]+:)?c\b([^>]*)>([\s\S]*?)<\/(?:[\w.-]+:)?c\s*>/gi)) {
      const attributes = match[1] ?? "";
      const cell = xmlAttribute(attributes, "r") ?? "?";
      const value = cellValue(match[2] ?? "", xmlAttribute(attributes, "t"), strings);
      if (value) chunks.push({ text: value, location: { kind: "cell", sheet: sheet.name, cell } });
    }
  }
  return { text: checkedText(chunks), chunks };
}
