#!/usr/bin/env node
/** Check exported PPTX/PDF/PNG artifacts without requiring Office or a GUI. */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = path.resolve(import.meta.dirname, '..');

function zipEntries(bytes) {
  const eocd = bytes.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd < 0 || eocd + 22 > bytes.length) return [];
  const count = bytes.readUInt16LE(eocd + 10);
  const centralOffset = bytes.readUInt32LE(eocd + 16);
  const records = [];
  let cursor = centralOffset;
  for (let i = 0; i < count; i += 1) {
    if (cursor + 46 > bytes.length || bytes.readUInt32LE(cursor) !== 0x02014b50) return [];
    const nameLength = bytes.readUInt16LE(cursor + 28);
    const extraLength = bytes.readUInt16LE(cursor + 30);
    const commentLength = bytes.readUInt16LE(cursor + 32);
    records.push({
      name: bytes.subarray(cursor + 46, cursor + 46 + nameLength).toString('utf8'),
      compressedSize: bytes.readUInt32LE(cursor + 20),
      method: bytes.readUInt16LE(cursor + 10),
      localOffset: bytes.readUInt32LE(cursor + 42),
    });
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  return records;
}

async function zipEntry(bytes, record) {
  const local = record.localOffset;
  if (bytes.readUInt32LE(local) !== 0x04034b50) return null;
  const nameLength = bytes.readUInt16LE(local + 26);
  const extraLength = bytes.readUInt16LE(local + 28);
  const start = local + 30 + nameLength + extraLength;
  const compressed = bytes.subarray(start, start + record.compressedSize);
  if (record.method === 0) return compressed;
  if (record.method !== 8 || typeof DecompressionStream === 'undefined') return null;
  const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return Buffer.from(await new Response(stream).arrayBuffer());
}

function pngDimensions(bytes) {
  if (bytes.length < 24 || bytes.readUInt32BE(0) !== 0x89504e47) return null;
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

async function inspect(file) {
  const bytes = await fs.readFile(file);
  const ext = path.extname(file).toLowerCase();
  const errors = [];
  const report = { file: path.relative(root, file).replace(/\\/g, '/'), type: ext.slice(1), bytes: bytes.length, errors };
  if (ext === '.png') {
    const size = pngDimensions(bytes);
    if (!size) errors.push('invalid PNG signature or IHDR');
    else report.dimensions = size;
  } else if (ext === '.pdf') {
    if (bytes.subarray(0, 5).toString('ascii') !== '%PDF-') errors.push('missing PDF magic bytes');
    if (!bytes.toString('latin1').includes('%%EOF')) errors.push('missing PDF EOF marker');
    report.pages = (bytes.toString('latin1').match(/\/Type\s*\/Page\b/g) ?? []).length;
    if (report.pages < 1) errors.push('no PDF pages found');
  } else if (ext === '.zip') {
    const records = zipEntries(bytes);
    const pngRecords = records.filter(({ name }) => /\.png$/i.test(name));
    report.pngFiles = pngRecords.map(({ name }) => name);
    if (pngRecords.length !== 5) errors.push(`expected exactly 5 PNG files, found ${pngRecords.length}`);
    report.pngDimensions = [];
    for (const record of pngRecords) {
      const png = await zipEntry(bytes, record);
      const size = png && pngDimensions(png);
      report.pngDimensions.push({ name: record.name, ...(size ?? {}) });
      if (!size || size.width !== 1920 || size.height !== 1080) errors.push(`${record.name}: expected 1920x1080 PNG`);
    }
  } else if (ext === '.pptx') {
    const records = zipEntries(bytes);
    if (records.length === 0) errors.push('invalid ZIP container');
    const names = records.map(({ name }) => name);
    if (!names.includes('[Content_Types].xml')) errors.push('missing [Content_Types].xml');
    if (!names.includes('ppt/presentation.xml')) errors.push('missing ppt/presentation.xml');
    const slideRecords = records.filter(({ name }) => /^ppt\/slides\/slide\d+\.xml$/i.test(name));
    report.slides = slideRecords.length;
    if (slideRecords.length < 1) errors.push('no slide XML found');
    let textCount = 0;
    for (const record of slideRecords) {
      const xml = await zipEntry(bytes, record);
      if (xml) textCount += (xml.toString('utf8').match(/<a:t(?:\s[^>]*)?>[^<]*<\/a:t>/g) ?? []).length;
    }
    report.nativeTextNodes = textCount;
    if (textCount < 1) errors.push('no native a:t text nodes found in slide XML');
  } else {
    errors.push(`unsupported export type: ${ext || '(none)'}`);
  }
  return report;
}

async function filesFromArgs(args) {
  const files = [];
  for (const arg of args) {
    const target = path.resolve(root, arg);
    const stat = await fs.stat(target).catch(() => null);
    if (!stat) continue;
    if (stat.isFile()) files.push(target);
    else {
      const entries = await fs.readdir(target, { withFileTypes: true });
      files.push(...(await filesFromArgs(entries.filter((entry) => entry.isFile()).map((entry) => path.join(arg, entry.name)))));
    }
  }
  return files;
}

const args = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));
const targets = args.length ? args : await filesFromArgs(['apps/web/public/exports', 'dist/exports', 'test-fixtures/exports']);
if (targets.length === 0) {
  console.log(JSON.stringify({ files: [], errors: ['No export files supplied or found.'] }, null, 2));
  process.exitCode = 1;
} else {
  const reports = [];
  for (const file of targets) reports.push(await inspect(file));
  console.log(JSON.stringify({ files: reports, errors: reports.flatMap((report) => report.errors.map((error) => `${report.file}: ${error}`)) }, null, 2));
  if (reports.some((report) => report.errors.length)) process.exitCode = 1;
}
