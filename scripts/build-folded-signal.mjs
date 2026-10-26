#!/usr/bin/env node
/**
 * Produce standalone Folded Signal SVG variants and icon sizes.
 *
 * The supplied mark is raster artwork. A lossless SVG image wrapper keeps the
 * asset self-contained and usable in HTML/CSS while preserving its alpha
 * channel; the filters provide reliable light and monochrome treatments.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = path.resolve(import.meta.dirname, '..');
const sourceCandidates = [
  path.join(root, 'assets', 'production', 'masters', 'logo', 'folded-signal-adobe.svg'),
  path.join(root, 'assets', 'logo', 'AIPPT_Folded_Signal_Mark.png'),
];
const output = path.join(root, 'assets', 'production', 'brand');
const publicOutput = path.join(root, 'apps', 'web', 'public', 'generated', 'brand');
const sizes = [16, 24, 32, 64, 512];

async function loadSharp() {
  try {
    const module = await import('sharp');
    return module.default ?? module;
  } catch (error) {
    throw new Error('Sharp is required to render Folded Signal PNG icons. Install it locally with `pnpm add -D sharp`, then rerun this script.', { cause: error });
  }
}

function svgFor(dataUri, treatment) {
  const filter = treatment === 'light'
    ? '<filter id="light"><feColorMatrix type="matrix" values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 1 0"/></filter>'
    : treatment === 'monochrome'
      ? '<filter id="mono"><feColorMatrix type="matrix" values="0 0 0 0 0.08 0 0 0 0 0.13 0 0 0 0 0.22 0 0 0 1 0"/></filter>'
      : '';
  const filterAttr = treatment === 'deep' ? '' : ` filter="url(#${treatment === 'light' ? 'light' : 'mono'})"`;
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512" role="img" aria-labelledby="title desc">\n  <title id="title">Folded Signal ${treatment}</title>\n  <desc id="desc">A self-contained transparent Folded Signal mark.</desc>\n  <defs>${filter}</defs>\n  <image href="${dataUri}" width="512" height="512" preserveAspectRatio="xMidYMid meet"${filterAttr}/>\n</svg>\n`;
}

function icoFromPngs(entries) {
  // ICO supports embedded PNG payloads. Each directory entry is 16 bytes,
  // followed by the PNG data. This avoids a second native icon dependency.
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(entries.length, 4);
  const directory = Buffer.alloc(entries.length * 16);
  let offset = header.length + directory.length;
  const payloads = [];
  entries.forEach(({ size, bytes }, index) => {
    const start = index * 16;
    directory.writeUInt8(size >= 256 ? 0 : size, start);
    directory.writeUInt8(size >= 256 ? 0 : size, start + 1);
    directory.writeUInt8(0, start + 2);
    directory.writeUInt8(0, start + 3);
    directory.writeUInt16LE(1, start + 4);
    directory.writeUInt16LE(32, start + 6);
    directory.writeUInt32LE(bytes.length, start + 8);
    directory.writeUInt32LE(offset, start + 12);
    payloads.push(bytes);
    offset += bytes.length;
  });
  return Buffer.concat([header, directory, ...payloads]);
}

async function main() {
  const source = await (async () => {
    for (const candidate of sourceCandidates) {
      if (await fs.stat(candidate).then(() => true).catch(() => false)) return candidate;
    }
    throw new Error(`Folded Signal master not found. Add a PNG/SVG to ${path.relative(root, sourceCandidates[0])}.`);
  })();
  const sourceBytes = await fs.readFile(source);
  const mime = path.extname(source).toLowerCase() === '.svg' ? 'image/svg+xml' : 'image/png';
  const dataUri = `data:${mime};base64,${sourceBytes.toString('base64')}`;
  await fs.mkdir(output, { recursive: true });
  for (const treatment of ['deep', 'light', 'monochrome']) {
    const svgPath = path.join(output, `folded-signal-${treatment}.svg`);
    await fs.writeFile(svgPath, svgFor(dataUri, treatment), 'utf8');
  }

  // SVG wrappers are useful even in environments where native Sharp binaries
  // are not installed yet. PNG/WebP/AVIF generation below remains strict.
  let sharp;
  try {
    sharp = await loadSharp();
  } catch (error) {
    await fs.copyFile(path.join(output, 'folded-signal-deep.svg'), path.join(output, 'folded-signal.svg'));
    if (await fs.stat(path.join(root, 'apps', 'web')).then(() => true).catch(() => false)) {
      await fs.mkdir(publicOutput, { recursive: true });
      for (const file of await fs.readdir(output)) if (/\.svg$/i.test(file)) await fs.copyFile(path.join(output, file), path.join(publicOutput, file));
    }
    throw error;
  }

  const pngEntries = [];
  for (const treatment of ['deep', 'light', 'monochrome']) {
    const svgPath = path.join(output, `folded-signal-${treatment}.svg`);
    for (const size of sizes) {
      const pngPath = path.join(output, `folded-signal-${treatment}-${size}.png`);
      await sharp(svgPath, { density: 144 }).resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png({ compressionLevel: 9 }).toFile(pngPath);
      if (treatment === 'deep' && (size === 16 || size === 32)) pngEntries.push({ size, bytes: await fs.readFile(pngPath) });
    }
  }
  await fs.writeFile(path.join(output, 'favicon.ico'), icoFromPngs(pngEntries));
  await fs.copyFile(path.join(output, 'folded-signal-deep-512.png'), path.join(output, 'app-icon-512.png'));
  await fs.copyFile(path.join(output, 'folded-signal-deep.svg'), path.join(output, 'folded-signal.svg'));

  if (await fs.stat(path.join(root, 'apps', 'web')).then(() => true).catch(() => false)) {
    await fs.mkdir(publicOutput, { recursive: true });
    for (const file of await fs.readdir(output)) await fs.copyFile(path.join(output, file), path.join(publicOutput, file));
  }
  console.log(`Built Folded Signal SVG variants and ${sizes.length} icon sizes in ${path.relative(root, output)}.`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
