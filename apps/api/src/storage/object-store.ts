import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export interface StoredObject {
  key: string;
  contentType: string;
  size: number;
}

export interface ObjectStore {
  put(key: string, data: Uint8Array, contentType: string): Promise<StoredObject>;
  get(key: string): Promise<{ data: Uint8Array; contentType: string }>;
  signedDownloadUrl(key: string, expiresInSeconds?: number): Promise<string | undefined>;
}

function safeLocalPath(root: string, key: string): string {
  const absoluteRoot = path.resolve(root);
  const target = path.resolve(absoluteRoot, key.replaceAll("/", path.sep));
  if (target !== absoluteRoot && !target.startsWith(`${absoluteRoot}${path.sep}`)) throw new Error("Object key escapes local object-store root");
  return target;
}

export class LocalObjectStore implements ObjectStore {
  private readonly contentTypes = new Map<string, string>();

  constructor(private readonly root: string) {}

  async put(key: string, data: Uint8Array, contentType: string): Promise<StoredObject> {
    const target = safeLocalPath(this.root, key);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, data);
    this.contentTypes.set(key, contentType);
    return { key, contentType, size: data.byteLength };
  }

  async get(key: string): Promise<{ data: Uint8Array; contentType: string }> {
    const data = await readFile(safeLocalPath(this.root, key));
    return { data, contentType: this.contentTypes.get(key) ?? contentTypeForKey(key) };
  }

  async signedDownloadUrl(): Promise<undefined> { return undefined; }
}

export class S3ObjectStore implements ObjectStore {
  private readonly client: S3Client;

  constructor(private readonly options: { bucket: string; region: string; endpoint?: string; accessKeyId?: string; secretAccessKey?: string }) {
    const credentials = options.accessKeyId && options.secretAccessKey ? { accessKeyId: options.accessKeyId, secretAccessKey: options.secretAccessKey } : undefined;
    this.client = new S3Client({ region: options.region, ...(options.endpoint ? { endpoint: options.endpoint, forcePathStyle: true } : {}), ...(credentials ? { credentials } : {}) });
  }

  async put(key: string, data: Uint8Array, contentType: string): Promise<StoredObject> {
    await this.client.send(new PutObjectCommand({ Bucket: this.options.bucket, Key: key, Body: data, ContentType: contentType }));
    return { key, contentType, size: data.byteLength };
  }

  async get(key: string): Promise<{ data: Uint8Array; contentType: string }> {
    const response = await this.client.send(new GetObjectCommand({ Bucket: this.options.bucket, Key: key }));
    if (!response.Body) throw new Error(`S3 object ${key} has no body`);
    return { data: await response.Body.transformToByteArray(), contentType: response.ContentType ?? contentTypeForKey(key) };
  }

  async signedDownloadUrl(key: string, expiresInSeconds = 900): Promise<string> {
    return getSignedUrl(this.client, new GetObjectCommand({ Bucket: this.options.bucket, Key: key }), { expiresIn: expiresInSeconds });
  }
}

export function contentTypeForKey(key: string): string {
  if (key.endsWith(".pptx")) return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
  if (key.endsWith(".pdf")) return "application/pdf";
  if (key.endsWith(".zip")) return "application/zip";
  if (key.endsWith(".png")) return "image/png";
  if (key.endsWith(".html")) return "text/html; charset=utf-8";
  return "application/octet-stream";
}

export function createObjectStore(env: NodeJS.ProcessEnv = process.env): ObjectStore {
  if (env.OBJECT_STORE === "s3") {
    if (!env.S3_BUCKET) throw new Error("S3_BUCKET is required when OBJECT_STORE=s3");
    return new S3ObjectStore({
      bucket: env.S3_BUCKET,
      region: env.S3_REGION ?? "auto",
      ...(env.S3_ENDPOINT ? { endpoint: env.S3_ENDPOINT } : {}),
      ...(env.S3_ACCESS_KEY_ID ? { accessKeyId: env.S3_ACCESS_KEY_ID } : {}),
      ...(env.S3_SECRET_ACCESS_KEY ? { secretAccessKey: env.S3_SECRET_ACCESS_KEY } : {}),
    });
  }
  return new LocalObjectStore(env.LOCAL_OBJECT_STORE_PATH ?? ".data/objects");
}
