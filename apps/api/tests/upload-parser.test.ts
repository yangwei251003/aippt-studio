import { readFile } from "node:fs/promises";
import path from "node:path";
import { createFiveSlideBlueprint, createFiveSlideDocument } from "@aippt/core";
import { describe, expect, it } from "vitest";
import { PptxRendererAdapter } from "../src/export/pptx-exporter.js";
import { MAX_UPLOAD_BYTES, UploadParseError, parseUpload } from "../src/upload/index.js";

const fixtureRoot = path.resolve(process.cwd(), "../../test-fixtures/documents");

async function fixture(kind: "pdf" | "docx" | "xlsx", name: string): Promise<Buffer> {
  return readFile(path.join(fixtureRoot, kind, name));
}

function crc32(data: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function storedZip(files: Record<string, string>): Buffer {
  const locals: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const [filename, value] of Object.entries(files)) {
    const name = Buffer.from(filename);
    const data = Buffer.from(value);
    const checksum = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    const directory = Buffer.alloc(46);
    directory.writeUInt32LE(0x02014b50, 0);
    directory.writeUInt16LE(20, 4);
    directory.writeUInt16LE(20, 6);
    directory.writeUInt32LE(checksum, 16);
    directory.writeUInt32LE(data.length, 20);
    directory.writeUInt32LE(data.length, 24);
    directory.writeUInt16LE(name.length, 28);
    directory.writeUInt32LE(offset, 42);
    locals.push(local, name, data);
    central.push(directory, name);
    offset += local.length + name.length + data.length;
  }
  const centralSize = central.reduce((size, part) => size + part.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(files).length, 8);
  end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, ...central, end]);
}

function xlsxWithSharedString(): Buffer {
  return storedZip({
    "[Content_Types].xml": "<Types/>",
    "xl/workbook.xml": '<workbook><sheets><sheet name="经营数据" r:id="rId1"/></sheets></workbook>',
    "xl/_rels/workbook.xml.rels": '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>',
    "xl/sharedStrings.xml": "<sst><si><t>华南收入</t></si></sst>",
    "xl/worksheets/sheet1.xml": '<worksheet><sheetData><row r="1"><c r="B2" t="s"><v>0</v></c><c r="C2"><v>128</v></c></row></sheetData></worksheet>',
  });
}

describe("parseUpload", () => {
  it("ingests a safe PPTX as a template candidate with editable-object and master analysis", async () => {
    const brief = { topic: "模板导入", audience: [], answers: {}, sources: [], language: "zh-CN" };
    const document = createFiveSlideDocument({ projectId: "p", presentationId: "d", brief, blueprint: createFiveSlideBlueprint(brief), now: "2026-08-22T00:00:00.000Z" });
    const parsed = await parseUpload(await new PptxRendererAdapter().render(document), "template.pptx", "application/vnd.openxmlformats-officedocument.presentationml.presentation");
    expect(parsed).toMatchObject({ kind: "pptx", template: { slideCount: 5 } });
    expect(parsed.template?.objectCounts.text).toBeGreaterThan(0);
  });
  it("extracts PDF text with page location", async () => {
    const result = await parseUpload(await fixture("pdf", "valid.pdf"), "valid.pdf", "application/pdf");
    expect(result).toMatchObject({ kind: "pdf", text: "Fixture", needsOcr: false });
    expect(result.chunks).toEqual([{ text: "Fixture", location: { kind: "page", page: 1 } }]);
  });

  it("extracts DOCX paragraphs", async () => {
    const result = await parseUpload(await fixture("docx", "valid.docx"), "valid.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    expect(result).toMatchObject({ kind: "docx", text: "Fixture", needsOcr: false });
    expect(result.chunks).toEqual([{ text: "Fixture", location: { kind: "paragraph", paragraph: 1 } }]);
  });

  it("extracts XLSX shared strings and values with sheet/cell locations", async () => {
    const result = await parseUpload(xlsxWithSharedString(), "data.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    expect(result.text).toBe("华南收入\n128");
    expect(result.chunks).toEqual([
      { text: "华南收入", location: { kind: "cell", sheet: "经营数据", cell: "B2" } },
      { text: "128", location: { kind: "cell", sheet: "经营数据", cell: "C2" } },
    ]);
  });

  it.each([
    ["pdf", "magic-bytes.pdf", "application/pdf"],
    ["docx", "magic-bytes.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
    ["xlsx", "magic-bytes.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
  ] as const)("rejects %s files whose magic bytes do not match", async (kind, name, mime) => {
    await expect(parseUpload(await fixture(kind, name), name, mime)).rejects.toMatchObject({ code: "MAGIC_BYTES_MISMATCH" });
  });

  it.each([
    ["docx", "macro.docm", "application/vnd.ms-word.document.macroEnabled.12"],
    ["xlsx", "macro.xlsm", "application/vnd.ms-excel.sheet.macroEnabled.12"],
  ] as const)("rejects macro-enabled %s uploads", async (kind, name, mime) => {
    await expect(parseUpload(await fixture(kind, name), name, mime)).rejects.toMatchObject({ code: "MACRO_NOT_ALLOWED" });
  });

  it.each([
    ["pdf", "encrypted.pdf", "application/pdf"],
    ["docx", "encrypted.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
    ["xlsx", "encrypted.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
  ] as const)("rejects encrypted %s uploads", async (kind, name, mime) => {
    await expect(parseUpload(await fixture(kind, name), name, mime)).rejects.toMatchObject({ code: "ENCRYPTED" });
  });

  it.each([
    ["pdf", "corrupt.pdf", "application/pdf"],
    ["docx", "corrupt.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
    ["xlsx", "corrupt.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
  ] as const)("rejects corrupt %s uploads", async (kind, name, mime) => {
    await expect(parseUpload(await fixture(kind, name), name, mime)).rejects.toMatchObject({ code: "CORRUPT_FILE" });
  });

  it("returns a clear OCR hint for a valid PDF with no text layer", async () => {
    const scanned = Buffer.from("%PDF-1.7\n1 0 obj << /Type /Catalog >> endobj\n2 0 obj << /Type /Page >> endobj\n%%EOF");
    const result = await parseUpload(scanned, "scan.pdf", "application/pdf");
    expect(result).toMatchObject({ text: "", needsOcr: true, warnings: ["PDF_NO_TEXT_NEEDS_OCR"] });
  });

  it("rejects uploads over the byte limit before parsing", async () => {
    const oversized = Buffer.alloc(MAX_UPLOAD_BYTES + 1);
    await expect(parseUpload(oversized, "large.pdf", "application/pdf")).rejects.toEqual(expect.objectContaining<Partial<UploadParseError>>({ code: "FILE_TOO_LARGE", statusCode: 413 }));
  });
});
