#!/usr/bin/env node
/** Validate the Fast Build asset sprint minimum line. */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { inflateSync } from 'node:zlib';

const root = path.resolve(import.meta.dirname, '..');
const roots = [path.join(root, 'assets'), path.join(root, 'apps', 'web', 'public', 'generated')];
const visualExtensions = /\.(png|jpe?g|webp|avif|svg|ico)$/i;
const statuses = ['idle', 'listening', 'planning', 'researching', 'composing', 'checking', 'warning', 'success', 'paused', 'recovery'];
const layerAliases = {
  sky: ['sky', 'atmosphere', 'cloud'],
  skyline: ['skyline', 'horizon', 'far-city'],
  river: ['river', 'water', 'reflection'],
  midground: ['midground', 'middle', 'building', 'architecture', 'mid-city'],
  foreground: ['foreground', 'stage', 'page-layer'],
};
const workspaceAliases = {
  'create-center': ['create-center', 'create_center', '01-create'],
  blueprint: ['blueprint', '02-blueprint'],
  'agent-studio': ['agent-studio', 'agent_studio', '03-agent'],
  editor: ['editor', '04-editor'],
  'quality-center': ['quality-center', 'quality_center', '05-quality'],
  'delivery-center': ['delivery-center', 'delivery_center', '06-delivery'],
};

async function walk(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true }).catch(() => []);
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(fullPath));
    else if (visualExtensions.test(entry.name)) files.push(fullPath);
  }
  return files;
}

function normalized(file) { return file.replace(/\\/g, '/').toLowerCase(); }
function hasAny(value, tokens) { return tokens.some((token) => value.includes(token)); }

async function pngDimensions(file) {
  const bytes = await fs.readFile(file);
  if (bytes.length < 24 || bytes.readUInt32BE(0) !== 0x89504e47) return null;
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), alpha: [4, 6].includes(bytes[25] ?? 0) };
}

/**
 * Inspect actual PNG alpha samples, rather than treating a checkerboard baked
 * into an RGB image as transparency. This small decoder covers the common
 * 8-bit RGB/RGBA/gray-alpha PNGs used by the asset sprint and does not need
 * Sharp or ImageMagick.
 */
