#!/usr/bin/env node
/** Generate and verify small deterministic import fixtures (PDF/DOCX/XLSX). */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

export const fixtureRoot = path.resolve(import.meta.dirname, '..', 'test-fixtures', 'documents');

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function zip(entries) {
  const local = [];
  const central = [];
  let offset = 0;
  for (const [name, value] of entries) {
    const nameBytes = Buffer.from(name);
    const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value);
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0, 6);
    localHeader.writeUInt16LE(0, 8); // store, deterministic and easy to inspect
    localHeader.writeUInt16LE(0, 10);
    localHeader.writeUInt16LE(0, 12);
    localHeader.writeUInt32LE(crc32(bytes), 14);
    localHeader.writeUInt32LE(bytes.length, 18);
    localHeader.writeUInt32LE(bytes.length, 22);
    localHeader.writeUInt16LE(nameBytes.length, 26);
    localHeader.writeUInt16LE(0, 28);
    local.push(Buffer.concat([localHeader, nameBytes, bytes]));

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0, 8);
    centralHeader.writeUInt16LE(0, 10);
    centralHeader.writeUInt16LE(0, 12);
    centralHeader.writeUInt32LE(crc32(bytes), 16);
    centralHeader.writeUInt32LE(bytes.length, 20);
    centralHeader.writeUInt32LE(bytes.length, 24);
    centralHeader.writeUInt16LE(nameBytes.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);
    central.push(Buffer.concat([centralHeader, nameBytes]));
    offset += local.at(-1).length;
  }
  const localBytes = Buffer.concat(local);
  const centralBytes = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralBytes.length, 12);
  eocd.writeUInt32LE(localBytes.length, 16);
  eocd.writeUInt16LE(0, 20);
  return Buffer.concat([localBytes, centralBytes, eocd]);
}

function pdf({ encrypted = false } = {}) {
  const objects = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Contents 4 0 R >>\nendobj\n',
    '4 0 obj\n<< /Length 31 >>\nstream\nBT /F1 12 Tf 20 100 Td (Fixture) Tj ET\nendstream\nendobj\n',
  ];
  const header = `%PDF-1.7\n%\xE2\xE3\xCF\xD3\n`;
  const body = objects.map((object) => object);
  const offsets = [0];
  let cursor = Buffer.byteLength(header);
  for (const object of body) { offsets.push(cursor); cursor += Buffer.byteLength(object); }
  const xref = `xref\n0 ${body.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${body.length + 1} /Root 1 0 R${encrypted ? ' /Encrypt 5 0 R' : ''} >>\nstartxref\n${cursor}\n%%EOF\n`;
  return Buffer.from(header + body.join('') + xref, 'latin1');
}

const commonTypes = `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>`;
const rels = `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>`;
const docXml = `<?xml version="1.0" encoding="UTF-8"?><document xmlns="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><body><p><r><t>Fixture</t></r></p></body></document>`;
const sheetXml = `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheets/></workbook>`;

function office(kind, macro = false) {
  const files = [
    ['[Content_Types].xml', commonTypes],
    ['_rels/.rels', rels],
    [kind === 'docx' ? 'word/document.xml' : 'xl/workbook.xml', kind === 'docx' ? docXml : sheetXml],
  ];
  if (macro) files.push(['xl/vbaProject.bin', Buffer.from('AIPPT TEST VBA PROJECT', 'ascii')]);
  return zip(files);
}

function cfbEncrypted(kind) {
  const bytes = Buffer.alloc(512, 0);
  Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]).copy(bytes);
  Buffer.from(`AIPPT ${kind.toUpperCase()} ENCRYPTED FIXTURE EncryptionInfo`).copy(bytes, 64);
  return bytes;
}

async function write(name, bytes) {
  const destination = path.join(fixtureRoot, name);
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.writeFile(destination, bytes);
}

