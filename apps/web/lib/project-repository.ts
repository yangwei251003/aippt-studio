import type {
  ExportFormat,
  ExportJob,
  PresentationElement,
  PresentationProject,
  ProjectJob,
  ProjectJobStatus,
  ProjectWorkbench,
  QualityReport,
  RemotePresentation,
  RemoteProjectRecord,
} from "./project-types";

export class ProjectRepositoryError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "ProjectRepositoryError";
  }
}

export interface ProjectRepository {
  getWorkbench(projectId: string, signal?: AbortSignal): Promise<ProjectWorkbench>;
  getJob(jobId: string, signal?: AbortSignal): Promise<ProjectJob>;
  startQualityCheck(projectId: string, presentationId: string, revision: number, idempotencyKey: string): Promise<ProjectJob | QualityReport>;
  startExport(input: { projectId: string; presentationId: string; revision: number; format: ExportFormat; idempotencyKey: string }): Promise<ExportJob>;
  retryJob(jobId: string, idempotencyKey: string): Promise<ProjectJob>;
}

const terminalStatus: Record<string, ProjectJobStatus> = {
  completed: "success",
  success: "success",
  queued: "queued",
  running: "running",
  failed: "failed",
  cancelled: "cancelled",
  stale: "stale",
  idle: "idle",
};

function status(value: unknown): ProjectJobStatus {
  return terminalStatus[String(value)] ?? "idle";
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function asArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object") : [];
}

function stringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function numberValue(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function mapElement(value: Record<string, unknown>): PresentationElement | undefined {
  const type = value.type;
  if (type !== "text" && type !== "image" && type !== "shape" && type !== "chart" && type !== "table") return undefined;
  const id = stringValue(value.id);
  const width = numberValue(value.width);
  const height = numberValue(value.height);
  if (!id || width <= 0 || height <= 0) return undefined;
  const base = {
    id,
    type,
    x: numberValue(value.x),
    y: numberValue(value.y),
    width,
    height,
    rotation: numberValue(value.rotation),
    opacity: typeof value.opacity === "number" ? value.opacity : 1,
    locked: value.locked === true,
    name: typeof value.name === "string" ? value.name : undefined,
    semanticRole: typeof value.semanticRole === "string" ? value.semanticRole as PresentationElement["semanticRole"] : undefined,
    readingOrder: typeof value.readingOrder === "number" ? value.readingOrder : undefined,
    decorative: value.decorative === true,
    evidenceRefs: Array.isArray(value.evidenceRefs) ? value.evidenceRefs.filter((entry): entry is string => typeof entry === "string") : undefined,
  };
  if (type === "text") return {
    ...base,
    type,
    text: stringValue(value.text),
    fontFamily: typeof value.fontFamily === "string" ? value.fontFamily : undefined,
    fontSize: typeof value.fontSize === "number" ? value.fontSize : undefined,
    color: typeof value.color === "string" ? value.color : undefined,
    bold: value.bold === true,
    italic: value.italic === true,
    align: value.align === "center" || value.align === "right" ? value.align : "left",
    verticalAlign: value.verticalAlign === "middle" || value.verticalAlign === "bottom" ? value.verticalAlign : "top",
  };
  if (type === "image") return {
    ...base,
    type,
    src: stringValue(value.src),
    alt: stringValue(value.alt),
    fit: value.fit === "contain" || value.fit === "fill" ? value.fit : "cover",
  };
  if (type === "chart") return {
    ...base,
    type,
    chartType: value.chartType === "column" || value.chartType === "line" || value.chartType === "area" || value.chartType === "pie" || value.chartType === "doughnut" ? value.chartType : "bar",
    categories: Array.isArray(value.categories) ? value.categories.filter((entry): entry is string => typeof entry === "string") : [],
    series: asArray(value.series).map((entry) => ({ name: stringValue(entry.name), values: Array.isArray(entry.values) ? entry.values.filter((item): item is number => typeof item === "number" && Number.isFinite(item)) : [] })),
    unit: typeof value.unit === "string" ? value.unit : undefined,
    sourceEvidenceId: stringValue(value.sourceEvidenceId),
    showLegend: value.showLegend !== false,
    showValues: value.showValues === true,
    colorScheme: Array.isArray(value.colorScheme) ? value.colorScheme.filter((entry): entry is string => typeof entry === "string") : undefined,
  };
  if (type === "table") return {
    ...base,
    type,
    columns: asArray(value.columns).map((entry) => ({ key: stringValue(entry.key), label: stringValue(entry.label), width: typeof entry.width === "number" ? entry.width : undefined })),
    rows: asArray(value.rows).map((entry) => Object.fromEntries(Object.entries(entry).filter(([, item]) => item === null || ["string", "number", "boolean"].includes(typeof item))) as Record<string, string | number | boolean | null>),
    headerColor: typeof value.headerColor === "string" ? value.headerColor : undefined,
    bodyColor: typeof value.bodyColor === "string" ? value.bodyColor : undefined,
    textColor: typeof value.textColor === "string" ? value.textColor : undefined,
    sourceEvidenceId: stringValue(value.sourceEvidenceId),
  };
  return {
    ...base,
    type,
    shape: value.shape === "roundRect" || value.shape === "ellipse" || value.shape === "line" || value.shape === "arrow" ? value.shape : "rect",
    fill: typeof value.fill === "string" ? value.fill : undefined,
    stroke: typeof value.stroke === "string" ? value.stroke : undefined,
    strokeWidth: typeof value.strokeWidth === "number" ? value.strokeWidth : undefined,
  };
}

function mapJob(raw: Record<string, unknown>, fallback: { projectId: string; presentationId?: string; revision: number }): ProjectJob {
  return {
    id: stringValue(raw.id),
    projectId: stringValue(raw.projectId, fallback.projectId),
    presentationId: stringValue(raw.presentationId, fallback.presentationId),
    revision: numberValue(raw.revision, fallback.revision),
    type: raw.type === "generate" || raw.type === "quality-check" ? raw.type : "export",
    status: status(raw.status),
    progress: typeof raw.progress === "number" ? raw.progress : undefined,
    idempotencyKey: typeof raw.idempotencyKey === "string" ? raw.idempotencyKey : undefined,
    startedAt: typeof raw.startedAt === "string" ? raw.startedAt : undefined,
    completedAt: typeof raw.completedAt === "string" ? raw.completedAt : undefined,
    error: typeof raw.error === "string" ? raw.error : undefined,
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : undefined,
  };
}

function mapExport(raw: Record<string, unknown>, fallback: { projectId: string; presentationId?: string; revision: number }): ExportJob {
  const job = mapJob({ ...raw, id: stringValue(raw.jobId, stringValue(raw.id)), type: "export" }, fallback);
  return {
    ...job,
    type: "export",
    exportId: typeof raw.id === "string" ? raw.id : undefined,
    format: raw.format === "pdf" || raw.format === "png" || raw.format === "html" || raw.format === "html-zip" ? raw.format : "pptx",
    downloadUrl: typeof raw.downloadUrl === "string" ? raw.downloadUrl : undefined,
  };
}

function mapQuality(raw: Record<string, unknown>, revision: number): QualityReport | undefined {
  if (Object.keys(raw).length === 0) return undefined;
  const report = asRecord(raw.report);
  const content = Object.keys(report).length > 0 ? report : raw;
  const checkedRevision = numberValue(raw.revision, numberValue(content.checkedRevision, numberValue(content.revision, revision)));
  const isV2 = content.version === "2.0.0";
  const hardGates: NonNullable<QualityReport["hardGates"]> = asArray(content.hardGates).map((gate) => ({
    id: stringValue(gate.id),
    status: gate.status === "failed" ? "failed" : gate.status === "warning" ? "warning" : "passed",
    issueIds: Array.isArray(gate.issueIds) ? gate.issueIds.filter((entry): entry is string => typeof entry === "string") : [],
  }));
  const dimensions = asArray(content.dimensions).map((dimension) => ({ id: stringValue(dimension.id), label: stringValue(dimension.label), weight: numberValue(dimension.weight), score: numberValue(dimension.score) }));
  const manualReviews = asArray(content.manualReviews).map((entry) => ({ id: stringValue(entry.id), label: stringValue(entry.label), status: "manual" as const, message: stringValue(entry.message), issueCodes: [] as string[] }));
  const issues: QualityReport["issues"] = asArray(content.issues).map((issue) => ({
    code: stringValue(issue.code, stringValue(issue.ruleId, "UNKNOWN")),
    message: stringValue(issue.message),
    slideId: typeof issue.slideId === "string" ? issue.slideId : undefined,
    elementId: typeof issue.elementId === "string" ? issue.elementId : undefined,
    severity: issue.severity === "info" ? "info" : issue.severity === "warning" ? "warning" : issue.severity === "error" ? "error" : undefined,
    stage: issue.stage === "content" || issue.stage === "geometry" || issue.stage === "render" ? issue.stage : stringValue(issue.ruleId).startsWith("render.") ? "render" as const : stringValue(issue.ruleId).startsWith("geometry.") ? "geometry" as const : "content" as const,
    verification: issue.verification === "verified" ? "verified" : issue.verification === "unverifiable" ? "unverifiable" : issue.verification === "manual" ? "manual" : "risk",
    evidence: typeof issue.evidence === "string" ? issue.evidence : undefined,
    repairHint: typeof issue.repairHint === "string" ? issue.repairHint : undefined,
    bbox: typeof issue.bbox === "object" && issue.bbox ? { x: numberValue(asRecord(issue.bbox).x), y: numberValue(asRecord(issue.bbox).y), width: numberValue(asRecord(issue.bbox).width), height: numberValue(asRecord(issue.bbox).height) } : undefined,
  }));
  return {
    version: isV2 ? "2.0.0" : "1.0.0",
    revision: checkedRevision,
    status: raw.status === "stale" || content.status === "stale" ? "stale" : content.status === "passed" ? "passed" : content.status === "needs_review" ? "needs_review" : "success",
    score: typeof content.score === "number" ? content.score : undefined,
    issues,
    deductions: asArray(content.deductions).map((entry) => ({ code: stringValue(entry.code), points: numberValue(entry.points), reason: stringValue(entry.reason), slideId: typeof entry.slideId === "string" ? entry.slideId : undefined, elementId: typeof entry.elementId === "string" ? entry.elementId : undefined })),
    majorDeductions: asArray(content.majorDeductions).map((entry) => ({ code: stringValue(entry.code), points: numberValue(entry.points), reason: stringValue(entry.reason), slideId: typeof entry.slideId === "string" ? entry.slideId : undefined, elementId: typeof entry.elementId === "string" ? entry.elementId : undefined })),
    checks: isV2 ? [
      ...hardGates.map((gate) => ({ id: `gate-${gate.id}`, label: `硬门禁 · ${gate.id}`, status: gate.status === "passed" ? "verified" as const : "risk" as const, message: gate.status === "passed" ? "已通过" : gate.status === "failed" ? "未通过，必须修复" : "存在警告", issueCodes: gate.issueIds })),
      ...dimensions.map((dimension) => ({ id: `dimension-${dimension.id}`, label: dimension.label, status: dimension.score >= 75 ? "verified" as const : "risk" as const, message: `${dimension.score} / 100 · 权重 ${dimension.weight}`, issueCodes: [] })),
      ...manualReviews,
    ] : asArray(content.checks).map((entry) => ({ id: stringValue(entry.id), label: stringValue(entry.label), status: entry.status === "verified" || entry.status === "risk" || entry.status === "unverifiable" || entry.status === "manual" ? entry.status : "risk", message: stringValue(entry.message), issueCodes: Array.isArray(entry.issueCodes) ? entry.issueCodes.filter((code): code is string => typeof code === "string") : [] })),
    hardGates,
    dimensions,
    worstSlides: asArray(content.worstSlides).map((entry) => ({ slideId: stringValue(entry.slideId), score: numberValue(entry.score), issueCount: numberValue(entry.issueCount) })),
    renderRefs: asArray(content.renderRefs).map((entry) => ({ slideId: stringValue(entry.slideId), width: numberValue(entry.width), height: numberValue(entry.height), artifactKey: typeof entry.artifactKey === "string" ? entry.artifactKey : undefined, sha256: typeof entry.sha256 === "string" ? entry.sha256 : undefined })),
    checkedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : typeof content.checkedAt === "string" ? content.checkedAt : undefined,
  };
}

function mapProject(record: RemoteProjectRecord, presentation?: RemotePresentation, quality?: QualityReport, exports: ExportJob[] = [], jobs: ProjectJob[] = []): PresentationProject {
  const brief = asRecord(presentation?.brief ?? record.brief);
  const blueprint = asRecord(record.blueprint);
  const slides = asArray(presentation?.slides);
  const outline = asArray(presentation?.storyboard ?? blueprint.slides).map((item, index) => ({
    id: stringValue(item.id, `outline-${index + 1}`),
    title: stringValue(item.title, stringValue(item.conclusion, `第 ${index + 1} 页`)),
    purpose: typeof item.purpose === "string" ? item.purpose : undefined,
    section: typeof item.section === "string" ? item.section : undefined,
    slideId: typeof item.slideId === "string" ? item.slideId : undefined,
  }));
  const generationJob = asRecord(blueprint.generationJob);
  const latestGenerationJob = jobs
    .filter((job) => job.type === "generate")
    .sort((left, right) => Date.parse(right.updatedAt ?? right.startedAt ?? "") - Date.parse(left.updatedAt ?? left.startedAt ?? ""))[0];
  const revision = numberValue(presentation?.revision, numberValue(blueprint.revision, 0));
  return {
    id: record.id,
    title: stringValue(presentation?.title, record.name),
    brief: {
      originalPrompt: stringValue(brief.originalPrompt, stringValue(record.topic)),
      topic: stringValue(brief.topic, stringValue(record.topic, record.name)),
      audience: Array.isArray(brief.audience) ? brief.audience.filter((item): item is string => typeof item === "string") : undefined,
      purpose: typeof brief.goal === "string" ? brief.goal : undefined,
      scenario: typeof brief.scenario === "string" ? brief.scenario : undefined,
      language: stringValue(brief.language, "zh-CN"),
      pageCount: numberValue(brief.pageCount, numberValue(brief.slideCount, slides.length)),
      sourceFileIds: Array.isArray(brief.sourceFileIds)
        ? brief.sourceFileIds.filter((item): item is string => typeof item === "string")
        : asArray(brief.sources).map((source) => stringValue(source.id)).filter(Boolean),
      answers: Object.fromEntries(Object.entries(asRecord(brief.answers)).filter((entry): entry is [string, string] => typeof entry[1] === "string")),
    },
    outline,
    theme: presentation?.theme ?? { name: "AIPPT" },
    slides: slides.map((slide, index) => ({
      id: stringValue(slide.id, `slide-${index + 1}`),
      title: stringValue(slide.title),
      background: stringValue(slide.background, "#F6F5EF"),
      notes: stringValue(slide.notes),
      elements: asArray(slide.elements).map(mapElement).filter((element): element is PresentationElement => Boolean(element)),
    })),
    activeSlideId: typeof brief.activeSlideId === "string" ? brief.activeSlideId : undefined,
    generationStatus: latestGenerationJob?.status ?? status(generationJob.status),
    generationStale: record.derivedDataStale === true,
    sourceRevision: numberValue(record.sourceRevision),
    revision,
    qualityReport: quality,
    exportJobs: exports,
    createdAt: presentation?.createdAt ?? record.createdAt,
    updatedAt: presentation?.updatedAt ?? record.updatedAt,
  };
}

export class HttpProjectRepository implements ProjectRepository {
  constructor(private readonly origin = process.env.NEXT_PUBLIC_API_ORIGIN ?? "/backend-api") {}

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${this.origin}${path}`, {
      ...init,
      headers: { "content-type": "application/json", ...init?.headers },
      cache: "no-store",
    });
    if (!response.ok) throw new ProjectRepositoryError(await response.text() || `Project API request failed (${response.status})`, response.status);
    return response.json() as Promise<T>;
  }

  async getWorkbench(projectId: string, signal?: AbortSignal): Promise<ProjectWorkbench> {
    const payload = await this.request<Record<string, unknown>>(`/api/projects/${encodeURIComponent(projectId)}/workbench`, { signal });
    const record = asRecord(payload.project) as unknown as RemoteProjectRecord;
    if (!record.id || record.id !== projectId) throw new ProjectRepositoryError("Project response does not match requested projectId");
    const presentation = asRecord(payload.presentation ?? payload.latestPresentation) as unknown as RemotePresentation;
    const presentationId = presentation.id || undefined;
    const revision = numberValue(presentation.revision, 0);
    const quality = mapQuality(asRecord(payload.qualityReport ?? payload.quality), revision);
    const fallback = { projectId, presentationId, revision };
    const exports = asArray(payload.exports).map((item) => mapExport(item, fallback));
    const jobs = asArray(payload.jobs).map((item) => mapJob(item, fallback));
    return {
      project: mapProject(record, presentationId ? presentation : undefined, quality, exports, jobs),
      presentationId,
      presentation: presentationId ? presentation : undefined,
      jobs,
      source: "api",
      loadedAt: new Date().toISOString(),
    };
  }

  async getJob(jobId: string, signal?: AbortSignal): Promise<ProjectJob> {
    const payload = await this.request<Record<string, unknown>>(`/api/jobs/${encodeURIComponent(jobId)}`, { signal });
    const raw = asRecord(payload.job);
    return mapJob(raw, { projectId: stringValue(raw.projectId), presentationId: typeof raw.presentationId === "string" ? raw.presentationId : undefined, revision: numberValue(raw.revision) });
  }

  async startQualityCheck(projectId: string, presentationId: string, revision: number, idempotencyKey: string): Promise<ProjectJob | QualityReport> {
    const payload = await this.request<Record<string, unknown>>(`/api/presentations/${encodeURIComponent(presentationId)}/quality`, {
      method: "POST",
      body: JSON.stringify({ projectId, revision, idempotencyKey }),
    });
    if (payload.job) return mapJob(asRecord(payload.job), { projectId, presentationId, revision });
    return mapQuality(asRecord(payload.quality), revision) ?? {
      revision,
      status: "success",
      issues: [],
      deductions: [],
      majorDeductions: [],
      checks: [],
    };
  }

  async startExport(input: { projectId: string; presentationId: string; revision: number; format: ExportFormat; idempotencyKey: string }): Promise<ExportJob> {
    const payload = await this.request<Record<string, unknown>>(`/api/presentations/${encodeURIComponent(input.presentationId)}/exports`, {
      method: "POST",
      body: JSON.stringify({ projectId: input.projectId, revision: input.revision, format: input.format, idempotencyKey: input.idempotencyKey }),
    });
    const exportRecord = asRecord(payload.export);
    const job = asRecord(payload.job);
    return mapExport({ ...exportRecord, ...(job.id ? job : {}) }, input);
  }

  async retryJob(jobId: string, idempotencyKey: string): Promise<ProjectJob> {
    const payload = await this.request<Record<string, unknown>>(`/api/jobs/${encodeURIComponent(jobId)}/retry`, {
      method: "POST",
      body: JSON.stringify({ idempotencyKey }),
    });
    const raw = asRecord(payload.job);
    return mapJob(raw, { projectId: stringValue(raw.projectId), presentationId: typeof raw.presentationId === "string" ? raw.presentationId : undefined, revision: numberValue(raw.revision) });
  }
}
