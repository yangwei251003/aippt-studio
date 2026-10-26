import path from "node:path";
import { parseDocx, parseXlsx } from "./ooxml.js";
import { parsePdf } from "./pdf.js";
import { parsePptx } from "./pptx.js";
import {
  MAX_UPLOAD_BYTES,
  UploadParseError,
  type ParsedUpload,
  type UploadKind,
} from "./types.js";

export * from "./types.js";

const OLE_COMPOUND_MAGIC = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
const canonicalMime: Record<UploadKind, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

function requestedKind(filename: string, mime: string): UploadKind {
  const extension = path.extname(filename).toLowerCase();
  if ([".docm", ".dotm", ".xlsm", ".xltm", ".pptm", ".potm"].includes(extension) || /macroenabled/i.test(mime)) throw new UploadParseError("MACRO_NOT_ALLOWED", "Macro-enabled Office files are not accepted");
  if (extension === ".pdf") return "pdf";
  if (extension === ".docx") return "docx";
  if (extension === ".xlsx") return "xlsx";
  if (extension === ".pptx" || extension === ".potx") return "pptx";
  if (mime === canonicalMime.pdf) return "pdf";
  if (mime === canonicalMime.docx) return "docx";
  if (mime === canonicalMime.xlsx) return "xlsx";
  if (mime === canonicalMime.pptx) return "pptx";
  throw new UploadParseError("UNSUPPORTED_TYPE", "Only PDF, DOCX, XLSX, and PPTX uploads are supported");
}

function validateOfficeMagic(buffer: Buffer): void {
  if (buffer.subarray(0, OLE_COMPOUND_MAGIC.length).equals(OLE_COMPOUND_MAGIC)) throw new UploadParseError("ENCRYPTED", "Encrypted Office containers are not supported");
  if (buffer.length < 4 || buffer.readUInt32LE(0) !== 0x04034b50) throw new UploadParseError("MAGIC_BYTES_MISMATCH", "The file does not start with an OOXML ZIP signature");
}

export async function parseUpload(input: Buffer | Uint8Array, filename: string, mime: string): Promise<ParsedUpload> {
  const buffer = Buffer.isBuffer(input) ? input : Buffer.from(input);
  if (buffer.length > MAX_UPLOAD_BYTES) throw new UploadParseError("FILE_TOO_LARGE", `Upload exceeds the ${MAX_UPLOAD_BYTES} byte limit`);
  if (buffer.length === 0) throw new UploadParseError("CORRUPT_FILE", "The upload is empty");
  const safeFilename = path.basename(filename.trim());
  if (!safeFilename || safeFilename.length > 255) throw new UploadParseError("UNSUPPORTED_TYPE", "A valid filename is required");
  const kind = requestedKind(safeFilename, mime.toLowerCase());

  if (kind === "pdf") {
    const parsed = parsePdf(buffer);
    return {
      kind,
      filename: safeFilename,
      mime: canonicalMime[kind],
      size: buffer.length,
      text: parsed.text,
      chunks: parsed.chunks,
      needsOcr: parsed.needsOcr,
      warnings: parsed.needsOcr ? ["PDF_NO_TEXT_NEEDS_OCR"] : [],
    };
  }

  validateOfficeMagic(buffer);
  if (kind === "pptx") return parsePptx(buffer, safeFilename);
  const parsed = kind === "docx" ? parseDocx(buffer) : parseXlsx(buffer);
  return {
    kind,
    filename: safeFilename,
    mime: canonicalMime[kind],
    size: buffer.length,
    text: parsed.text,
    chunks: parsed.chunks,
    needsOcr: false,
    warnings: parsed.text ? [] : ["NO_TEXT_CONTENT"],
  };
}