export async function generateFixtures() {
  await write('pdf/valid.pdf', pdf());
  await write('pdf/corrupt.pdf', Buffer.from('%PDF-1.7\ntruncated fixture\n'));
  await write('pdf/encrypted.pdf', pdf({ encrypted: true }));
  await write('pdf/magic-bytes.pdf', Buffer.from('PK\x03\x04not a PDF', 'binary'));
  await write('docx/valid.docx', office('docx'));
  await write('docx/corrupt.docx', Buffer.from('PK\x03\x04truncated OOXML'));
  await write('docx/macro.docm', office('docx', true));
  await write('docx/encrypted.docx', cfbEncrypted('docx'));
  await write('docx/magic-bytes.docx', Buffer.from('%PDF-1.7 wrong magic for docx'));
  await write('xlsx/valid.xlsx', office('xlsx'));
  await write('xlsx/corrupt.xlsx', Buffer.from('PK\x03\x04truncated OOXML'));
  await write('xlsx/macro.xlsm', office('xlsx', true));
  await write('xlsx/encrypted.xlsx', cfbEncrypted('xlsx'));
  await write('xlsx/magic-bytes.xlsx', Buffer.from('%PDF-1.7 wrong magic for xlsx'));
}

function isCfb(bytes) { return bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])); }
function zipEntries(bytes) {
  const eocd = bytes.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd < 0 || eocd + 22 > bytes.length) return [];
  const count = bytes.readUInt16LE(eocd + 10);
  const centralOffset = bytes.readUInt32LE(eocd + 16);
  const names = [];
  let cursor = centralOffset;
  for (let index = 0; index < count; index += 1) {
    if (cursor + 46 > bytes.length || bytes.readUInt32LE(cursor) !== 0x02014b50) return [];
    const nameLength = bytes.readUInt16LE(cursor + 28);
    const extraLength = bytes.readUInt16LE(cursor + 30);
    const commentLength = bytes.readUInt16LE(cursor + 32);
    names.push(bytes.subarray(cursor + 46, cursor + 46 + nameLength).toString('utf8'));
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  return names;
}
function isZip(bytes) { return bytes.length >= 4 && bytes.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04])) && zipEntries(bytes).length > 0; }
function isPdf(bytes) { return bytes.subarray(0, 5).toString('ascii') === '%PDF-' && bytes.toString('latin1').includes('%%EOF'); }
function expectedCategory(file) { return path.basename(file).split('.')[0]; }

export async function verifyFixtures() {
  const expected = [];
  for (const kind of ['pdf', 'docx', 'xlsx']) {
    const entries = await fs.readdir(path.join(fixtureRoot, kind)).catch(() => []);
    for (const name of entries) expected.push({ kind, file: path.join(fixtureRoot, kind, name) });
  }
  const errors = [];
  for (const { kind, file } of expected) {
    const bytes = await fs.readFile(file);
    const category = expectedCategory(file);
    let actual;
    if (isPdf(bytes)) actual = bytes.toString('latin1').includes('/Encrypt') ? 'encrypted-pdf' : 'valid-pdf';
    else if (isCfb(bytes)) actual = 'encrypted-office';
    else if (isZip(bytes) && zipEntries(bytes).some((name) => name.endsWith('vbaProject.bin'))) actual = 'macro-office';
    else if (isZip(bytes)) {
      const entries = zipEntries(bytes);
      const required = kind === 'docx' ? ['[Content_Types].xml', '_rels/.rels', 'word/document.xml'] : ['[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml'];
      actual = required.every((name) => entries.includes(name)) ? 'valid-office' : 'invalid';
    }
    else actual = 'invalid';
    const valid = category === 'valid' ? (kind === 'pdf' ? actual === 'valid-pdf' : actual === 'valid-office')
      : category === 'macro' ? actual === 'macro-office'
        : category === 'encrypted' ? actual === (kind === 'pdf' ? 'encrypted-pdf' : 'encrypted-office')
          : category === 'corrupt' || category === 'magic-bytes' ? actual === 'invalid' : false;
    if (!valid) errors.push(`${path.relative(fixtureRoot, file)} expected ${category}, detected ${actual}`);
  }
  return { files: expected.length, errors };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const command = process.argv[2] ?? 'generate';
  (command === 'verify' ? verifyFixtures() : generateFixtures()).then((report) => {
    if (report) console.log(JSON.stringify(report, null, 2));
    if (report?.errors?.length) process.exitCode = 1;
  }).catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });
}