async function pngAlpha(file) {
  const bytes = await fs.readFile(file);
  if (bytes.length < 24 || bytes.readUInt32BE(0) !== 0x89504e47) return { supported: false, reason: 'not-png' };
  let offset = 8;
  let width = 0; let height = 0; let bitDepth = 0; let colorType = 0; let interlace = 0;
  const idat = [];
  let trns = null;
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.toString('ascii', offset + 4, offset + 8);
    const data = bytes.subarray(offset + 8, offset + 8 + length);
    offset += 12 + length;
    if (type === 'IHDR') {
      width = data.readUInt32BE(0); height = data.readUInt32BE(4); bitDepth = data[8]; colorType = data[9]; interlace = data[12];
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'tRNS') trns = data;
    if (type === 'IEND') break;
  }
  if (interlace !== 0 || bitDepth !== 8) return { supported: false, reason: `unsupported PNG layout (bitDepth=${bitDepth}, interlace=${interlace})` };
  if (colorType === 2 && !trns) return { supported: true, hasAlphaChannel: false, hasTransparentPixels: false, alphaMin: 255, alphaMax: 255 };
  if (![2, 3, 4, 6].includes(colorType)) return { supported: false, reason: `unsupported color type ${colorType}` };
  const bytesPerPixel = colorType === 2 ? 3 : colorType === 3 ? 1 : colorType === 4 ? 2 : 4;
  const rowBytes = width * bytesPerPixel;
  let inflated;
  try { inflated = inflateSync(Buffer.concat(idat)); } catch { return { supported: false, reason: 'invalid IDAT stream' }; }
  const paeth = (a, b, c) => { const p = a + b - c; const pa = Math.abs(p - a); const pb = Math.abs(p - b); const pc = Math.abs(p - c); return pa <= pb && pa <= pc ? a : pb <= pc ? b : c; };
  let previous = Buffer.alloc(rowBytes); let cursor = 0; let alphaMin = 255; let alphaMax = 0;
  for (let rowIndex = 0; rowIndex < height; rowIndex += 1) {
    if (cursor + rowBytes + 1 > inflated.length) return { supported: false, reason: 'truncated scanline data' };
    const filter = inflated[cursor++];
    const row = Buffer.from(inflated.subarray(cursor, cursor + rowBytes)); cursor += rowBytes;
    for (let x = 0; x < rowBytes; x += 1) {
      const left = x >= bytesPerPixel ? row[x - bytesPerPixel] : 0;
      const up = previous[x];
      const upperLeft = x >= bytesPerPixel ? previous[x - bytesPerPixel] : 0;
      if (filter === 1) row[x] = (row[x] + left) & 255;
      else if (filter === 2) row[x] = (row[x] + up) & 255;
      else if (filter === 3) row[x] = (row[x] + Math.floor((left + up) / 2)) & 255;
      else if (filter === 4) row[x] = (row[x] + paeth(left, up, upperLeft)) & 255;
      else if (filter !== 0) return { supported: false, reason: `unknown PNG filter ${filter}` };
    }
    if (colorType === 6) for (let x = 3; x < rowBytes; x += 4) { alphaMin = Math.min(alphaMin, row[x]); alphaMax = Math.max(alphaMax, row[x]); }
    else if (colorType === 4) for (let x = 1; x < rowBytes; x += 2) { alphaMin = Math.min(alphaMin, row[x]); alphaMax = Math.max(alphaMax, row[x]); }
    else if (colorType === 3 && trns) for (const index of row) { const alpha = index < trns.length ? trns[index] : 255; alphaMin = Math.min(alphaMin, alpha); alphaMax = Math.max(alphaMax, alpha); }
    else if (colorType === 2 && trns) { alphaMin = 0; alphaMax = 255; }
    previous = row;
  }
  return { supported: true, hasAlphaChannel: colorType !== 2 || Boolean(trns), hasTransparentPixels: alphaMin < 255, alphaMin, alphaMax };
}

