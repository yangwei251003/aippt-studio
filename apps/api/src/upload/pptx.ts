import { UploadParseError, type ParsedUpload, type UploadTextChunk } from "./types.js";
import { checkedText, textElements, xmlAttribute } from "./xml.js";
import { ZipArchive } from "./zip.js";

function count(source: string, pattern: RegExp): number { return [...source.matchAll(pattern)].length; }

export function parsePptx(buffer: Buffer, filename: string): ParsedUpload {
  const archive = ZipArchive.open(buffer); const names = archive.names();
  if (names.some((name) => /(?:^|\/)vbaProject\.bin$/i.test(name))) throw new UploadParseError("MACRO_NOT_ALLOWED", "Macro-enabled PowerPoint templates are not accepted");
  if (archive.has("EncryptedPackage") || archive.has("EncryptionInfo")) throw new UploadParseError("ENCRYPTED", "Encrypted PowerPoint templates are not accepted");
  const slideNames = names.filter((name) => /^ppt\/slides\/slide\d+\.xml$/i.test(name)).sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
  if (!archive.has("ppt/presentation.xml") || !slideNames.length) throw new UploadParseError("MAGIC_BYTES_MISMATCH", "The OOXML package is not a PowerPoint presentation");
  const chunks: UploadTextChunk[] = []; const objectCounts = { text: 0, image: 0, shape: 0, chart: 0, table: 0 };
  let lockedPreviewCount = 0;
  slideNames.forEach((name, index) => {
    const source = archive.get(name)?.toString("utf8") ?? ""; const text = textElements(source);
    if (text) chunks.push({ text, location: { kind: "slide", slide: index + 1 } });
    objectCounts.text += count(source, /<(?:p:)?sp\b/gi); objectCounts.image += count(source, /<(?:p:)?pic\b/gi); objectCounts.shape += count(source, /<(?:p:)?(?:cxnSp|graphicFrame)\b/gi); objectCounts.table += count(source, /<(?:a:)?tbl\b/gi);
    const relation = archive.get(name.replace("slides/", "slides/_rels/") + ".rels")?.toString("utf8") ?? "";
    objectCounts.chart += count(relation, /relationships\/chart/gi); lockedPreviewCount += count(relation, /relationships\/(?:oleObject|diagramData|package)/gi);
  });
  const fonts = new Set<string>(); const themeColors = new Set<string>();
  for (const name of names.filter((entry) => /^ppt\/(?:theme|slideMasters|slideLayouts)\/.+\.xml$/i.test(entry))) {
    const source = archive.get(name)?.toString("utf8") ?? "";
    for (const match of source.matchAll(/<(?:a:)?(?:latin|ea|cs)\b([^>]*)\/?\s*>/gi)) { const font = xmlAttribute(match[1] ?? "", "typeface"); if (font && !font.startsWith("+")) fonts.add(font); }
    for (const match of source.matchAll(/<(?:a:)?(?:srgbClr|sysClr)\b([^>]*)\/?\s*>/gi)) { const color = xmlAttribute(match[1] ?? "", "val") ?? xmlAttribute(match[1] ?? "", "lastClr"); if (color) themeColors.add(`#${color.replace(/^#/, "")}`); }
  }
  const removedRiskCounts = {
    externalLinks: names.filter((name) => name.endsWith(".rels")).reduce((total, name) => total + count(archive.get(name)?.toString("utf8") ?? "", /TargetMode=["']External["']/gi), 0),
    ole: names.filter((name) => /embeddings\//i.test(name)).length,
    unknownExtensions: names.reduce((total, name) => total + count(archive.get(name)?.toString("utf8") ?? "", /<(?:p:)?extLst\b/gi), 0),
  };
  return {
    kind: "pptx", filename, mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation", size: buffer.length,
    text: checkedText(chunks), chunks, needsOcr: false, warnings: [],
    template: { slideCount: slideNames.length, masterCount: names.filter((name) => /^ppt\/slideMasters\/slideMaster\d+\.xml$/i.test(name)).length, layoutCount: names.filter((name) => /^ppt\/slideLayouts\/slideLayout\d+\.xml$/i.test(name)).length, fonts: [...fonts].sort(), themeColors: [...themeColors].slice(0, 32), objectCounts, lockedPreviewCount, removedRiskCounts },
  };
}
