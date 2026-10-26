type CoreElement = {
  id: string;
  type: "text" | "image" | "shape" | "chart" | "table";
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
  opacity?: number;
  text?: string;
  src?: string;
  alt?: string;
  fit?: "cover" | "contain" | "fill";
  fontFamily?: string;
  fontSize?: number;
  color?: string;
  bold?: boolean;
  italic?: boolean;
  align?: string;
  verticalAlign?: string;
  shape?: string;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  chartType?: "bar" | "column" | "line" | "area" | "pie" | "doughnut";
  categories?: string[];
  series?: Array<{ name: string; values: number[] }>;
  unit?: string;
  showValues?: boolean;
  colorScheme?: string[];
  columns?: Array<{ key: string; label: string; width?: number }>;
  rows?: Array<Record<string, string | number | boolean | null>>;
  headerColor?: string;
  bodyColor?: string;
  textColor?: string;
};

type CoreSlide = { id: string; background?: string; elements: CoreElement[] };
type CoreDocument = { title?: string; slides: CoreSlide[] };

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function safeImageSource(value: unknown): string {
  const source = String(value ?? "");
  return /^(https?:\/\/|data:image\/|\/)/i.test(source) ? escapeHtml(source) : "";
}

function elementHtml(element: CoreElement, scale: number): string {
  const left = element.x * scale;
  const top = element.y * scale;
  const width = element.width * scale;
  const height = element.height * scale;
  const common = `left:${left}px;top:${top}px;width:${width}px;height:${height}px;opacity:${element.opacity ?? 1};transform:rotate(${element.rotation ?? 0}deg)`;
  if (element.type === "text") {
    const size = element.fontSize ?? 24;
    return `<div class="element text" style="${common};font-family:${escapeHtml(element.fontFamily ?? "Arial")};font-size:${size}px;color:${escapeHtml(element.color ?? "#17231F")};font-weight:${element.bold ? 800 : 400};font-style:${element.italic ? "italic" : "normal"};text-align:${escapeHtml(element.align ?? "left")};align-items:${element.verticalAlign === "middle" ? "center" : element.verticalAlign === "bottom" ? "flex-end" : "flex-start"}">${escapeHtml(element.text).replaceAll("\n", "<br>")}</div>`;
  }
  if (element.type === "image") {
    const source = safeImageSource(element.src);
    return source ? `<img class="element image" style="${common};object-fit:${escapeHtml(element.fit ?? "cover")}" src="${source}" alt="${escapeHtml(element.alt)}">` : "";
  }
  if (element.type === "chart") {
    const values = element.series?.[0]?.values ?? [];
    const maximum = Math.max(1, ...values.map((value) => Math.abs(value)));
    const colors = element.colorScheme?.length ? element.colorScheme : ["#426B57", "#F28B50"];
    const columns = values.map((value, index) => `<div class="chart-column"><span class="chart-value">${element.showValues ? `${escapeHtml(value)}${escapeHtml(element.unit)}` : ""}</span><i style="height:${Math.max(2, Math.abs(value) / maximum * 78)}%;background:${escapeHtml(colors[index % colors.length])}"></i><small>${escapeHtml(element.categories?.[index] ?? "")}</small></div>`).join("");
    return `<div class="element chart" style="${common}">${columns}</div>`;
  }
  if (element.type === "table") {
    const columns = element.columns ?? [];
    const head = columns.map((column) => `<th>${escapeHtml(column.label)}</th>`).join("");
    const rows = (element.rows ?? []).map((row) => `<tr>${columns.map((column) => `<td>${escapeHtml(row[column.key])}</td>`).join("")}</tr>`).join("");
    return `<table class="element data-table" style="${common};color:${escapeHtml(element.textColor ?? "#17231F")};background:${escapeHtml(element.bodyColor ?? "#F6F5EF")}"><thead style="background:${escapeHtml(element.headerColor ?? "#426B57")};color:#fff"><tr>${head}</tr></thead><tbody>${rows}</tbody></table>`;
  }
  const radius = element.shape === "ellipse" ? "50%" : element.shape === "roundRect" ? "20px" : "0";
  return `<div class="element shape" style="${common};background:${escapeHtml(element.fill ?? "transparent")};border:${element.strokeWidth ?? 0}px solid ${escapeHtml(element.stroke ?? "transparent")};border-radius:${radius}"></div>`;
}

function deckToDocument(deck: any): CoreDocument {
  return {
    title: deck?.title,
    slides: (deck?.slides ?? []).map((slide: any, slideIndex: number) => ({
      id: slide.id ?? `slide-${slideIndex + 1}`,
      background: "#ffffff",
      elements: (slide.elements ?? []).map((element: any) => ({
        id: element.id,
        type: element.kind,
        x: element.x,
        y: element.y,
        width: element.w,
        height: element.h,
        text: element.value,
        fontSize: element.size,
        color: element.color,
        bold: true,
        shape: "roundRect",
        fill: element.color,
        stroke: element.color,
        strokeWidth: 0,
        src: element.kind === "image" ? "/generated/production/pazhou-pazhou-master/pazhou-pazhou-master.webp" : undefined,
        alt: "广州琶洲珠江天际线",
      })),
    })),
  };
}

export function normalizeRenderableDocument(input: any): CoreDocument {
  const document = input?.document ?? input;
  if (Array.isArray(document?.slides) && document.slides.every((slide: any) => Array.isArray(slide.elements))) {
    const firstElement = document.slides.flatMap((slide: any) => slide.elements)[0];
    if (firstElement?.type) return document as CoreDocument;
    if (firstElement?.kind) return deckToDocument(document);
  }
  throw new Error("Expected a PresentationDocument or editor deck");
}

export function renderDocumentHtml(input: any, origin = "http://localhost:3000"): string {
  const document = normalizeRenderableDocument(input);
  const allElements = document.slides.flatMap((slide) => slide.elements);
  const scale = allElements.some((element) => element.x > 20 || element.width > 20) ? 1 : 96;
  const slides = document.slides.map((slide, index) => `<section class="slide" data-slide-index="${index}" style="background:${escapeHtml(slide.background ?? "#fff")}">${slide.elements.map((element) => elementHtml(element, scale)).join("")}<small class="folio">${index + 1} / ${document.slides.length}</small></section>`).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><base href="${escapeHtml(origin)}/"><style>*{box-sizing:border-box}html,body{margin:0;background:#dce4ef;font-family:Arial,"Microsoft YaHei",sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}.slide{width:1280px;height:720px;position:relative;overflow:hidden;break-after:page;page-break-after:always}.slide:last-child{break-after:auto;page-break-after:auto}.element{position:absolute}.text{display:flex;line-height:1.25;white-space:normal;overflow:hidden}.image{display:block}.shape{display:block}.chart{display:flex;align-items:flex-end;gap:18px;padding:22px 18px 28px;border-bottom:2px solid #aab7b0}.chart-column{height:100%;flex:1;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;min-width:0}.chart-column i{display:block;width:72%;min-height:2px;border-radius:6px 6px 0 0}.chart-value{height:24px;font-size:14px;color:#17231f}.chart-column small{height:24px;padding-top:7px;color:#52615a;font-size:13px;max-width:100%;overflow:hidden}.data-table{border-collapse:collapse;font-size:16px}.data-table th,.data-table td{padding:10px 12px;border:1px solid #cad5cf;text-align:left}.folio{position:absolute;right:30px;bottom:24px;color:#8793a6;font-size:12px}@page{size:1280px 720px;margin:0}</style></head><body>${slides}</body></html>`;
}
