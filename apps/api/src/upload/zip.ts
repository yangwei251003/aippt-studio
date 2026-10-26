import { inflateRawSync } from "node:zlib";
import { MAX_EXPANDED_BYTES, UploadParseError } from "./types.js";

const END_OF_CENTRAL_DIRECTORY = 0x06054b50;
const CENTRAL_DIRECTORY_ENTRY = 0x02014b50;
const LOCAL_FILE_HEADER = 0x04034b50;
const MAX_ZIP_ENTRIES = 5_000;
const MAX_ENTRY_BYTES = 32 * 1024 * 1024;

function corrupt(message: string): never {
  throw new UploadParseError("CORRUPT_FILE", message);
}

function crc32(data: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function findEndRecord(buffer: Buffer): number {
  const minimum = Math.max(0, buffer.length - 22 - 0xffff);
  for (let offset = buffer.length - 22; offset >= minimum; offset -= 1) {
    if (buffer.readUInt32LE(offset) === END_OF_CENTRAL_DIRECTORY) return offset;
  }
  return corrupt("The OOXML ZIP central directory is missing");
}

function assertRange(buffer: Buffer, offset: number, length: number, label: string): void {
  if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length) || offset < 0 || length < 0 || offset + length > buffer.length) corrupt(`${label} is outside the archive`);
}

function safeEntryName(value: string): string {
  const name = value.replaceAll("\\", "/").replace(/^\/+/, "");
  if (!name || name.includes("\0") || name.split("/").includes("..")) return corrupt("The archive contains an unsafe entry name");
  return name;
}

export class ZipArchive {
  private constructor(private readonly entries: Map<string, Buffer>) {}

  static open(buffer: Buffer): ZipArchive {
    if (buffer.length < 22) return corrupt("The OOXML ZIP is truncated");
    const end = findEndRecord(buffer);
    const disk = buffer.readUInt16LE(end + 4);
    const centralDisk = buffer.readUInt16LE(end + 6);
    const diskEntries = buffer.readUInt16LE(end + 8);
    const entryCount = buffer.readUInt16LE(end + 10);
    const centralSize = buffer.readUInt32LE(end + 12);
    const centralOffset = buffer.readUInt32LE(end + 16);
    if (disk !== 0 || centralDisk !== 0 || diskEntries !== entryCount) return corrupt("Multi-disk OOXML archives are not supported");
    if (entryCount === 0xffff || centralSize === 0xffffffff || centralOffset === 0xffffffff) throw new UploadParseError("EXPANDED_CONTENT_TOO_LARGE", "ZIP64 uploads exceed the supported extraction limits");
    if (entryCount > MAX_ZIP_ENTRIES) throw new UploadParseError("EXPANDED_CONTENT_TOO_LARGE", `Archive contains more than ${MAX_ZIP_ENTRIES} entries`);
    assertRange(buffer, centralOffset, centralSize, "ZIP central directory");

    const entries = new Map<string, Buffer>();
    let cursor = centralOffset;
    let expandedBytes = 0;
    for (let index = 0; index < entryCount; index += 1) {
      assertRange(buffer, cursor, 46, "ZIP central directory entry");
      if (buffer.readUInt32LE(cursor) !== CENTRAL_DIRECTORY_ENTRY) return corrupt("Invalid ZIP central directory entry signature");
      const flags = buffer.readUInt16LE(cursor + 8);
      const compression = buffer.readUInt16LE(cursor + 10);
      const expectedCrc = buffer.readUInt32LE(cursor + 16);
      const compressedSize = buffer.readUInt32LE(cursor + 20);
      const uncompressedSize = buffer.readUInt32LE(cursor + 24);
      const nameLength = buffer.readUInt16LE(cursor + 28);
      const extraLength = buffer.readUInt16LE(cursor + 30);
      const commentLength = buffer.readUInt16LE(cursor + 32);
      const localOffset = buffer.readUInt32LE(cursor + 42);
      assertRange(buffer, cursor + 46, nameLength + extraLength + commentLength, "ZIP entry metadata");
      const name = safeEntryName(buffer.subarray(cursor + 46, cursor + 46 + nameLength).toString("utf8"));
      cursor += 46 + nameLength + extraLength + commentLength;
      if ((flags & 1) !== 0) throw new UploadParseError("ENCRYPTED", "Password-protected OOXML uploads are not supported");
      if (entries.has(name)) return corrupt(`Duplicate ZIP entry ${name}`);
      if (uncompressedSize > MAX_ENTRY_BYTES || expandedBytes + uncompressedSize > MAX_EXPANDED_BYTES) throw new UploadParseError("EXPANDED_CONTENT_TOO_LARGE", "Expanded OOXML content exceeds the extraction limit");
      expandedBytes += uncompressedSize;

      assertRange(buffer, localOffset, 30, `ZIP local header for ${name}`);
      if (buffer.readUInt32LE(localOffset) !== LOCAL_FILE_HEADER) return corrupt(`Invalid ZIP local header for ${name}`);
      const localFlags = buffer.readUInt16LE(localOffset + 6);
      const localCompression = buffer.readUInt16LE(localOffset + 8);
      const localNameLength = buffer.readUInt16LE(localOffset + 26);
      const localExtraLength = buffer.readUInt16LE(localOffset + 28);
      if ((localFlags & 1) !== 0) throw new UploadParseError("ENCRYPTED", "Password-protected OOXML uploads are not supported");
      if (localCompression !== compression) return corrupt(`ZIP compression metadata differs for ${name}`);
      const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
      assertRange(buffer, dataOffset, compressedSize, `ZIP data for ${name}`);
      const compressed = buffer.subarray(dataOffset, dataOffset + compressedSize);
      let data: Buffer;
      try {
        if (compression === 0) data = Buffer.from(compressed);
        else if (compression === 8) data = inflateRawSync(compressed, { maxOutputLength: Math.min(MAX_ENTRY_BYTES, MAX_EXPANDED_BYTES - (expandedBytes - uncompressedSize)) });
        else return corrupt(`Unsupported ZIP compression method ${compression}`);
      } catch (error) {
        if (error instanceof UploadParseError) throw error;
        return corrupt(`Unable to decompress ZIP entry ${name}`);
      }
      if (data.length !== uncompressedSize || crc32(data) !== expectedCrc) return corrupt(`ZIP integrity check failed for ${name}`);
      entries.set(name, data);
    }
    if (cursor !== centralOffset + centralSize) return corrupt("ZIP central directory size is inconsistent");
    return new ZipArchive(entries);
  }

  has(name: string): boolean { return this.entries.has(name); }
  get(name: string): Buffer | undefined { return this.entries.get(name); }
  names(): string[] { return [...this.entries.keys()]; }
}
