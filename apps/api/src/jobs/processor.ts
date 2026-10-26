import { randomUUID } from "node:crypto";
import { generationRunInputSchema, inspectPresentation, inspectPresentationV2, type QualityReportV2 } from "@aippt/core";
import type { ExportFormat } from "../contracts.js";
import type { AppStore, JobRecord, QualityReportRecord } from "../contracts.js";
import { PptxExportService } from "../export/pptx-exporter.js";
import { HtmlExportService } from "../export/html-exporter.js";
import type { SlideRenderService } from "../export/slide-renderer.js";
import { contentTypeForKey, type ObjectStore } from "../storage/object-store.js";
import type { PresentationGenerationModuleInterface } from "../generation/module.js";
import type { CommercialService } from "../commercial/service.js";
import type { RenderPort, VisualReviewPort } from "../generation/ports.js";
import { visualReviewUnavailable } from "../generation/ports.js";

interface ExportJobPayload { exportId: string; projectId: string; presentationId: string; revision: number; format: ExportFormat; branding: "aippt" | "none" }

export class QualityGateFailedError extends Error { readonly code = "QUALITY_GATE_FAILED"; readonly statusCode = 422; }

function exportPayload(payload: Record<string, unknown>): ExportJobPayload {
  const { exportId, projectId, presentationId, revision, format, branding = "none" } = payload;
  if (typeof exportId !== "string" || typeof projectId !== "string" || typeof presentationId !== "string" || !Number.isInteger(revision) || Number(revision) < 0 || !["pptx", "pdf", "png", "html", "html-zip"].includes(String(format))) throw new Error("Invalid export job payload");
  if (branding !== "aippt" && branding !== "none") throw new Error("Invalid export branding");
  return { exportId, projectId, presentationId, revision: Number(revision), format: format as ExportFormat, branding };
}

export class JobProcessor {
  constructor(
    private readonly store: AppStore,
    private readonly objects: ObjectStore,
    private readonly pptx: PptxExportService,
    private readonly slides: SlideRenderService,
    private readonly html: HtmlExportService = new HtmlExportService(),
    private readonly generation?: PresentationGenerationModuleInterface,
    private readonly commercial?: CommercialService,
    private readonly enforceQualityGate = false,
    private readonly reviewRender?: RenderPort,
    private readonly visualReview?: VisualReviewPort,
  ) {}

  kick(jobId: string): void {
    queueMicrotask(() => { void this.processJob(jobId); });
  }

  async processJob(jobId: string): Promise<boolean> {
    const job = await this.store.claimJob(jobId);
    if (!job) return false;
    await this.execute(job);
    return true;
  }

  async processNext(): Promise<boolean> {
    const job = await this.store.claimNextJob();
    if (!job) return false;
    await this.execute(job);
    return true;
  }

  private async execute(job: JobRecord): Promise<void> {
    if (job.type === "generate") { await this.executeGeneration(job); return; }
    if (job.type === "quality-check") { await this.executeQuality(job); return; }
    let payload: ExportJobPayload | undefined;
    try {
      payload = exportPayload(job.payload);
      const document = await this.store.getPresentation(payload.presentationId);
      if (!document) throw new Error(`Presentation ${payload.presentationId} was not found`);
      if (this.enforceQualityGate) {
        const quality = await this.store.getLatestQualityReport(document.id);
        const report = quality?.report as Partial<QualityReportV2> | undefined;
        if (!quality || quality.revision !== document.revision || report?.version !== "2.0.0" || report.status !== "passed") throw new QualityGateFailedError("Current presentation revision has not passed the V2 quality gate");
      }
      if (document.projectId !== payload.projectId || document.revision !== payload.revision || job.projectId !== payload.projectId || job.revision !== payload.revision) {
        await this.markStale(job, payload);
        return;
      }
      const exportRecord = await this.store.getExport(payload.exportId);
      if (!exportRecord || exportRecord.projectId !== payload.projectId || exportRecord.presentationId !== payload.presentationId || exportRecord.revision !== payload.revision) throw new Error("Export job binding does not match its project revision");
      await this.store.updateExport(payload.exportId, { status: "running" });
      await this.store.updateJob(job.id, { progress: 10 });
      let data: Uint8Array;
      let extension: string;
      if (payload.format === "pptx") {
        data = await this.pptx.render(document, { branding: payload.branding });
        extension = "pptx";
      } else if (payload.format === "pdf") {
        data = await this.slides.renderPdf(document);
        extension = "pdf";
      } else if (payload.format === "png") {
        data = await this.slides.renderPngArchive(document);
        extension = "zip";
      } else if (payload.format === "html") {
        data = await this.html.renderSingleFile(document);
        extension = "html";
      } else {
        data = await this.html.renderArchive(document);
        extension = "zip";
      }
      const latest = await this.store.getPresentation(payload.presentationId);
      if (!latest || latest.projectId !== payload.projectId || latest.revision !== payload.revision) {
        await this.markStale(job, payload);
        return;
      }
      await this.store.updateJob(job.id, { progress: 85 });
      const objectKey = `exports/${payload.projectId}/${payload.presentationId}/v${payload.revision}/${payload.exportId}.${extension}`;
      await this.objects.put(objectKey, data, contentTypeForKey(objectKey));
      const signed = await this.objects.signedDownloadUrl(objectKey);
      const downloadUrl = signed ?? `/api/exports/${payload.exportId}/download`;
      const current = await this.store.getPresentation(payload.presentationId);
      if (!current || current.projectId !== payload.projectId || current.revision !== payload.revision) {
        await this.markStale(job, payload);
        return;
      }
      const completedExport = await this.store.updateExport(payload.exportId, { status: "success", objectKey, downloadUrl });
      if (!completedExport) {
        await this.markStale(job, payload);
        return;
      }
      const completedJob = await this.store.updateJob(job.id, { status: "success", progress: 100, result: { exportId: payload.exportId, projectId: payload.projectId, revision: payload.revision, downloadUrl } });
      if (!completedJob) await this.markStale(job, payload);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (payload) await this.store.updateExport(payload.exportId, { status: "failed", error: message });
      await this.store.updateJob(job.id, { status: "failed", error: message });
    }
  }

