import type { PresentationDocument, PresentationElement } from "@aippt/core";
import { isIP } from "node:net";
import PptxGenJS from "pptxgenjs";

function withoutHash(color: string): string { return color.replace(/^#/, ""); }

export function isPrivateAddress(host: string): boolean {
  const normalized = host.toLowerCase().replace(/^\[|\]$/g, "");
  if (normalized === "::1" || normalized === "0:0:0:0:0:0:0:1" || normalized === "::" || normalized.startsWith("fc") || normalized.startsWith("fd") || /^fe[89ab]/.test(normalized)) return true;
  const octets = normalized.split(".").map(Number);
  if (octets.length !== 4 || !octets.every((part) => Number.isInteger(part) && part >= 0 && part <= 255)) return false;
  const [a, b] = octets as [number, number, number, number];
  return a === 10 || a === 127 || a === 0 || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
}

export function assertSafeRemoteImageUrl(value: string): URL {
  const url = new URL(value);
  if (url.protocol !== "https:") throw new Error("Remote presentation images must use HTTPS");
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host === "0.0.0.0" || host === "::1") throw new Error("Private image hosts are not allowed");
  if (isIP(host) && isPrivateAddress(host)) throw new Error("Private image hosts are not allowed");
  return url;
}

export function assertManagedPresentationImageSource(value: string): string {
  if (!value.startsWith("data:")) throw new Error("Presentation images must be ingested as managed assets before export; exporters never access the network or local filesystem");
  return value;
}

async function addElement(slide: PptxGenJS.Slide, element: PresentationElement, pptx: PptxGenJS): Promise<void> {
  const position = { x: element.x, y: element.y, w: element.width, h: element.height, rotate: element.rotation, transparency: Math.round((1 - element.opacity) * 100) };
  if (element.type === "text") {
    slide.addText(element.text, {
      ...position,
      fontFace: element.fontFamily,
      fontSize: element.fontSize,
      color: withoutHash(element.color),
      bold: element.bold,
      italic: element.italic,
      align: element.align,
      valign: element.verticalAlign,
      margin: 0,
      breakLine: false,
    });
    return;
  }
  if (element.type === "image") {
    let source: { data: string } | { path: string };
    source = { data: assertManagedPresentationImageSource(element.src) };
    slide.addImage({ ...source, ...position, ...(element.fit === "fill" ? {} : { sizing: { type: element.fit, w: element.width, h: element.height } }), altText: element.alt });
    return;
  }
  if (element.type === "chart") {
    const chartType = element.chartType === "column" ? pptx.ChartType.bar : pptx.ChartType[element.chartType];
    slide.addChart(chartType, element.series.map((series) => ({ name: series.name, labels: element.categories, values: series.values })), {
      ...position, catAxisLabelFontFace: "Aptos", catAxisLabelFontSize: 18, valAxisLabelFontFace: "Aptos", valAxisLabelFontSize: 18,
      showLegend: element.showLegend, showValue: element.showValues, showTitle: false,
      chartColors: element.colorScheme.map(withoutHash), ...(element.chartType === "column" ? { barDir: "col" as const } : {}),
    });
    return;
  }
  if (element.type === "table") {
    const rows = [element.columns.map(({ label }) => ({ text: label })), ...element.rows.map((row) => element.columns.map(({ key }) => ({ text: String(row[key] ?? "") })))];
    slide.addTable(rows, { ...position, fontFace: "Aptos", fontSize: 18, color: withoutHash(element.textColor), fill: { color: withoutHash(element.bodyColor) }, border: { type: "solid", color: withoutHash(element.textColor), pt: 1 }, bold: false, rowH: element.height / rows.length, margin: .08 });
    return;
  }
  const shapeMap = {
    rect: pptx.ShapeType.rect,
    roundRect: pptx.ShapeType.roundRect,
    ellipse: pptx.ShapeType.ellipse,
    line: pptx.ShapeType.line,
    arrow: pptx.ShapeType.rightArrow,
  } as const;
  slide.addShape(shapeMap[element.shape], {
    ...position,
    fill: { color: withoutHash(element.fill), transparency: Math.round((1 - element.opacity) * 100) },
    line: { color: withoutHash(element.stroke), width: element.strokeWidth, transparency: Math.round((1 - element.opacity) * 100) },
  });
}

export class PptxRendererAdapter {
  async render(document: PresentationDocument, options: { branding?: "aippt" | "none" } = {}): Promise<Uint8Array> {
    const pptx = new PptxGenJS();
    pptx.layout = "LAYOUT_WIDE";
    pptx.author = "AIPPT";
    pptx.subject = "Editable AIPPT presentation";
    pptx.title = document.title;
    pptx.company = "AIPPT";
    pptx.theme = {
      headFontFace: document.theme.headingFont,
      bodyFontFace: document.theme.bodyFont,
    };
    for (const source of document.slides) {
      const slide = pptx.addSlide();
      slide.background = { color: withoutHash(source.background) };
      for (const element of source.elements) await addElement(slide, element, pptx);
      if (options.branding === "aippt") {
        slide.addText("AIPPT 免费版", { x: 11.35, y: 7.08, w: 1.55, h: 0.2, fontFace: document.theme.bodyFont, fontSize: 7, color: "7A7A7A", align: "right", margin: 0 });
      }
      if (source.notes) slide.addNotes(source.notes);
    }
    const output = await pptx.write({ outputType: "arraybuffer" });
    return new Uint8Array(output as ArrayBuffer);
  }
}

/** @deprecated Use PptxRendererAdapter; retained for worker/API compatibility. */
export class PptxExportService extends PptxRendererAdapter {}
