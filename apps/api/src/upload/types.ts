export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
export const MAX_EXPANDED_BYTES = 80 * 1024 * 1024;
export const MAX_EXTRACTED_TEXT_CHARS = 2_000_000;

export type UploadKind = "pdf" | "docx" | "xlsx" | "pptx";
export type UploadWarning = "PDF_NO_TEXT_NEEDS_OCR" | "NO_TEXT_CONTENT";

export type UploadLocation =
  | { kind: "page"; page: number }
  | { kind: "paragraph"; paragraph: number }
  | { kind: "cell"; sheet: string; cell: string }
  | { kind: "slide"; slide: number };

export interface UploadTextChunk {
  text: string;
  location: UploadLocation;
}

export interface ParsedUpload {
  kind: UploadKind;
  filename: string;
  mime: string;
  size: number;
  text: string;
  chunks: UploadTextChunk[];
  needsOcr: boolean;
  warnings: UploadWarning[];
  template?: {
    slideCount: number;
    masterCount: number;
    layoutCount: number;
    fonts: string[];
    themeColors: string[];
    objectCounts: Record<string, number>;
    lockedPreviewCount: number;
    removedRiskCounts: Record<string, number>;
  };
}

export type UploadParseErrorCode =
  | "UNSUPPORTED_TYPE"
  | "MAGIC_BYTES_MISMATCH"
  | "MACRO_NOT_ALLOWED"
  | "ENCRYPTED"
  | "CORRUPT_FILE"
  | "FILE_TOO_LARGE"
  | "EXPANDED_CONTENT_TOO_LARGE";

export class UploadParseError extends Error {
  readonly statusCode: number;

  constructor(readonly code: UploadParseErrorCode, message: string) {
    super(message);
    this.name = "UploadParseError";
    this.statusCode = code === "FILE_TOO_LARGE" || code === "EXPANDED_CONTENT_TOO_LARGE" ? 413 : 400;
  }
}
