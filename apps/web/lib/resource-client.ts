import type { ResourceBinding, ResourceDetail, ResourceListFilters, ResourceListResult, ResourceProject, ResourceSummary, ResourceUploadInput } from "./resource-types";

const apiOrigin = process.env.NEXT_PUBLIC_API_ORIGIN ?? "/backend-api";

export class ResourceApiError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string) { super(message); }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiOrigin}${path}`, { ...init, cache: "no-store", headers: init?.body instanceof FormData ? init.headers : { "content-type": "application/json", ...init?.headers } });
  if (!response.ok) {
    let message = `资源服务暂不可用 (${response.status})`;
    let code: string | undefined;
    try { const payload = await response.json() as { error?: string | { message?: string; code?: string }; message?: string; code?: string }; const nested = typeof payload.error === "object" ? payload.error : undefined; message = nested?.message ?? (typeof payload.error === "string" ? payload.error : payload.message) ?? message; code = nested?.code ?? payload.code; } catch { /* non-JSON error bodies stay private */ }
    throw new ResourceApiError(message, response.status, code);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

function queryString(filters: ResourceListFilters) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) if (value !== undefined && value !== "") query.set(key, String(value));
  const encoded = query.toString();
  return encoded ? `?${encoded}` : "";
}

function unwrapResource(payload: ResourceDetail | { resource: ResourceDetail }) { return "resource" in payload ? payload.resource : payload; }

type RawResourceRecord = {
  manifest: { id: string; version: string; kind: "native-pptx" | "html-deck" | "image-style" | "skill" | "media" | "showcase" | "website"; name: string; summary: string; author: { name: string; url?: string }; source?: { url: string }; license: string; access: "free" | "pro" | "single-purchase"; priceCny?: number; tags?: string[]; industries?: string[]; previewKeys?: string[]; capabilities?: string[] };
  visibility: "private" | "public" | "unlisted"; status: "draft" | "auto-reviewed" | "blocked" | "takedown"; updatedAt?: string; installed?: boolean; entitled?: boolean;
};
const kindMap = { "native-pptx": "template-pptx", "html-deck": "template-html", "image-style": "template-image", skill: "skill", media: "media", showcase: "showcase", website: "website" } as const;
function normalizeResource(raw: ResourceDetail | RawResourceRecord): ResourceDetail {
  if (!("manifest" in raw)) return raw;
  const { manifest } = raw; const kind = kindMap[manifest.kind];
  return { id: manifest.id, version: manifest.version, kind, title: manifest.name, summary: manifest.summary, description: manifest.summary, author: manifest.author.name, styles: manifest.tags ?? [], industries: manifest.industries ?? [], license: manifest.license, tier: manifest.access, ...(manifest.priceCny ? { priceCents: Math.round(manifest.priceCny * 100), currency: "CNY" } : {}), visibility: raw.visibility, reviewStatus: raw.status === "draft" ? "private" : raw.status === "takedown" ? "taken-down" : raw.status, installed: raw.installed ?? false, entitled: raw.entitled ?? manifest.access === "free", previewUrl: manifest.previewKeys?.[0], previewUrls: manifest.previewKeys ?? [], sourceUrl: manifest.source?.url, creationMode: kind === "template-html" ? "html" : kind === "template-image" ? "image" : "standard", editable: kind !== "template-image", capabilities: manifest.capabilities ?? [], updatedAt: raw.updatedAt };
}

export async function listResources(filters: ResourceListFilters = {}): Promise<ResourceListResult> {
  const payload = await request<ResourceListResult | ResourceSummary[] | RawResourceRecord[] | { resources: Array<ResourceSummary | RawResourceRecord>; nextCursor?: string; total?: number; facets?: ResourceListResult["facets"] }>(`/api/resources${queryString(filters)}`);
  if (Array.isArray(payload)) return { resources: payload.map((item) => normalizeResource(item)), total: payload.length };
  return { ...payload, resources: (payload.resources ?? []).map((item) => normalizeResource(item)) };
}
export async function getResource(id: string) { const payload = await request<ResourceDetail | RawResourceRecord | { resource: ResourceDetail | RawResourceRecord }>(`/api/resources/${encodeURIComponent(id)}`); return normalizeResource(unwrapResource(payload as ResourceDetail | { resource: ResourceDetail }) as ResourceDetail | RawResourceRecord); }
export async function installResource(id: string) { return request<{ resource?: ResourceSummary; installed?: boolean }>(`/api/resources/${encodeURIComponent(id)}/install`, { method: "POST", body: "{}" }); }
export async function publishResource(id: string) { return request<{ resource?: ResourceSummary }>(`/api/resources/${encodeURIComponent(id)}/publish`, { method: "POST", body: JSON.stringify({ rightsAttested: true }) }); }
export async function reportResource(id: string, reason: string) { return request<void>(`/api/resources/${encodeURIComponent(id)}/report`, { method: "POST", body: JSON.stringify({ reason }) }); }
export async function checkoutResource(id: string) { return request<{ checkout?: { id: string; status: string }; entitlement?: unknown }>("/api/resource-checkouts", { method: "POST", body: JSON.stringify({ resourceId: id, idempotencyKey: `resource:${id}:${crypto.randomUUID()}`, returnTo: `/resources/${encodeURIComponent(id)}` }) }); }
export async function listResourceProjects() { const result = await request<{ projects?: ResourceProject[] } | ResourceProject[]>("/api/projects"); return Array.isArray(result) ? result : result.projects ?? []; }
export async function bindResource(projectId: string, binding: ResourceBinding) { return request<void>(`/api/projects/${encodeURIComponent(projectId)}/resource-binding`, { method: "PUT", body: JSON.stringify({ creationMode: binding.creationMode, templateId: binding.resourceId, templateVersion: binding.resourceVersion, skillIds: binding.skillIds ?? [], assetPolicy: binding.assetPolicy }) }); }
export async function uploadResource(input: ResourceUploadInput) {
  const dataBase64 = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(",")[1] ?? ""); reader.onerror = () => reject(reader.error); reader.readAsDataURL(input.file); });
  const kind = ({ "template-pptx": "native-pptx", "template-html": "html-deck", "template-image": "image-style", skill: "skill", media: "media" } as const)[input.kind];
  const slug = `${input.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "community-resource"}-${crypto.randomUUID().slice(0, 8)}`;
  return request<{ resource: ResourceDetail; scan?: { status: string; findings?: string[] } }>("/api/resources/uploads", { method: "POST", body: JSON.stringify({ filename: input.file.name, contentType: input.file.type || "application/octet-stream", dataBase64, id: slug, name: input.title, summary: "用户上传并经过机器安全扫描的资源", kind, license: input.license, access: input.tier, ...(input.priceCents ? { priceCny: input.priceCents / 100 } : {}), publish: input.publish, rightsAttested: input.rightsAttested }) });
}
