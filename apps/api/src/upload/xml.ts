import { MAX_EXTRACTED_TEXT_CHARS, UploadParseError } from "./types.js";

export function decodeXml(value: string): string {
  return value.replace(/&(?:#(x[0-9a-f]+|\d+)|amp|lt|gt|quot|apos);/gi, (entity, numeric: string | undefined) => {
    if (numeric) {
      const codePoint = numeric[0]?.toLowerCase() === "x" ? Number.parseInt(numeric.slice(1), 16) : Number.parseInt(numeric, 10);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : entity;
    }
    return ({ "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'" } as Record<string, string>)[entity.toLowerCase()] ?? entity;
  });
}

export function xmlAttribute(tag: string, name: string): string | undefined {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`(?:^|\\s)${escaped}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, "i").exec(tag);
  return match ? decodeXml(match[1] ?? match[2] ?? "") : undefined;
}

export function textElements(xml: string): string {
  const parts: string[] = [];
  const tokens = /<(?:[\w.-]+:)?(?:t)\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?t\s*>|<(?:[\w.-]+:)?tab\b[^>]*\/?\s*>|<(?:[\w.-]+:)?br\b[^>]*\/?\s*>/gi;
  for (const match of xml.matchAll(tokens)) parts.push(match[1] === undefined ? (match[0].toLowerCase().includes("tab") ? "\t" : "\n") : decodeXml(match[1]));
  return parts.join("").replace(/[ \t]+\n/g, "\n").trim();
}

export function checkedText(chunks: readonly { text: string }[]): string {
  const text = chunks.map((chunk) => chunk.text).filter(Boolean).join("\n");
  if (text.length > MAX_EXTRACTED_TEXT_CHARS) throw new UploadParseError("EXPANDED_CONTENT_TOO_LARGE", "Extracted text exceeds the supported limit");
  return text;
}