  private async executeGeneration(job: JobRecord): Promise<void> {
    const reservationId = typeof job.payload.creditReservationId === "string" ? job.payload.creditReservationId : undefined;
    try {
      if (!this.generation) throw new Error("PresentationGenerationModule is not configured");
      const input = generationRunInputSchema.parse(job.payload.generationInput);
      if (input.jobId !== job.id || input.projectId !== job.projectId || input.presentationId !== job.presentationId) throw new Error("Generation job binding is invalid");
      await this.store.updateJob(job.id, { progress: 5 });
      const existing = await this.store.getPresentation(input.presentationId);
      if (existing) {
        await this.store.updateJob(job.id, { status: "success", progress: 100, result: { presentationId: existing.id, projectId: existing.projectId, revision: existing.revision, workflowRunId: input.runId } });
        if (reservationId && this.commercial) await this.commercial.settleCredits(reservationId);
        return;
      }
      const outcome = await this.generation.run(input);
      await this.store.updateJob(job.id, { progress: 88 });
      const committed = await this.store.commitGenerationResult(job.id, input.sourceRevision, outcome.presentation);
      if (!committed) {
        await this.store.updateJob(job.id, { status: "stale", error: `Generation source revision ${input.sourceRevision} is stale` });
        if (reservationId && this.commercial) await this.commercial.refundCredits(reservationId);
        return;
      }
      const now = new Date().toISOString(); const qualityReportId = randomUUID();
      await this.store.createQualityReport({ id: qualityReportId, projectId: input.projectId, presentationId: input.presentationId, revision: committed.revision, status: "success", jobId: job.id, report: outcome.qualityReport as QualityReportV2, createdAt: now, updatedAt: now });
      await this.store.updateJob(job.id, { status: "success", progress: 100, result: { presentationId: committed.id, projectId: committed.projectId, revision: committed.revision, qualityStatus: outcome.qualityStatus, qualityReportId, workflowRunId: outcome.workflowRunId, bestArtifactId: outcome.bestArtifactId, modelAssignments: outcome.modelAssignments, usage: outcome.usage, durationMs: outcome.durationMs, fallbackLog: outcome.fallbackLog } });
      if (reservationId && this.commercial) await this.commercial.settleCredits(reservationId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.store.updateJob(job.id, { status: "failed", error: message });
      if (reservationId && this.commercial) await this.commercial.refundCredits(reservationId);
    }
  }

  private async executeQuality(job: JobRecord): Promise<void> {
    try {
      const presentationId = typeof job.payload.presentationId === "string" ? job.payload.presentationId : job.presentationId;
      const reportId = typeof job.payload.reportId === "string" ? job.payload.reportId : randomUUID();
      if (!presentationId) throw new Error("Quality job is missing presentationId");
      const document = await this.store.getPresentation(presentationId);
      if (!document) throw new Error(`Presentation ${presentationId} was not found`);
      if (document.projectId !== job.projectId || document.revision !== job.revision) { await this.store.updateJob(job.id, { status: "stale", error: `Quality check v${job.revision} is stale` }); return; }
      await this.store.updateJob(job.id, { progress: 25 });
      let report;
      if (this.enforceQualityGate && this.reviewRender) {
        const bundle = await this.reviewRender.render({ runId: `quality-${job.id}`, document, round: 0 });
        const renderedSlides = bundle.slides.map(({ data: _data, dataUrl: _dataUrl, ...reference }) => reference);
        const deterministic = inspectPresentationV2(document, { renderedSlides });
        const review = this.visualReview ? await this.visualReview.review({ document, bundle, profile: "standard", deterministic }) : { completed: false as const, findings: [], reviewedSlideIds: [], fallbackReason: "No visual review port is configured" };
        report = inspectPresentationV2(document, { renderedSlides, visualFindings: review.completed ? review.findings : [visualReviewUnavailable(review.fallbackReason ?? "Vision review did not complete")] });
      } else report = inspectPresentation(document);
      const now = new Date().toISOString();
      const record: QualityReportRecord = { id: reportId, projectId: job.projectId, presentationId, revision: job.revision, status: "success", jobId: job.id, report, createdAt: now, updatedAt: now };
      const saved = await this.store.createQualityReport(record);
      await this.store.updateJob(job.id, { status: saved.status === "stale" ? "stale" : "success", progress: 100, result: { qualityReportId: saved.id, projectId: saved.projectId, revision: saved.revision, qualityStatus: report.status } });
    } catch (error) {
      await this.store.updateJob(job.id, { status: "failed", error: error instanceof Error ? error.message : String(error) });
    }
  }

  private async markStale(job: JobRecord, payload: ExportJobPayload): Promise<void> {
    await this.store.updateExport(payload.exportId, { status: "stale", error: `Export v${payload.revision} is stale` });
    await this.store.updateJob(job.id, { status: "stale", error: `Job v${payload.revision} no longer matches the current project revision` });
  }
}