async function svgDimensions(file) {
  const text = await fs.readFile(file, 'utf8');
  const viewBox = text.match(/viewBox\s*=\s*["']\s*[-\d.]+\s+[-\d.]+\s+([\d.]+)\s+([\d.]+)\s*["']/i);
  const width = text.match(/\bwidth\s*=\s*["']([\d.]+)/i);
  const height = text.match(/\bheight\s*=\s*["']([\d.]+)/i);
  if (viewBox) return { width: Number(viewBox[1]), height: Number(viewBox[2]), alpha: true };
  if (width && height) return { width: Number(width[1]), height: Number(height[1]), alpha: true };
  return null;
}

async function dimensions(file) {
  if (/\.png$/i.test(file)) return pngDimensions(file);
  if (/\.svg$/i.test(file)) return svgDimensions(file);
  return null;
}

function result(name, found, details = '') { return { name, found, details }; }

async function main() {
  const options = Object.fromEntries(process.argv.slice(2).map((arg) => [arg.replace(/^--/, ''), true]));
  const files = (await Promise.all(roots.map(walk))).flat();
  const paths = files.map((file) => ({ file, text: normalized(path.relative(root, file)) }));
  const checks = [];

  const sage = statuses.filter((status) => paths.some(({ text }) => text.includes(status) && (text.includes('sage') || text.includes('/ip/') || text.includes('/page-core/'))));
  checks.push(result('Page Core Sage: 10 statuses', sage.length === statuses.length, `${sage.length}/${statuses.length} (${statuses.filter((s) => !sage.includes(s)).join(', ') || 'complete'})`));
  const sagePngs = paths.filter(({ text }) => text.includes('/sage/') && text.endsWith('.png'));
  const sageAlpha = [];
  for (const { file, text } of sagePngs) sageAlpha.push({ status: statuses.find((status) => text.includes(status)) ?? path.basename(file), ...(await pngAlpha(file)) });
  const transparentSage = sageAlpha.filter((asset) => asset.hasTransparentPixels);
  checks.push(result('Page Core Sage: transparent PNGs', transparentSage.length === statuses.length, `${transparentSage.length}/${statuses.length} with real alpha samples`));

  const layers = Object.entries(layerAliases).filter(([, aliases]) => paths.some(({ text }) => (text.includes('/pazhou/') || text.includes('pazhou-')) && hasAny(text, aliases)));
  checks.push(result('Pazhou: 5 layers', layers.length === Object.keys(layerAliases).length, `${layers.length}/${Object.keys(layerAliases).length} (${Object.keys(layerAliases).filter((name) => !layers.some(([layer]) => layer === name)).join(', ') || 'complete'})`));

  const cardFiles = paths.filter(({ text }) => hasAny(text, ['/cards/', '/templates/', '/skills/', 'card-']) && !text.includes('contact-sheet'));
  const cardResults = [];
  for (const { file } of cardFiles) {
    const size = await dimensions(file);
    if (size && size.width > 0 && Math.abs(size.width / size.height - 16 / 9) < 0.03) cardResults.push(file);
  }
  checks.push(result('Templates/skills: 12 16:9 cards', cardResults.length >= 12, `${cardResults.length}/12`));

  const stateTokens = {
    primary: ['primary', 'main', 'example', 'hero'],
    empty: ['empty', 'blank'],
    loading: ['loading', 'progress', 'pending', 'generating'],
    outcome: ['outcome', 'success', 'error', 'failed', 'complete', 'ready'],
  };
  const workspaceReport = {};
  for (const [workspace, aliases] of Object.entries(workspaceAliases)) {
    const related = paths.filter(({ text }) => hasAny(text, aliases));
    const found = Object.fromEntries(Object.entries(stateTokens).map(([state, tokens]) => [state, related.some(({ text }) => hasAny(text, tokens))]));
    workspaceReport[workspace] = found;
  }
  const completeWorkspaces = Object.values(workspaceReport).filter((states) => Object.values(states).every(Boolean)).length;
  checks.push(result('Core workspaces: 6 state sets', completeWorkspaces === 6, `${completeWorkspaces}/6`));

  const hasMobile = paths.some(({ text }) => hasAny(text, ['mobile-composite', 'mobile_composite', 'mobile-fallback', 'mobile-fallback', 'pazhou-mobile']));
  checks.push(result('Mobile composite/fallback', hasMobile, hasMobile ? 'found' : 'missing mobile composite or fallback asset'));
  const hasReducedMotion = paths.some(({ text }) => hasAny(text, ['reduced-motion', 'reduced_motion', 'reducedmotion']));
  checks.push(result('Reduced Motion fallback', hasReducedMotion, hasReducedMotion ? 'found' : 'missing reduced-motion asset'));

  const brandFiles = paths.filter(({ text }) => text.includes('/production/brand/') || text.includes('/generated/brand/'));
  const brandVariants = ['deep', 'light', 'monochrome'].filter((variant) => brandFiles.some(({ text }) => text.includes(`folded-signal-${variant}.svg`)));
  const requiredIconSizes = [16, 24, 32, 64, 512];
  const iconSizes = requiredIconSizes.filter((size) => brandFiles.some(({ text }) => text.includes(`folded-signal-deep-${size}.png`)));
  checks.push(result('Folded Signal SVG variants', brandVariants.length === 3, `${brandVariants.length}/3`));
  checks.push(result('Folded Signal icon sizes', iconSizes.length === requiredIconSizes.length, `${iconSizes.length}/${requiredIconSizes.length}`));
  checks.push(result('Favicon/App Icon', brandFiles.some(({ text }) => text.endsWith('/favicon.ico')) && brandFiles.some(({ text }) => text.endsWith('/app-icon-512.png')), 'favicon.ico + app-icon-512.png'));

  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    filesScanned: files.length,
    checks,
    sageStatuses: sage,
    sageAlpha,
    pazhouLayers: layers.map(([layer]) => layer),
    workspaceStates: workspaceReport,
  };
  console.log(options.json ? JSON.stringify(report, null, 2) : checks.map((check) => `${check.found ? 'PASS' : 'FAIL'} ${check.name}: ${check.details}`).join('\n'));
  if (checks.some((check) => !check.found) && !options['allow-missing']) process.exitCode = 1;
}

main().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });
