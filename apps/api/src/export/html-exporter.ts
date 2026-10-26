import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import type { PresentationDocument, PresentationElement } from "@aippt/core";
import JSZip from "jszip";

const require = createRequire(import.meta.url);
const revealRoot = dirname(require.resolve("reveal.js"));

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

function offlineImageSource(value: string): string {
  if (/^data:image\/(?:png|jpe?g|webp);base64,/i.test(value)) return value;
  throw new Error("HTML export only accepts managed inline raster assets; remote and local image paths are not allowed");
}

function percent(value: number, total: number): string { return `${(value / total * 100).toFixed(4)}%`; }

function elementHtml(element: PresentationElement): string {
  const style = `left:${percent(element.x, 13.333)};top:${percent(element.y, 7.5)};width:${percent(element.width, 13.333)};height:${percent(element.height, 7.5)};opacity:${element.opacity};transform:rotate(${element.rotation}deg)`;
  if (element.type === "text") {
    const textStyle = `${style};font-family:${escapeHtml(element.fontFamily)};font-size:${element.fontSize}px;color:${escapeHtml(element.color)};font-weight:${element.bold ? 700 : 400};font-style:${element.italic ? "italic" : "normal"};text-align:${element.align}`;
    return `<div class="scene-element text-element" style="${textStyle}">${escapeHtml(element.text).replaceAll("\n", "<br>")}</div>`;
  }
  if (element.type === "image") return `<img class="scene-element image-element" style="${style};object-fit:${element.fit}" src="${escapeHtml(offlineImageSource(element.src))}" alt="${escapeHtml(element.alt)}">`;
  if (element.type === "chart") {
    const max = Math.max(1, ...element.series.flatMap(({ values }) => values.map(Math.abs)));
    const bars = element.series.flatMap((series, seriesIndex) => series.values.map((value, valueIndex) => {
      const groupWidth = 100 / Math.max(1, element.categories.length); const barWidth = groupWidth / Math.max(1, element.series.length + 1);
      const x = valueIndex * groupWidth + seriesIndex * barWidth + barWidth * .5; const height = Math.abs(value) / max * 74; const y = 86 - height;
      return `<rect x="${x}" y="${y}" width="${barWidth * .8}" height="${height}" fill="${escapeHtml(element.colorScheme[seriesIndex % element.colorScheme.length] ?? "#426B57")}"><title>${escapeHtml(series.name)}: ${value} ${escapeHtml(element.unit)}</title></rect>`;
    })).join("");
    const labels = element.categories.map((label, index) => `<text x="${(index + .5) * 100 / element.categories.length}" y="98" text-anchor="middle">${escapeHtml(label)}</text>`).join("");
    return `<svg class="scene-element chart-element" role="img" aria-label="${escapeHtml(element.name ?? "数据图表")}" viewBox="0 0 100 100" style="${style}">${bars}${labels}</svg>`;
  }
  if (element.type === "table") {
    const head = element.columns.map(({ label }) => `<th>${escapeHtml(label)}</th>`).join("");
    const rows = element.rows.map((row) => `<tr>${element.columns.map(({ key }) => `<td>${escapeHtml(String(row[key] ?? ""))}</td>`).join("")}</tr>`).join("");
    return `<table class="scene-element table-element" style="${style};background:${escapeHtml(element.bodyColor)};color:${escapeHtml(element.textColor)}"><thead style="background:${escapeHtml(element.headerColor)}"><tr>${head}</tr></thead><tbody>${rows}</tbody></table>`;
  }
  const radius = element.shape === "roundRect" ? "24px" : element.shape === "ellipse" ? "999px" : "0";
  return `<div class="scene-element shape-element" style="${style};background:${escapeHtml(element.fill)};border:${element.strokeWidth}px solid ${escapeHtml(element.stroke)};border-radius:${radius}"></div>`;
}

