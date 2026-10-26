#!/usr/bin/env node
/**
 * Build production asset derivatives with Sharp.
 *
 * Masters are intentionally kept outside generated output so an asset sprint
 * can replace a master without touching application source. The command is
 * deterministic and writes a manifest containing dimensions and checksums.
 *
 * Usage:
 *   node scripts/build-assets.mjs
 *   node scripts/build-assets.mjs --sizes 16,24,32,64,512 --no-sync
 */
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = path.resolve(import.meta.dirname, '..');
const production = path.join(root, 'assets', 'production');
const mastersDir = path.join(production, 'masters');
const outputDir = path.join(production, 'generated');
const publicGeneratedDir = path.join(root, 'apps', 'web', 'public', 'generated');

function parseArgs(argv) {
  const result = { sizes: [16, 24, 32, 64, 128, 256, 512], sync: true };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--no-sync') result.sync = false;
    if (arg === '--sizes') {
      result.sizes = argv[++index].split(',').map(Number).filter((size) => Number.isInteger(size) && size > 0);
    }
    if (arg === '--help' || arg === '-h') {
      console.log('Usage: node scripts/build-assets.mjs [--sizes 16,24,...] [--no-sync]');
      process.exit(0);
    }
  }
  if (result.sizes.length === 0) throw new Error('--sizes must contain at least one positive integer');
  return result;
}

async function loadSharp() {
  try {
    const module = await import('sharp');
    return module.default ?? module;
  } catch (error) {
    throw new Error('Sharp is required to build derivatives. Install it locally with `pnpm add -D sharp`, then rerun this script.', { cause: error });
  }
}

async function walk(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true }).catch(() => []);
  entries.sort((left, right) => left.name.localeCompare(right.name));
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(fullPath));
    else if (/\.(png|svg)$/i.test(entry.name)) files.push(fullPath);
  }
  return files;
}

function slugFor(file) {
  const relative = path.relative(mastersDir, file).replace(/\\/g, '/');
  return relative.replace(/\.(png|svg)$/i, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase();
}

async function digest(file) {
  return createHash('sha256').update(await fs.readFile(file)).digest('hex');
}

async function copyIfDifferent(source, destination) {
  await fs.mkdir(path.dirname(destination), { recursive: true });
  const sourceBytes = await fs.readFile(source);
  const current = await fs.readFile(destination).catch(() => null);
  if (!current || !current.equals(sourceBytes)) await fs.writeFile(destination, sourceBytes);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const sharp = await loadSharp();
  const masters = await walk(mastersDir);
  if (masters.length === 0) {
    console.log(`No PNG/SVG masters found in ${path.relative(root, mastersDir)}.`);
    return;
  }

  const manifest = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    sourceRoot: path.relative(root, mastersDir).replace(/\\/g, '/'),
    outputRoot: path.relative(root, outputDir).replace(/\\/g, '/'),
    sizes: options.sizes,
    assets: [],
  };

  for (const master of masters) {
    const slug = slugFor(master);
    const assetDir = path.join(outputDir, slug);
    await fs.mkdir(assetDir, { recursive: true });
    const sourceSharp = sharp(master, { density: 144 }).ensureAlpha();
    const metadata = await sourceSharp.metadata();
    const outputs = [];

    const transparentPng = path.join(assetDir, `${slug}.transparent.png`);
    await sourceSharp.clone().png({ compressionLevel: 9 }).toFile(transparentPng);
    outputs.push({ kind: 'transparent-png', path: transparentPng, width: metadata.width ?? null, height: metadata.height ?? null });

    const webp = path.join(assetDir, `${slug}.webp`);
    await sourceSharp.clone().webp({ quality: 92, alphaQuality: 100 }).toFile(webp);
    outputs.push({ kind: 'webp', path: webp, width: metadata.width ?? null, height: metadata.height ?? null });

    const avif = path.join(assetDir, `${slug}.avif`);
    await sourceSharp.clone().avif({ quality: 82, effort: 4 }).toFile(avif);
    outputs.push({ kind: 'avif', path: avif, width: metadata.width ?? null, height: metadata.height ?? null });

    for (const size of options.sizes) {
      const target = path.join(assetDir, `${slug}-${size}.png`);
      await sourceSharp.clone()
        .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png({ compressionLevel: 9 })
        .toFile(target);
      outputs.push({ kind: 'size-png', size, path: target, width: size, height: size });
    }

    const files = [];
    for (const output of outputs) {
      files.push({
        kind: output.kind,
        size: output.size,
        path: path.relative(root, output.path).replace(/\\/g, '/'),
        width: output.width,
        height: output.height,
        bytes: (await fs.stat(output.path)).size,
        sha256: await digest(output.path),
      });
    }
    manifest.assets.push({
      id: slug,
      master: path.relative(root, master).replace(/\\/g, '/'),
      masterSha256: await digest(master),
      masterWidth: metadata.width ?? null,
      masterHeight: metadata.height ?? null,
      files,
    });

    if (options.sync && await fs.stat(path.join(root, 'apps', 'web')).then(() => true).catch(() => false)) {
      for (const output of outputs) {
        const destination = path.join(publicGeneratedDir, 'production', slug, path.basename(output.path));
        await copyIfDifferent(output.path, destination);
      }
    }
  }

  const manifestPath = path.join(production, 'manifest.json');
  const previous = await fs.readFile(manifestPath, 'utf8').then(JSON.parse).catch(() => null);
  if (previous) {
    const { generatedAt: _previousGeneratedAt, ...previousContent } = previous;
    const { generatedAt: _nextGeneratedAt, ...nextContent } = manifest;
    if (JSON.stringify(previousContent) === JSON.stringify(nextContent)) manifest.generatedAt = previous.generatedAt;
  }
  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  if (options.sync && await fs.stat(path.join(root, 'apps', 'web')).then(() => true).catch(() => false)) {
    await copyIfDifferent(manifestPath, path.join(publicGeneratedDir, 'production', 'manifest.json'));
  }
  console.log(`Built ${manifest.assets.length} asset master(s); manifest: ${path.relative(root, manifestPath)}`);
  if (options.sync) console.log(`Synced derivatives when ${path.relative(root, path.join(root, 'apps', 'web'))} exists.`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
