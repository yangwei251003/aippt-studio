import { inflateSync } from "node:zlib";
import { MAX_EXPANDED_BYTES, MAX_EXTRACTED_TEXT_CHARS, UploadParseError, type UploadTextChunk } from "./types.js";

function decodePdfLiteral(value: string): string {
  let output = "";
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index] ?? "";
    if (character !== "\\") { output += character; continue; }
    const next = value[index + 1];
    if (next === "\r" || next === "\n") {
      if (next === "\r" && value[index + 2] === "\n") index += 2;
      else index += 1;
      continue;
    }
    const escapes: Record<string, string> = { n: "\n", r: "\r", t: "\t", b: "\b", f: "\f", "(": "(", ")": ")", "\\": "\\" };
    if (next && next in escapes) { output += escapes[next]; index += 1; continue; }
    const octal = value.slice(index + 1).match(/^[0-7]{1,3}/)?.[0];
    if (octal) { output += String.fromCharCode(Number.parseInt(octal, 8)); index += octal.length; continue; }
    if (next) { output += next; index += 1; }
  }
  return output;
}

function stringsFromContent(content: string): string {
  const textBlocks = [...content.matchAll(/\bBT\b([\s\S]*?)\bET\b/g)].map((match) => match[1] ?? "");
  const fragments: string[] = [];
  for (const block of textBlocks) {
    for (const match of block.matchAll(/\(((?:\\[\s\S]|[^\\)])*)\)\s*Tj\b/g)) fragments.push(decodePdfLiteral(match[1] ?? ""));
    for (const array of block.matchAll(/\[([\s\S]*?)\]\s*TJ\b/g)) {
      for (const match of (array[1] ?? "").matchAll(/\(((?:\\[\s\S]|[^\\)])*)\)/g)) fragments.push(decodePdfLiteral(match[1] ?? ""));
    }
    for (const match of block.matchAll(/<([0-9a-f\s]+)>\s*Tj\b/gi)) {
      const hex = (match[1] ?? "").replace(/\s/g, "");
      if (hex.length % 2 === 0) fragments.push(Buffer.from(hex, "hex").toString("utf8"));
    }
  }
  return fragments.join(" ").replace(/\s+/g, " ").trim();
}

function streamContent(objectBody: string): string {
  const match = /\bstream(?:\r\n|\n|\r)([\s\S]*?)(?:\r\n|\n|\r)endstream\b/.exec(objectBody);
  if (!match) return "";
  const bytes = Buffer.from(match[1] ?? "", "latin1");
  if (!/\/FlateDecode\b/.test(objectBody.slice(0, match.index))) return bytes.toString("latin1");
  try {
    return inflateSync(bytes, { maxOutputLength: MAX_EXPANDED_BYTES }).toString("latin1");
  } catch {
    throw new UploadParseError("CORRUPT_FILE", "A compressed PDF content stream is invalid");
  }
}

export function parsePdf(buffer: Buffer): { text: string; chunks: UploadTextChunk[]; needsOcr: boolean } {
  if (!buffer.subarray(0, 5).equals(Buffer.from("%PDF-"))) throw new UploadParseError("MAGIC_BYTES_MISMATCH", "The file does not start with a PDF signature");
  const raw = buffer.toString("latin1");
  if (!/%%EOF\s*$/.test(raw)) throw new UploadParseError("CORRUPT_FILE", "The PDF is truncated or missing its EOF marker");
  if (/\/Encrypt\b/.test(raw)) throw new UploadParseError("ENCRYPTED", "Encrypted PDF uploads are not supported");
  if (!/\/Type\s*\/Catalog\b/.test(raw)) throw new UploadParseError("CORRUPT_FILE", "The PDF catalog is missing");

  const objects = new Map<number, string>();
  for (const match of raw.matchAll(/(?:^|[\r\n])(\d+)\s+\d+\s+obj\b([\s\S]*?)\bendobj\b/g)) objects.set(Number(match[1]), match[2] ?? "");
  const pageBodies = [...objects.values()].filter((body) => /\/Type\s*\/Page\b/.test(body) && !/\/Type\s*\/Pages\b/.test(body));
  if (!pageBodies.length) throw new UploadParseError("CORRUPT_FILE", "The PDF contains no pages");

  const chunks: UploadTextChunk[] = [];
  pageBodies.forEach((pageBody, pageIndex) => {
    const references: number[] = [];
    const contents = /\/Contents\s*(?:\[([\s\S]*?)\]|(\d+)\s+\d+\s+R)/.exec(pageBody);
    if (contents?.[2]) references.push(Number(contents[2]));
    if (contents?.[1]) for (const reference of contents[1].matchAll(/(\d+)\s+\d+\s+R/g)) references.push(Number(reference[1]));
    const pageText = references.map((reference) => objects.get(reference)).filter((body): body is string => body !== undefined).map((body) => stringsFromContent(streamContent(body))).filter(Boolean).join(" ").trim();
    if (pageText) chunks.push({ text: pageText, location: { kind: "page", page: pageIndex + 1 } });
  });
  const text = chunks.map((chunk) => chunk.text).join("\n");
  if (text.length > MAX_EXTRACTED_TEXT_CHARS) throw new UploadParseError("EXPANDED_CONTENT_TOO_LARGE", "Extracted PDF text exceeds the supported limit");
  return { text, chunks, needsOcr: text.length === 0 };
}