function themeCss(document: PresentationDocument): string {
  return `:root{--deck-bg:${document.theme.colors.background};--deck-fg:${document.theme.colors.foreground};--deck-primary:${document.theme.colors.primary};--deck-accent:${document.theme.colors.accent};--deck-muted:${document.theme.colors.muted}}*{box-sizing:border-box}.reveal{font-family:${JSON.stringify(document.theme.bodyFont)};color:var(--deck-fg)}.reveal .slides section{width:100%;height:100%;text-align:left;overflow:hidden}.scene-element{position:absolute;box-sizing:border-box;white-space:pre-wrap;line-height:1.18}.shape-element{z-index:0}.text-element,.image-element,.chart-element,.table-element{z-index:1}.image-element{display:block}.chart-element text{font-size:5px;fill:var(--deck-fg)}.table-element{border-collapse:collapse;font-size:18px}.table-element th,.table-element td{padding:10px 14px;border:1px solid color-mix(in srgb,var(--deck-fg) 25%,transparent)}.speaker-notes{display:none}@media(prefers-reduced-motion:reduce){.reveal .slides section{transition:none!important}}`;
}

function slidesHtml(document: PresentationDocument): string {
  return document.slides.map((slide, index) => `<section data-slide-id="${escapeHtml(slide.id)}" data-auto-animate${index === 0 ? " data-transition=\"fade\"" : ""} style="background:${escapeHtml(slide.background)}">${slide.elements.map(elementHtml).join("")}<aside class="notes">${escapeHtml(slide.notes)}</aside></section>`).join("");
}

function htmlShell(input: { document: PresentationDocument; revealCss: string; themeCss: string; revealScript: string; notesScript: string; inline: boolean }): string {
  const styles = input.inline ? `<style>${input.revealCss}\n${input.themeCss}</style>` : `<link rel="stylesheet" href="assets/reveal.css"><link rel="stylesheet" href="theme.css">`;
  const script = input.inline ? `<script>${input.revealScript}</script><script>${input.notesScript}</script>` : `<script src="assets/reveal.js"></script><script src="assets/reveal-notes.js"></script>`;
  return `<!doctype html><html lang="${escapeHtml(input.document.brief.language)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(input.document.title)}</title>${styles}</head><body><div class="reveal"><div class="slides">${slidesHtml(input.document)}</div></div>${script}<script>Reveal.initialize({hash:true,history:true,overview:true,center:false,touch:true,progress:true,controls:true,slideNumber:'c/t',showNotes:false,autoAnimate:true,transition:'slide',width:1280,height:720,margin:0,minScale:0.1,maxScale:3,plugins:[RevealNotes]});</script></body></html>`;
}

export class HtmlExportService {
  private async revealAssets(): Promise<{ script: string; notes: string; css: string }> {
    const [script, notes, css, reset] = await Promise.all([
      readFile(join(revealRoot, "reveal.js"), "utf8"),
      readFile(join(revealRoot, "plugin", "notes.js"), "utf8"),
      readFile(join(revealRoot, "reveal.css"), "utf8"),
      readFile(join(revealRoot, "reset.css"), "utf8"),
    ]);
    return { script, notes, css: `${reset}\n${css}` };
  }

  async renderSingleFile(document: PresentationDocument): Promise<Uint8Array> {
    const assets = await this.revealAssets();
    return new TextEncoder().encode(htmlShell({ document, revealCss: assets.css, themeCss: themeCss(document), revealScript: assets.script, notesScript: assets.notes, inline: true }));
  }

  async renderArchive(document: PresentationDocument): Promise<Uint8Array> {
    const assets = await this.revealAssets(); const css = themeCss(document); const zip = new JSZip();
    zip.file("index.html", htmlShell({ document, revealCss: assets.css, themeCss: css, revealScript: assets.script, notesScript: assets.notes, inline: false }));
    zip.file("deck.json", JSON.stringify(document, null, 2)); zip.file("theme.css", css);
    zip.file("assets/reveal.js", assets.script); zip.file("assets/reveal-notes.js", assets.notes); zip.file("assets/reveal.css", assets.css); zip.folder("assets/generated");
    return new Uint8Array(await zip.generateAsync({ type: "uint8array", compression: "DEFLATE", compressionOptions: { level: 6 } }));
  }
}
