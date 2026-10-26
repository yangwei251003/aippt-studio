import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { applyCommand, applyCommandBatch, presentationDocumentSchema, RevisionConflictError, type CommandEnvelope, type PresentationDocument, type QualityReport, type QualityReportV2 } from "@aippt/core";
import { and, desc, eq, exists, gte, inArray, lt, ne, notInArray, sql } from "drizzle-orm";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import type { AppStore, CommandHistoryRecord, CreateProjectInput, ExportRecord, JobRecord, ProjectRecord, QualityReportRecord, UploadRecord } from "../contracts.js";
import type { AgentEventRecord, WorkflowRunRecord } from "../workflow/types.js";
import { COMMERCIAL_PLANS } from "../commercial/config.js";
import type { AccountRecord, AnalyticsEventRecord, CheckoutRecord, CreditLedgerRecord, CreditReservationRecord, ResumeAction, SubscriptionRecord } from "../commercial/types.js";
import { agentEvents, analyticsEvents, billingCheckouts, commandHistory, commercialAccounts, creditLedger, creditReservations, exportsTable, jobs, presentations, projects, qualityReports, subscriptions, uploads, workflowRuns } from "./schema.js";

const schema = { projects, presentations, commandHistory, uploads, jobs, exportsTable, qualityReports, workflowRuns, agentEvents, commercialAccounts, subscriptions, creditReservations, creditLedger, billingCheckouts, analyticsEvents };

function normalizeStoredStatus(status: JobRecord["status"] | "completed"): JobRecord["status"] {
  return status === "completed" ? "success" : status;
}

function projectFromRow(row: typeof projects.$inferSelect): ProjectRecord {
  return {
    id: row.id,
    ownerUserId: row.ownerUserId,
    name: row.name,
    topic: row.topic,
    derivedDataStale: row.derivedDataStale,
    sourceRevision: row.sourceRevision,
    ...(row.brief ? { brief: row.brief as NonNullable<ProjectRecord["brief"]> } : {}),
    ...(row.blueprint ? { blueprint: row.blueprint as NonNullable<ProjectRecord["blueprint"]> } : {}),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function jobFromRow(row: typeof jobs.$inferSelect): JobRecord {
  const payload = row.payload as Record<string, unknown>;
  const projectId = row.projectId ?? (typeof payload.projectId === "string" ? payload.projectId : "");
  const presentationId = row.presentationId ?? (typeof payload.presentationId === "string" ? payload.presentationId : undefined);
  const revision = row.revision ?? (typeof payload.revision === "number" ? payload.revision : 0);
  return {
    id: row.id,
    projectId,
    ...(presentationId ? { presentationId } : {}),
    revision,
    type: row.type as JobRecord["type"],
    status: normalizeStoredStatus(row.status as JobRecord["status"] | "completed"),
    ...(row.progress === null ? {} : { progress: row.progress }),
    attempts: row.attempts,
    maxAttempts: row.maxAttempts,
    ...(row.idempotencyKey ? { idempotencyKey: row.idempotencyKey } : {}),
    payload,
    ...(row.result ? { result: row.result as Record<string, unknown> } : {}),
    ...(row.error ? { error: row.error } : {}),
    ...(row.startedAt ? { startedAt: row.startedAt } : {}),
    ...(row.completedAt ? { completedAt: row.completedAt } : {}),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function exportFromRow(row: typeof exportsTable.$inferSelect): ExportRecord {
  return {
    id: row.id,
    projectId: row.projectId ?? "",
    presentationId: row.presentationId,
    revision: row.revision ?? 0,
    format: row.format as ExportRecord["format"],
    status: normalizeStoredStatus(row.status as ExportRecord["status"] | "completed"),
    jobId: row.jobId,
    userId: row.userId,
    branding: row.branding as ExportRecord["branding"],
    ...(row.objectKey ? { objectKey: row.objectKey } : {}),
    ...(row.downloadUrl ? { downloadUrl: row.downloadUrl } : {}),
    ...(row.error ? { error: row.error } : {}),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function accountFromRow(row: typeof commercialAccounts.$inferSelect): AccountRecord {
  return { userId: row.userId, planId: row.planId as AccountRecord["planId"], creditBalance: row.creditBalance, creditGrant: row.creditGrant, periodStartedAt: row.periodStartedAt, ...(row.periodEndsAt ? { periodEndsAt: row.periodEndsAt } : {}), createdAt: row.createdAt, updatedAt: row.updatedAt };
}

function subscriptionFromRow(row: typeof subscriptions.$inferSelect): SubscriptionRecord {
  return { ...row, planId: row.planId as SubscriptionRecord["planId"], interval: row.interval as SubscriptionRecord["interval"], status: row.status as SubscriptionRecord["status"] };
}

function reservationFromRow(row: typeof creditReservations.$inferSelect): CreditReservationRecord {
  return { ...row, action: row.action as CreditReservationRecord["action"], status: row.status as CreditReservationRecord["status"] };
}

function ledgerFromRow(row: typeof creditLedger.$inferSelect): CreditLedgerRecord {
  return { id: row.id, userId: row.userId, ...(row.reservationId ? { reservationId: row.reservationId } : {}), type: row.type as CreditLedgerRecord["type"], amount: row.amount, balanceAfter: row.balanceAfter, action: row.action, ...(row.projectId ? { projectId: row.projectId } : {}), ...(row.jobId ? { jobId: row.jobId } : {}), idempotencyKey: row.idempotencyKey, createdAt: row.createdAt };
}

function checkoutFromRow(row: typeof billingCheckouts.$inferSelect): CheckoutRecord {
  return { id: row.id, userId: row.userId, planId: row.planId as "pro", interval: row.interval as CheckoutRecord["interval"], status: row.status as CheckoutRecord["status"], provider: row.provider, mode: row.mode as CheckoutRecord["mode"], returnTo: row.returnTo, ...(row.resumeAction ? { resumeAction: row.resumeAction as ResumeAction } : {}), ...(row.providerCheckoutId ? { providerCheckoutId: row.providerCheckoutId } : {}), createdAt: row.createdAt, ...(row.completedAt ? { completedAt: row.completedAt } : {}), updatedAt: row.updatedAt };
}

function eventFromRow(row: typeof analyticsEvents.$inferSelect): AnalyticsEventRecord {
  return { id: row.id, userId: row.userId, event: row.event as AnalyticsEventRecord["event"], ...(row.projectId ? { projectId: row.projectId } : {}), ...(row.presentationId ? { presentationId: row.presentationId } : {}), metadata: row.metadata as Record<string, unknown>, ...(row.idempotencyKey ? { idempotencyKey: row.idempotencyKey } : {}), createdAt: row.createdAt };
}

function qualityFromRow(row: typeof qualityReports.$inferSelect): QualityReportRecord {
  const report = row.report as QualityReport | QualityReportV2;
  let normalizedReport: QualityReport | QualityReportV2;
  if ((report as QualityReportV2).version === "2.0.0") normalizedReport = row.status === "stale" ? { ...(report as QualityReportV2), status: "stale" } : report as QualityReportV2;
  else normalizedReport = { ...(report as QualityReport), status: row.status === "stale" ? "stale" : "valid" };
  return {
    id: row.id,
    projectId: row.projectId,
    presentationId: row.presentationId,
    revision: row.revision,
    status: row.status as QualityReportRecord["status"],
    jobId: row.jobId,
    report: normalizedReport,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function workflowRunFromRow(row: typeof workflowRuns.$inferSelect): WorkflowRunRecord {
  return {
    id: row.id, projectId: row.projectId, ownerUserId: row.ownerUserId,
    ...(row.presentationId ? { presentationId: row.presentationId } : {}), source: row.source as WorkflowRunRecord["source"],
    status: row.status as WorkflowRunRecord["status"], ...(row.currentStep ? { currentStep: row.currentStep as NonNullable<WorkflowRunRecord["currentStep"]> } : {}),
    stepIndex: row.stepIndex, artifacts: row.artifacts as WorkflowRunRecord["artifacts"], usage: row.usage as WorkflowRunRecord["usage"],
    workflowVersion: row.workflowVersion as WorkflowRunRecord["workflowVersion"], qualityProfile: row.qualityProfile as WorkflowRunRecord["qualityProfile"], sourceRevision: row.sourceRevision,
    modelAssignments: row.modelAssignments as WorkflowRunRecord["modelAssignments"], ...(row.inputHash ? { inputHash: row.inputHash } : {}),
    ...(row.bestArtifactId ? { bestArtifactId: row.bestArtifactId } : {}), ...(row.generationInput ? { generationInput: row.generationInput as NonNullable<WorkflowRunRecord["generationInput"]> } : {}),
    ...(row.idempotencyKey ? { idempotencyKey: row.idempotencyKey } : {}), ...(row.error ? { error: row.error } : {}),
    createdAt: row.createdAt, updatedAt: row.updatedAt, ...(row.completedAt ? { completedAt: row.completedAt } : {}),
  };
}

function agentEventFromRow(row: typeof agentEvents.$inferSelect): AgentEventRecord {
  return {
    id: row.id, runId: row.runId, projectId: row.projectId, sequence: row.sequence, type: row.type as AgentEventRecord["type"],
    ...(row.step ? { step: row.step as NonNullable<AgentEventRecord["step"]> } : {}), ...(row.agentId ? { agentId: row.agentId } : {}),
    ...(row.modelId ? { modelId: row.modelId } : {}), payload: row.payload as Record<string, unknown>, createdAt: row.createdAt,
  };
}

function uploadFromRow(row: typeof uploads.$inferSelect): UploadRecord {
  return { id: row.id, ...(row.projectId ? { projectId: row.projectId } : {}), ownerUserId: row.ownerUserId, filename: row.filename, mime: row.mime, size: row.size, fileHash: row.fileHash, parsed: row.parsed as UploadRecord["parsed"], createdAt: row.createdAt };
}

export class PGliteAppStore implements AppStore {
  private readonly client: PGlite;
  private readonly db: PgliteDatabase<typeof schema>;

  constructor(path = "memory://") {
    const storagePath = path === "memory://" ? path : resolve(path);
    if (storagePath !== "memory://") mkdirSync(dirname(storagePath), { recursive: true });
    this.client = new PGlite(storagePath);
    this.db = drizzle(this.client, { schema });
  }

  async init(): Promise<void> {
    await this.client.waitReady;
    await this.client.exec(`
      CREATE TABLE IF NOT EXISTS projects (
        id text PRIMARY KEY, owner_user_id text NOT NULL DEFAULT 'local-demo-user', name text NOT NULL, topic text NOT NULL,
        brief jsonb, blueprint jsonb, derived_data_stale boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL
      );
      CREATE TABLE IF NOT EXISTS presentations (
        id text PRIMARY KEY, project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        title text NOT NULL, revision integer NOT NULL, document jsonb NOT NULL,
        created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL
      );
      CREATE TABLE IF NOT EXISTS command_history (
        id text PRIMARY KEY, sequence serial NOT NULL, presentation_id text NOT NULL REFERENCES presentations(id) ON DELETE CASCADE,
        inverses jsonb NOT NULL, undone boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL
      );
      CREATE TABLE IF NOT EXISTS uploads (
        id text PRIMARY KEY, project_id text REFERENCES projects(id) ON DELETE CASCADE, owner_user_id text NOT NULL DEFAULT 'local-demo-user',
        filename text NOT NULL, mime text NOT NULL, size integer NOT NULL, file_hash text NOT NULL DEFAULT '',
        parsed jsonb NOT NULL, created_at timestamptz NOT NULL
      );
      CREATE TABLE IF NOT EXISTS jobs (
        id text PRIMARY KEY, project_id text, presentation_id text, revision integer,
        type text NOT NULL, status text NOT NULL, progress integer, attempts integer NOT NULL DEFAULT 0,
        max_attempts integer NOT NULL DEFAULT 3, idempotency_key text, payload jsonb NOT NULL,
        result jsonb, error text, started_at timestamptz, completed_at timestamptz,
        created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL
      );
      CREATE TABLE IF NOT EXISTS exports (
        id text PRIMARY KEY, presentation_id text NOT NULL REFERENCES presentations(id) ON DELETE CASCADE,
        project_id text, revision integer, format text NOT NULL, status text NOT NULL,
        job_id text NOT NULL REFERENCES jobs(id) ON DELETE CASCADE, user_id text NOT NULL DEFAULT 'local-demo-user', branding text NOT NULL DEFAULT 'none',
        object_key text, download_url text, error text, created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL
      );
      CREATE TABLE IF NOT EXISTS workflow_runs (
        id text PRIMARY KEY, project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        owner_user_id text NOT NULL, presentation_id text, source text NOT NULL, status text NOT NULL,
        current_step text, step_index integer NOT NULL DEFAULT 0, artifacts jsonb NOT NULL DEFAULT '{}',
        usage jsonb NOT NULL DEFAULT '{"inputTokens":0,"outputTokens":0,"costUsd":0}', workflow_version text NOT NULL DEFAULT '1.0.0',
        quality_profile text NOT NULL DEFAULT 'standard', source_revision integer NOT NULL DEFAULT 0, input_hash text,
        model_assignments jsonb NOT NULL DEFAULT '{}', best_artifact_id text, generation_input jsonb, idempotency_key text, error text,
        created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL, completed_at timestamptz
      );
      CREATE UNIQUE INDEX IF NOT EXISTS workflow_runs_project_idempotency_idx ON workflow_runs(project_id, idempotency_key);
      ALTER TABLE workflow_runs ADD COLUMN IF NOT EXISTS artifacts jsonb NOT NULL DEFAULT '{}';
      ALTER TABLE workflow_runs ADD COLUMN IF NOT EXISTS usage jsonb NOT NULL DEFAULT '{"inputTokens":0,"outputTokens":0,"costUsd":0}';
      ALTER TABLE workflow_runs ADD COLUMN IF NOT EXISTS workflow_version text NOT NULL DEFAULT '1.0.0';
      ALTER TABLE workflow_runs ADD COLUMN IF NOT EXISTS quality_profile text NOT NULL DEFAULT 'standard';
      ALTER TABLE workflow_runs ADD COLUMN IF NOT EXISTS source_revision integer NOT NULL DEFAULT 0;
      ALTER TABLE workflow_runs ADD COLUMN IF NOT EXISTS input_hash text;
      ALTER TABLE workflow_runs ADD COLUMN IF NOT EXISTS model_assignments jsonb NOT NULL DEFAULT '{}';
      ALTER TABLE workflow_runs ADD COLUMN IF NOT EXISTS best_artifact_id text;
      ALTER TABLE workflow_runs ADD COLUMN IF NOT EXISTS generation_input jsonb;
      UPDATE workflow_runs SET status = 'running', updated_at = now() WHERE status = 'executing';
      CREATE TABLE IF NOT EXISTS agent_events (
        id text PRIMARY KEY, sequence serial NOT NULL, run_id text NOT NULL REFERENCES workflow_runs(id) ON DELETE CASCADE,
        project_id text NOT NULL, type text NOT NULL, step text, agent_id text, model_id text,
        payload jsonb NOT NULL, created_at timestamptz NOT NULL
      );
      ALTER TABLE jobs ADD COLUMN IF NOT EXISTS project_id text;
      ALTER TABLE jobs ADD COLUMN IF NOT EXISTS presentation_id text;
      ALTER TABLE jobs ADD COLUMN IF NOT EXISTS revision integer;
      ALTER TABLE jobs ADD COLUMN IF NOT EXISTS progress integer;
      ALTER TABLE jobs ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0;
      ALTER TABLE jobs ADD COLUMN IF NOT EXISTS max_attempts integer NOT NULL DEFAULT 3;
      ALTER TABLE jobs ADD COLUMN IF NOT EXISTS idempotency_key text;
      ALTER TABLE jobs ADD COLUMN IF NOT EXISTS started_at timestamptz;
      ALTER TABLE jobs ADD COLUMN IF NOT EXISTS completed_at timestamptz;
      ALTER TABLE projects ADD COLUMN IF NOT EXISTS owner_user_id text NOT NULL DEFAULT 'local-demo-user';
      ALTER TABLE projects ADD COLUMN IF NOT EXISTS derived_data_stale boolean NOT NULL DEFAULT false;
      ALTER TABLE projects ADD COLUMN IF NOT EXISTS source_revision integer NOT NULL DEFAULT 0;
      ALTER TABLE uploads ADD COLUMN IF NOT EXISTS owner_user_id text NOT NULL DEFAULT 'local-demo-user';
      ALTER TABLE uploads ADD COLUMN IF NOT EXISTS file_hash text NOT NULL DEFAULT '';
      ALTER TABLE exports ADD COLUMN IF NOT EXISTS project_id text;
      ALTER TABLE exports ADD COLUMN IF NOT EXISTS revision integer;
      ALTER TABLE exports ADD COLUMN IF NOT EXISTS user_id text NOT NULL DEFAULT 'local-demo-user';
      ALTER TABLE exports ADD COLUMN IF NOT EXISTS branding text NOT NULL DEFAULT 'none';
      UPDATE jobs SET status = 'success' WHERE status = 'completed';
      UPDATE exports SET status = 'success' WHERE status = 'completed';
      UPDATE jobs SET status = 'queued', progress = 0, started_at = NULL, updated_at = now()
        WHERE status = 'running' AND attempts < max_attempts;
      UPDATE jobs SET status = 'failed', error = COALESCE(error, 'Interrupted job exhausted its retry limit'), completed_at = now(), updated_at = now()
        WHERE status = 'running' AND attempts >= max_attempts;
      UPDATE exports e SET status = 'queued', error = NULL, object_key = NULL, download_url = NULL, updated_at = now()
        FROM jobs j WHERE e.job_id = j.id AND j.status = 'queued' AND e.status = 'running';
      UPDATE exports e SET status = 'failed', error = COALESCE(e.error, 'Interrupted job exhausted its retry limit'), updated_at = now()
        FROM jobs j WHERE e.job_id = j.id AND j.status = 'failed' AND e.status = 'running';
      UPDATE exports e SET project_id = p.project_id, revision = p.revision
        FROM presentations p WHERE e.presentation_id = p.id AND (e.project_id IS NULL OR e.revision IS NULL);
      UPDATE jobs j SET project_id = p.project_id, presentation_id = p.id,
        revision = COALESCE((j.payload->>'revision')::integer, p.revision)
        FROM presentations p WHERE j.payload->>'presentationId' = p.id
          AND (j.project_id IS NULL OR j.presentation_id IS NULL OR j.revision IS NULL);
      CREATE TABLE IF NOT EXISTS quality_reports (
        id text PRIMARY KEY, project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        presentation_id text NOT NULL REFERENCES presentations(id) ON DELETE CASCADE,
        revision integer NOT NULL, status text NOT NULL, job_id text NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
        report jsonb NOT NULL, created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL
      );
      CREATE TABLE IF NOT EXISTS commercial_accounts (
        user_id text PRIMARY KEY, plan_id text NOT NULL, credit_balance integer NOT NULL CHECK (credit_balance >= 0),
        credit_grant integer NOT NULL, period_started_at timestamptz NOT NULL, period_ends_at timestamptz,
        created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL
      );
      CREATE TABLE IF NOT EXISTS subscriptions (
        id text PRIMARY KEY, user_id text NOT NULL UNIQUE, plan_id text NOT NULL, interval text NOT NULL,
        status text NOT NULL, provider text NOT NULL, current_period_started_at timestamptz NOT NULL,
        current_period_ends_at timestamptz NOT NULL, created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL
      );
      CREATE TABLE IF NOT EXISTS credit_reservations (
        id text PRIMARY KEY, user_id text NOT NULL, action text NOT NULL, amount integer NOT NULL CHECK (amount >= 0),
        status text NOT NULL, project_id text NOT NULL, job_id text NOT NULL, idempotency_key text NOT NULL,
        created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL, UNIQUE(user_id, idempotency_key)
      );
      CREATE TABLE IF NOT EXISTS credit_ledger (
        id text PRIMARY KEY, user_id text NOT NULL, reservation_id text, type text NOT NULL, amount integer NOT NULL,
        balance_after integer NOT NULL CHECK (balance_after >= 0), action text NOT NULL, project_id text, job_id text,
        idempotency_key text NOT NULL, created_at timestamptz NOT NULL, UNIQUE(user_id, idempotency_key)
      );
      CREATE TABLE IF NOT EXISTS billing_checkouts (
        id text PRIMARY KEY, user_id text NOT NULL, plan_id text NOT NULL, interval text NOT NULL, status text NOT NULL,
        provider text NOT NULL, mode text NOT NULL, return_to text NOT NULL, resume_action jsonb, provider_checkout_id text,
        created_at timestamptz NOT NULL, completed_at timestamptz, updated_at timestamptz NOT NULL
      );
      CREATE TABLE IF NOT EXISTS analytics_events (
        id text PRIMARY KEY, user_id text NOT NULL, event text NOT NULL, project_id text, presentation_id text,
        metadata jsonb NOT NULL, idempotency_key text, created_at timestamptz NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS analytics_user_idempotency_idx ON analytics_events(user_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
      CREATE INDEX IF NOT EXISTS presentations_project_idx ON presentations(project_id);
      CREATE INDEX IF NOT EXISTS history_presentation_idx ON command_history(presentation_id, sequence DESC);
      CREATE INDEX IF NOT EXISTS jobs_status_idx ON jobs(status, created_at);
      CREATE INDEX IF NOT EXISTS jobs_project_idx ON jobs(project_id, presentation_id, revision, type);
      CREATE INDEX IF NOT EXISTS exports_project_idx ON exports(project_id, presentation_id, revision);
      CREATE INDEX IF NOT EXISTS quality_presentation_idx ON quality_reports(presentation_id, revision DESC);
      CREATE INDEX IF NOT EXISTS credit_ledger_user_idx ON credit_ledger(user_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS analytics_events_user_idx ON analytics_events(user_id, created_at DESC);
    `);
  }

  async close(): Promise<void> { await this.client.close(); }

  private async markDerivedDataStale(presentationId: string, currentRevision: number): Promise<void> {
    const now = new Date().toISOString();
    await this.db.update(jobs).set({ status: "stale", completedAt: now, updatedAt: now })
      .where(and(eq(jobs.presentationId, presentationId), ne(jobs.revision, currentRevision), inArray(jobs.status, ["success", "completed"])));
    await this.db.update(exportsTable).set({ status: "stale", updatedAt: now })
      .where(and(eq(exportsTable.presentationId, presentationId), ne(exportsTable.revision, currentRevision), inArray(exportsTable.status, ["success", "completed"])));
    await this.db.update(qualityReports).set({ status: "stale", updatedAt: now })
      .where(and(eq(qualityReports.presentationId, presentationId), ne(qualityReports.revision, currentRevision), eq(qualityReports.status, "success")));
  }

  async listProjects(): Promise<ProjectRecord[]> {
    const rows = await this.db.select().from(projects).orderBy(desc(projects.updatedAt));
    return rows.map(projectFromRow);
  }

  async getProject(id: string): Promise<ProjectRecord | undefined> {
    const [row] = await this.db.select().from(projects).where(eq(projects.id, id)).limit(1);
    return row ? projectFromRow(row) : undefined;
  }

  async createProject(input: CreateProjectInput): Promise<ProjectRecord> {
    const now = new Date().toISOString();
    const row: typeof projects.$inferInsert = { id: randomUUID(), ownerUserId: input.ownerUserId ?? "local-demo-user", name: input.name, topic: input.topic ?? input.name, derivedDataStale: false, sourceRevision: 0, createdAt: now, updatedAt: now };
    await this.db.insert(projects).values(row);
    return projectFromRow({ ...row, ownerUserId: row.ownerUserId ?? "local-demo-user", derivedDataStale: row.derivedDataStale ?? false, sourceRevision: row.sourceRevision ?? 0, brief: null, blueprint: null });
  }

  async updateProject(id: string, patch: Partial<Pick<ProjectRecord, "name" | "topic" | "brief" | "blueprint" | "derivedDataStale">>): Promise<ProjectRecord | undefined> {
    const updatedAt = new Date().toISOString();
    const invalidatesDerivedData = patch.brief !== undefined || patch.blueprint !== undefined;
    const [row] = await this.db.update(projects).set({ ...patch, ...(invalidatesDerivedData ? { derivedDataStale: true, sourceRevision: sql`${projects.sourceRevision} + 1` } : {}), updatedAt }).where(eq(projects.id, id)).returning();
    if (row && invalidatesDerivedData) {
      await this.db.update(jobs).set({ status: "stale", completedAt: updatedAt, updatedAt }).where(and(eq(jobs.projectId, id), inArray(jobs.status, ["queued", "running", "success", "completed"])));
      await this.db.update(exportsTable).set({ status: "stale", updatedAt }).where(and(eq(exportsTable.projectId, id), inArray(exportsTable.status, ["queued", "running", "success", "completed"])));
      await this.db.update(qualityReports).set({ status: "stale", updatedAt }).where(and(eq(qualityReports.projectId, id), eq(qualityReports.status, "success")));
    }
    return row ? projectFromRow(row) : undefined;
  }

  async deleteProject(id: string): Promise<boolean> {
    const rows = await this.db.delete(projects).where(eq(projects.id, id)).returning({ id: projects.id });
    return rows.length > 0;
  }

  async listPresentations(projectId?: string): Promise<PresentationDocument[]> {
    const query = this.db.select().from(presentations);
    const rows = projectId ? await query.where(eq(presentations.projectId, projectId)).orderBy(desc(presentations.updatedAt)) : await query.orderBy(desc(presentations.updatedAt));
    return rows.map((row) => presentationDocumentSchema.parse(row.document));
  }

  async getPresentation(id: string): Promise<PresentationDocument | undefined> {
    const [row] = await this.db.select().from(presentations).where(eq(presentations.id, id)).limit(1);
    return row ? presentationDocumentSchema.parse(row.document) : undefined;
  }

  async createPresentation(input: PresentationDocument): Promise<PresentationDocument> {
    const document = presentationDocumentSchema.parse(input);
    await this.db.insert(presentations).values({ id: document.id, projectId: document.projectId, title: document.title, revision: document.revision, document, createdAt: document.createdAt, updatedAt: document.updatedAt });
    await this.db.update(projects).set({ derivedDataStale: false, updatedAt: document.updatedAt }).where(eq(projects.id, document.projectId));
    return document;
  }

  async commitGenerationResult(jobId: string, sourceRevision: number, input: PresentationDocument): Promise<PresentationDocument | undefined> {
    const document = presentationDocumentSchema.parse(input);
    return this.db.transaction(async (tx) => {
      const [job] = await tx.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);
      const [project] = await tx.select().from(projects).where(eq(projects.id, document.projectId)).limit(1);
      if (!job || !project || job.status !== "running" || job.projectId !== document.projectId || job.presentationId !== document.id || job.revision !== document.revision || project.sourceRevision !== sourceRevision) return undefined;
      await tx.insert(presentations).values({ id: document.id, projectId: document.projectId, title: document.title, revision: document.revision, document, createdAt: document.createdAt, updatedAt: document.updatedAt }).onConflictDoNothing();
      await tx.update(projects).set({ derivedDataStale: false, updatedAt: document.updatedAt }).where(and(eq(projects.id, document.projectId), eq(projects.sourceRevision, sourceRevision)));
      const now = new Date().toISOString();
      await tx.update(jobs).set({ status: "success", progress: 100, result: { presentationId: document.id, projectId: document.projectId, revision: document.revision }, completedAt: now, updatedAt: now }).where(and(eq(jobs.id, jobId), eq(jobs.status, "running")));
      return document;
    });
  }

  async replacePresentation(input: PresentationDocument, expectedRevision: number): Promise<PresentationDocument> {
    const document = presentationDocumentSchema.parse(input);
    if (document.revision <= expectedRevision) throw new RevisionConflictError(expectedRevision + 1, document.revision);
    const replaced = await this.db.transaction(async (tx) => {
      const rows = await tx.update(presentations).set({ title: document.title, revision: document.revision, document, updatedAt: document.updatedAt }).where(and(eq(presentations.id, document.id), eq(presentations.revision, expectedRevision))).returning({ id: presentations.id });
      if (!rows.length) {
        const [current] = await tx.select({ revision: presentations.revision }).from(presentations).where(eq(presentations.id, document.id)).limit(1);
        throw new RevisionConflictError(expectedRevision, current?.revision ?? -1);
      }
      // A full editor snapshot supersedes command inverses created against older content.
      await tx.delete(commandHistory).where(eq(commandHistory.presentationId, document.id));
      return document;
    });
    await this.markDerivedDataStale(replaced.id, replaced.revision);
    return replaced;
  }

  async deletePresentation(id: string): Promise<boolean> {
    const rows = await this.db.delete(presentations).where(eq(presentations.id, id)).returning({ id: presentations.id });
    return rows.length > 0;
  }

  async applyCommands(id: string, commands: CommandEnvelope[], scopeSlideId?: string): Promise<PresentationDocument> {
    const applied = await this.db.transaction(async (tx) => {
      const [row] = await tx.select().from(presentations).where(eq(presentations.id, id)).limit(1);
      if (!row) throw new Error(`Presentation ${id} was not found`);
      const current = presentationDocumentSchema.parse(row.document);
      const applied = applyCommandBatch(current, commands, scopeSlideId);
      const updated = await tx.update(presentations).set({ title: applied.document.title, revision: applied.document.revision, document: applied.document, updatedAt: applied.document.updatedAt }).where(and(eq(presentations.id, id), eq(presentations.revision, current.revision))).returning({ id: presentations.id });
      if (!updated.length) {
        const [latest] = await tx.select({ revision: presentations.revision }).from(presentations).where(eq(presentations.id, id)).limit(1);
        throw new RevisionConflictError(current.revision, latest?.revision ?? -1);
      }
      await tx.insert(commandHistory).values({ id: randomUUID(), presentationId: id, inverses: applied.inverses, undone: false, createdAt: new Date().toISOString() });
      return applied.document;
    });
    await this.markDerivedDataStale(applied.id, applied.revision);
    return applied;
  }

  async undo(id: string, expectedRevision: number): Promise<PresentationDocument> {
    const undone = await this.db.transaction(async (tx) => {
      const [row] = await tx.select().from(presentations).where(eq(presentations.id, id)).limit(1);
      if (!row) throw new Error(`Presentation ${id} was not found`);
      const current = presentationDocumentSchema.parse(row.document);
      if (current.revision !== expectedRevision) throw new RevisionConflictError(expectedRevision, current.revision);
      const [history] = await tx.select().from(commandHistory).where(and(eq(commandHistory.presentationId, id), eq(commandHistory.undone, false))).orderBy(desc(commandHistory.sequence)).limit(1);
      if (!history) throw new Error("Nothing to undo");
      let document = current;
      for (const inverse of history.inverses as CommandEnvelope[]) {
        document = applyCommand(document, { ...inverse, baseRevision: document.revision }).document;
      }
      const updated = await tx.update(presentations).set({ title: document.title, revision: document.revision, document, updatedAt: document.updatedAt }).where(and(eq(presentations.id, id), eq(presentations.revision, current.revision))).returning({ id: presentations.id });
      if (!updated.length) {
        const [latest] = await tx.select({ revision: presentations.revision }).from(presentations).where(eq(presentations.id, id)).limit(1);
        throw new RevisionConflictError(current.revision, latest?.revision ?? -1);
      }
      await tx.update(commandHistory).set({ undone: true }).where(eq(commandHistory.id, history.id));
      return document;
    });
    await this.markDerivedDataStale(undone.id, undone.revision);
    return undone;
  }

  async listCommandHistory(presentationId: string): Promise<CommandHistoryRecord[]> {
    const rows = await this.db.select({ id: commandHistory.id, sequence: commandHistory.sequence, undone: commandHistory.undone, createdAt: commandHistory.createdAt }).from(commandHistory).where(eq(commandHistory.presentationId, presentationId)).orderBy(desc(commandHistory.sequence));
    return rows;
  }

  async createUpload(record: UploadRecord): Promise<UploadRecord> {
    const [saved] = await this.db.insert(uploads).values(record).onConflictDoNothing().returning();
    if (saved) return uploadFromRow(saved);
    const existing = await this.getUpload(record.id);
    if (!existing) throw new Error(`Unable to create upload ${record.id}`);
    return existing;
  }

  async getUpload(id: string): Promise<UploadRecord | undefined> {
    const [row] = await this.db.select().from(uploads).where(eq(uploads.id, id)).limit(1);
    return row ? uploadFromRow(row) : undefined;
  }

  async listUploads(projectId?: string): Promise<UploadRecord[]> {
    const query = this.db.select().from(uploads);
    const rows = projectId ? await query.where(eq(uploads.projectId, projectId)).orderBy(desc(uploads.createdAt)) : await query.orderBy(desc(uploads.createdAt));
    return rows.map(uploadFromRow);
  }

  async bindUpload(id: string, projectId: string, ownerUserId: string): Promise<UploadRecord | undefined> {
    const [row] = await this.db.update(uploads).set({ projectId }).where(and(eq(uploads.id, id), eq(uploads.ownerUserId, ownerUserId))).returning();
    return row ? uploadFromRow(row) : undefined;
  }

  async createJob(job: JobRecord): Promise<JobRecord> {
    await this.db.insert(jobs).values(job);
    return job;
  }

  async getJob(id: string): Promise<JobRecord | undefined> {
    const [row] = await this.db.select().from(jobs).where(eq(jobs.id, id)).limit(1);
    return row ? jobFromRow(row) : undefined;
  }

  async listJobs(projectId: string, presentationId?: string): Promise<JobRecord[]> {
    const condition = presentationId ? and(eq(jobs.projectId, projectId), eq(jobs.presentationId, presentationId)) : eq(jobs.projectId, projectId);
    const rows = await this.db.select().from(jobs).where(condition).orderBy(desc(jobs.createdAt));
    return rows.map(jobFromRow);
  }

  async findReusableJob(input: { projectId: string; presentationId?: string; revision: number; type: JobRecord["type"]; idempotencyKey?: string }): Promise<JobRecord | undefined> {
    const reusableStatuses = input.idempotencyKey ? ["queued", "running", "success", "completed"] : ["queued", "running"];
    const conditions = [
      eq(jobs.projectId, input.projectId),
      eq(jobs.revision, input.revision),
      eq(jobs.type, input.type),
      inArray(jobs.status, reusableStatuses),
    ];
    if (input.presentationId) conditions.push(eq(jobs.presentationId, input.presentationId));
    if (input.idempotencyKey) conditions.push(eq(jobs.idempotencyKey, input.idempotencyKey));
    const [row] = await this.db.select().from(jobs).where(and(...conditions)).orderBy(desc(jobs.createdAt)).limit(1);
    return row ? jobFromRow(row) : undefined;
  }

  async claimJob(id: string): Promise<JobRecord | undefined> {
    const [current] = await this.db.select({ attempts: jobs.attempts, maxAttempts: jobs.maxAttempts }).from(jobs).where(eq(jobs.id, id)).limit(1);
    if (!current || current.attempts >= current.maxAttempts) return undefined;
    const now = new Date().toISOString();
    const [row] = await this.db.update(jobs).set({ status: "running", progress: 1, attempts: current.attempts + 1, startedAt: now, completedAt: null, error: null, updatedAt: now }).where(and(eq(jobs.id, id), eq(jobs.status, "queued"), eq(jobs.attempts, current.attempts))).returning();
    return row ? jobFromRow(row) : undefined;
  }

  async claimNextJob(): Promise<JobRecord | undefined> {
    const [queued] = await this.db.select({ id: jobs.id }).from(jobs).where(eq(jobs.status, "queued")).orderBy(jobs.createdAt).limit(1);
    return queued ? this.claimJob(queued.id) : undefined;
  }

  async updateJob(id: string, patch: Partial<Pick<JobRecord, "status" | "progress" | "result" | "error" | "startedAt" | "completedAt">>): Promise<JobRecord | undefined> {
    const now = new Date().toISOString();
    const terminal = patch.status && ["success", "failed", "cancelled", "stale"].includes(patch.status);
    const bindingMatches = exists(this.db.select({ id: presentations.id }).from(presentations).where(and(
      eq(presentations.id, jobs.presentationId),
      eq(presentations.projectId, jobs.projectId),
      eq(presentations.revision, jobs.revision),
    )));
    const where = patch.status === "success"
      ? and(eq(jobs.id, id), notInArray(jobs.status, ["stale", "cancelled"]), bindingMatches)
      : patch.status === "failed"
        ? and(eq(jobs.id, id), notInArray(jobs.status, ["stale", "cancelled"]))
        : eq(jobs.id, id);
    const [row] = await this.db.update(jobs).set({ ...patch, ...(terminal && !patch.completedAt ? { completedAt: now } : {}), updatedAt: now }).where(where).returning();
    return row ? jobFromRow(row) : undefined;
  }

  async retryJob(id: string): Promise<JobRecord | undefined> {
    const now = new Date().toISOString();
    const [row] = await this.db.update(jobs).set({ status: "queued", progress: 0, error: null, result: null, startedAt: null, completedAt: null, updatedAt: now })
      .where(and(eq(jobs.id, id), eq(jobs.status, "failed"), lt(jobs.attempts, jobs.maxAttempts))).returning();
    if (!row) return undefined;
    if (row.type === "export") await this.db.update(exportsTable).set({ status: "queued", error: null, objectKey: null, downloadUrl: null, updatedAt: now }).where(eq(exportsTable.jobId, id));
    return jobFromRow(row);
  }

  async createExport(record: ExportRecord): Promise<ExportRecord> {
    await this.db.insert(exportsTable).values(record);
    return record;
  }

  async getExport(id: string): Promise<ExportRecord | undefined> {
    const [row] = await this.db.select().from(exportsTable).where(eq(exportsTable.id, id)).limit(1);
    return row ? exportFromRow(row) : undefined;
  }

  async getExportByJobId(jobId: string): Promise<ExportRecord | undefined> {
    const [row] = await this.db.select().from(exportsTable).where(eq(exportsTable.jobId, jobId)).limit(1);
    return row ? exportFromRow(row) : undefined;
  }

  async listExports(projectId: string, presentationId?: string): Promise<ExportRecord[]> {
    const condition = presentationId ? and(eq(exportsTable.projectId, projectId), eq(exportsTable.presentationId, presentationId)) : eq(exportsTable.projectId, projectId);
    const rows = await this.db.select().from(exportsTable).where(condition).orderBy(desc(exportsTable.createdAt));
    return rows.map(exportFromRow);
  }

  async findReusableExport(input: { projectId: string; presentationId: string; revision: number; format: ExportRecord["format"]; userId?: string; branding?: ExportRecord["branding"] }): Promise<ExportRecord | undefined> {
    const [row] = await this.db.select().from(exportsTable).where(and(
      eq(exportsTable.projectId, input.projectId),
      eq(exportsTable.presentationId, input.presentationId),
      eq(exportsTable.revision, input.revision),
      eq(exportsTable.format, input.format),
      ...(input.userId ? [eq(exportsTable.userId, input.userId)] : []),
      ...(input.branding ? [eq(exportsTable.branding, input.branding)] : []),
      inArray(exportsTable.status, ["queued", "running", "success", "completed"]),
    )).orderBy(desc(exportsTable.createdAt)).limit(1);
    return row ? exportFromRow(row) : undefined;
  }

  async updateExport(id: string, patch: Partial<Pick<ExportRecord, "status" | "objectKey" | "downloadUrl" | "error">>): Promise<ExportRecord | undefined> {
    const bindingMatches = exists(this.db.select({ id: presentations.id }).from(presentations).where(and(
      eq(presentations.id, exportsTable.presentationId),
      eq(presentations.projectId, exportsTable.projectId),
      eq(presentations.revision, exportsTable.revision),
    )));
    const where = patch.status === "success"
      ? and(eq(exportsTable.id, id), notInArray(exportsTable.status, ["stale", "cancelled"]), bindingMatches)
      : patch.status === "failed"
        ? and(eq(exportsTable.id, id), notInArray(exportsTable.status, ["stale", "cancelled"]))
        : eq(exportsTable.id, id);
    const [row] = await this.db.update(exportsTable).set({ ...patch, updatedAt: new Date().toISOString() }).where(where).returning();
    return row ? exportFromRow(row) : undefined;
  }

  async createQualityReport(record: QualityReportRecord): Promise<QualityReportRecord> {
    return this.db.transaction(async (tx) => {
      const [presentation] = await tx.select({ projectId: presentations.projectId, revision: presentations.revision }).from(presentations).where(eq(presentations.id, record.presentationId)).limit(1);
      const [project] = await tx.select({ derivedDataStale: projects.derivedDataStale }).from(projects).where(eq(projects.id, record.projectId)).limit(1);
      const [job] = await tx.select({ status: jobs.status, projectId: jobs.projectId, presentationId: jobs.presentationId, revision: jobs.revision }).from(jobs).where(eq(jobs.id, record.jobId)).limit(1);
      const isCurrent = presentation?.projectId === record.projectId
        && presentation.revision === record.revision
        && project?.derivedDataStale === false
        && (job?.status === "running" || job?.status === "success")
        && job.projectId === record.projectId
        && job.presentationId === record.presentationId
        && job.revision === record.revision;
      let savedReport: QualityReport | QualityReportV2;
      if ((record.report as QualityReportV2).version === "2.0.0") savedReport = isCurrent ? record.report as QualityReportV2 : { ...(record.report as QualityReportV2), status: "stale" };
      else savedReport = { ...(record.report as QualityReport), status: isCurrent ? "valid" : "stale" };
      const saved: QualityReportRecord = {
        ...record,
        status: isCurrent ? "success" : "stale",
        report: savedReport,
      };
      await tx.update(qualityReports).set({ status: "stale", updatedAt: record.createdAt })
        .where(and(eq(qualityReports.presentationId, record.presentationId), ne(qualityReports.revision, record.revision), eq(qualityReports.status, "success")));
      await tx.insert(qualityReports).values(saved);
      return saved;
    });
  }

  async getLatestQualityReport(presentationId: string): Promise<QualityReportRecord | undefined> {
    const [row] = await this.db.select().from(qualityReports).where(eq(qualityReports.presentationId, presentationId)).orderBy(desc(qualityReports.createdAt)).limit(1);
    return row ? qualityFromRow(row) : undefined;
  }

  async createWorkflowRun(record: WorkflowRunRecord): Promise<WorkflowRunRecord> {
    const [saved] = await this.db.insert(workflowRuns).values(record).onConflictDoNothing().returning();
    if (saved) return workflowRunFromRow(saved);
    if (record.idempotencyKey) {
      const existing = await this.findWorkflowRun(record.projectId, record.idempotencyKey);
      if (existing) return existing;
    }
    throw new Error(`Unable to create workflow run ${record.id}`);
  }

  async getWorkflowRun(id: string): Promise<WorkflowRunRecord | undefined> {
    const [row] = await this.db.select().from(workflowRuns).where(eq(workflowRuns.id, id)).limit(1);
    return row ? workflowRunFromRow(row) : undefined;
  }

  async getLatestWorkflowRun(projectId: string): Promise<WorkflowRunRecord | undefined> {
    const [row] = await this.db.select().from(workflowRuns).where(eq(workflowRuns.projectId, projectId)).orderBy(desc(workflowRuns.createdAt)).limit(1);
    return row ? workflowRunFromRow(row) : undefined;
  }

  async findWorkflowRun(projectId: string, idempotencyKey: string): Promise<WorkflowRunRecord | undefined> {
    const [row] = await this.db.select().from(workflowRuns).where(and(eq(workflowRuns.projectId, projectId), eq(workflowRuns.idempotencyKey, idempotencyKey))).limit(1);
    return row ? workflowRunFromRow(row) : undefined;
  }

  async updateWorkflowRun(id: string, patch: { status?: WorkflowRunRecord["status"]; currentStep?: NonNullable<WorkflowRunRecord["currentStep"]> | undefined; stepIndex?: number; artifacts?: WorkflowRunRecord["artifacts"]; usage?: WorkflowRunRecord["usage"]; modelAssignments?: WorkflowRunRecord["modelAssignments"]; bestArtifactId?: string | undefined; error?: string | undefined; completedAt?: string | undefined }, expected: { status?: WorkflowRunRecord["status"]; stepIndex?: number } = {}): Promise<WorkflowRunRecord | undefined> {
    const values = {
      ...patch,
      ...(Object.hasOwn(patch, "currentStep") ? { currentStep: patch.currentStep ?? null } : {}),
      ...(Object.hasOwn(patch, "error") ? { error: patch.error ?? null } : {}),
      ...(Object.hasOwn(patch, "completedAt") ? { completedAt: patch.completedAt ?? null } : {}),
      ...(Object.hasOwn(patch, "bestArtifactId") ? { bestArtifactId: patch.bestArtifactId ?? null } : {}),
      updatedAt: new Date().toISOString(),
    };
    const [row] = await this.db.update(workflowRuns).set(values).where(and(
      eq(workflowRuns.id, id),
      ...(expected.status ? [eq(workflowRuns.status, expected.status)] : []),
      ...(expected.stepIndex === undefined ? [] : [eq(workflowRuns.stepIndex, expected.stepIndex)]),
    )).returning();
    return row ? workflowRunFromRow(row) : undefined;
  }

  async appendAgentEvent(record: Omit<AgentEventRecord, "sequence">): Promise<AgentEventRecord> {
    const [row] = await this.db.insert(agentEvents).values(record).returning();
    if (!row) throw new Error(`Unable to append agent event ${record.id}`);
    return agentEventFromRow(row);
  }

  async listAgentEvents(runId: string, afterSequence = 0): Promise<AgentEventRecord[]> {
    const rows = await this.db.select().from(agentEvents).where(and(eq(agentEvents.runId, runId), gte(agentEvents.sequence, afterSequence + 1))).orderBy(agentEvents.sequence);
    return rows.map(agentEventFromRow);
  }

  async ensureAccount(userId: string): Promise<AccountRecord> {
    return this.db.transaction(async (tx) => {
      const now = new Date().toISOString();
      const grant = COMMERCIAL_PLANS.free.creditGrant;
      const inserted = await tx.insert(commercialAccounts).values({ userId, planId: "free", creditBalance: grant, creditGrant: grant, periodStartedAt: now, createdAt: now, updatedAt: now }).onConflictDoNothing().returning();
      if (inserted[0]) {
        await tx.insert(creditLedger).values({ id: randomUUID(), userId, type: "grant", amount: grant, balanceAfter: grant, action: "signup_grant", idempotencyKey: "signup_grant", createdAt: now }).onConflictDoNothing();
        return accountFromRow(inserted[0]);
      }
      const [row] = await tx.select().from(commercialAccounts).where(eq(commercialAccounts.userId, userId)).limit(1);
      if (!row) throw new Error(`Unable to initialize account ${userId}`);
      return accountFromRow(row);
    });
  }

  async getSubscription(userId: string): Promise<SubscriptionRecord | undefined> {
    const [row] = await this.db.select().from(subscriptions).where(eq(subscriptions.userId, userId)).limit(1);
    return row ? subscriptionFromRow(row) : undefined;
  }

  async countProjectsForUser(userId: string): Promise<number> {
    const [row] = await this.db.select({ count: sql<number>`count(*)::int` }).from(projects).where(eq(projects.ownerUserId, userId));
    return row?.count ?? 0;
  }

  async countBrandedPptxExportsForUser(userId: string): Promise<number> {
    const [row] = await this.db.select({ count: sql<number>`count(*)::int` }).from(exportsTable).where(and(eq(exportsTable.userId, userId), eq(exportsTable.format, "pptx"), eq(exportsTable.branding, "aippt"), notInArray(exportsTable.status, ["failed", "cancelled", "stale"])));
    return row?.count ?? 0;
  }

  async listCreditLedger(userId: string, limit = 100): Promise<CreditLedgerRecord[]> {
    const rows = await this.db.select().from(creditLedger).where(eq(creditLedger.userId, userId)).orderBy(desc(creditLedger.createdAt)).limit(limit);
    return rows.map(ledgerFromRow);
  }

  async getCreditReservation(id: string): Promise<CreditReservationRecord | undefined> {
    const [row] = await this.db.select().from(creditReservations).where(eq(creditReservations.id, id)).limit(1);
    return row ? reservationFromRow(row) : undefined;
  }

  async reserveCredit(input: Omit<CreditReservationRecord, "status" | "createdAt" | "updatedAt">): Promise<CreditReservationRecord | undefined> {
    await this.ensureAccount(input.userId);
    return this.db.transaction(async (tx) => {
      const [existing] = await tx.select().from(creditReservations).where(and(eq(creditReservations.userId, input.userId), eq(creditReservations.idempotencyKey, input.idempotencyKey))).limit(1);
      if (existing) return reservationFromRow(existing);
      const now = new Date().toISOString();
      const [account] = await tx.update(commercialAccounts).set({ creditBalance: sql`${commercialAccounts.creditBalance} - ${input.amount}`, updatedAt: now }).where(and(eq(commercialAccounts.userId, input.userId), gte(commercialAccounts.creditBalance, input.amount))).returning();
      if (!account) return undefined;
      const record: typeof creditReservations.$inferInsert = { ...input, status: "reserved", createdAt: now, updatedAt: now };
      const [saved] = await tx.insert(creditReservations).values(record).returning();
      await tx.insert(creditLedger).values({ id: randomUUID(), userId: input.userId, reservationId: input.id, type: "reserve", amount: -input.amount, balanceAfter: account.creditBalance, action: input.action, projectId: input.projectId, jobId: input.jobId, idempotencyKey: `reserve:${input.idempotencyKey}`, createdAt: now });
      return saved ? reservationFromRow(saved) : undefined;
    });
  }

  async settleCredit(id: string): Promise<CreditReservationRecord | undefined> {
    return this.db.transaction(async (tx) => {
      const [current] = await tx.select().from(creditReservations).where(eq(creditReservations.id, id)).limit(1);
      if (!current) return undefined;
      if (current.status !== "reserved") return reservationFromRow(current);
      const settledAmount = current.amount;
      const adjustment = 0;
      const now = new Date().toISOString();
      const [saved] = await tx.update(creditReservations).set({ status: "settled", amount: settledAmount, updatedAt: now }).where(and(eq(creditReservations.id, id), eq(creditReservations.status, "reserved"))).returning();
      if (!saved) {
        const [latest] = await tx.select().from(creditReservations).where(eq(creditReservations.id, id)).limit(1);
        return latest ? reservationFromRow(latest) : undefined;
      }
      const [account] = adjustment > 0
        ? await tx.update(commercialAccounts).set({ creditBalance: sql`${commercialAccounts.creditBalance} + ${adjustment}`, updatedAt: now }).where(eq(commercialAccounts.userId, saved.userId)).returning()
        : await tx.select().from(commercialAccounts).where(eq(commercialAccounts.userId, saved.userId)).limit(1);
      if (!account) throw new Error(`Account ${saved.userId} was not found`);
      await tx.insert(creditLedger).values({ id: randomUUID(), userId: saved.userId, reservationId: saved.id, type: "settle", amount: settledAmount, balanceAfter: account.creditBalance, action: saved.action, projectId: saved.projectId, jobId: saved.jobId, idempotencyKey: `settle:${saved.id}`, createdAt: now }).onConflictDoNothing();
      if (adjustment > 0) await tx.insert(creditLedger).values({ id: randomUUID(), userId: saved.userId, reservationId: saved.id, type: "refund", amount: adjustment, balanceAfter: account.creditBalance, action: "settlement_adjustment", projectId: saved.projectId, jobId: saved.jobId, idempotencyKey: `settle:${saved.id}:adjustment`, createdAt: now }).onConflictDoNothing();
      return reservationFromRow(saved);
    });
  }

  async refundCredit(id: string): Promise<CreditReservationRecord | undefined> {
    return this.db.transaction(async (tx) => {
      const [current] = await tx.select().from(creditReservations).where(eq(creditReservations.id, id)).limit(1);
      if (!current) return undefined;
      if (current.status !== "reserved") return reservationFromRow(current);
      const now = new Date().toISOString();
      const [saved] = await tx.update(creditReservations).set({ status: "refunded", updatedAt: now }).where(and(eq(creditReservations.id, id), eq(creditReservations.status, "reserved"))).returning();
      if (!saved) {
        const [latest] = await tx.select().from(creditReservations).where(eq(creditReservations.id, id)).limit(1);
        return latest ? reservationFromRow(latest) : undefined;
      }
      const [account] = await tx.update(commercialAccounts).set({ creditBalance: sql`${commercialAccounts.creditBalance} + ${saved.amount}`, updatedAt: now }).where(eq(commercialAccounts.userId, saved.userId)).returning();
      if (!account) throw new Error(`Account ${saved.userId} was not found`);
      await tx.insert(creditLedger).values({ id: randomUUID(), userId: saved.userId, reservationId: saved.id, type: "refund", amount: saved.amount, balanceAfter: account.creditBalance, action: saved.action, projectId: saved.projectId, jobId: saved.jobId, idempotencyKey: `refund:${saved.id}`, createdAt: now }).onConflictDoNothing();
      return reservationFromRow(saved);
    });
  }

  async createCheckout(record: CheckoutRecord): Promise<CheckoutRecord> {
    const [saved] = await this.db.insert(billingCheckouts).values(record).onConflictDoNothing().returning();
    if (saved) return checkoutFromRow(saved);
    const [existing] = await this.db.select().from(billingCheckouts).where(eq(billingCheckouts.id, record.id)).limit(1);
    if (!existing) throw new Error(`Unable to create checkout ${record.id}`);
    return checkoutFromRow(existing);
  }

  async getCheckout(id: string): Promise<CheckoutRecord | undefined> {
    const [row] = await this.db.select().from(billingCheckouts).where(eq(billingCheckouts.id, id)).limit(1);
    return row ? checkoutFromRow(row) : undefined;
  }

  async completeCheckout(id: string, providerCheckoutId?: string): Promise<{ checkout: CheckoutRecord; account: AccountRecord; subscription: SubscriptionRecord } | undefined> {
    return this.db.transaction(async (tx) => {
      const [checkout] = await tx.select().from(billingCheckouts).where(eq(billingCheckouts.id, id)).limit(1);
      if (!checkout) return undefined;
      if (checkout.status === "completed") {
        const [account] = await tx.select().from(commercialAccounts).where(eq(commercialAccounts.userId, checkout.userId)).limit(1);
        const [subscription] = await tx.select().from(subscriptions).where(eq(subscriptions.userId, checkout.userId)).limit(1);
        if (!account || !subscription) throw new Error(`Completed checkout ${id} is missing account state`);
        return { checkout: checkoutFromRow(checkout), account: accountFromRow(account), subscription: subscriptionFromRow(subscription) };
      }
      const nowDate = new Date();
      const endsDate = new Date(nowDate);
      if (checkout.interval === "yearly") endsDate.setUTCFullYear(endsDate.getUTCFullYear() + 1);
      else endsDate.setUTCMonth(endsDate.getUTCMonth() + 1);
      const now = nowDate.toISOString();
      const periodEndsAt = endsDate.toISOString();
      const grant = COMMERCIAL_PLANS.pro.creditGrant;
      const [account] = await tx.update(commercialAccounts).set({ planId: "pro", creditBalance: grant, creditGrant: grant, periodStartedAt: now, periodEndsAt, updatedAt: now }).where(eq(commercialAccounts.userId, checkout.userId)).returning();
      if (!account) throw new Error(`Account ${checkout.userId} was not initialized`);
      const subscriptionId = randomUUID();
      const [subscription] = await tx.insert(subscriptions).values({ id: subscriptionId, userId: checkout.userId, planId: "pro", interval: checkout.interval, status: "active", provider: checkout.provider, currentPeriodStartedAt: now, currentPeriodEndsAt: periodEndsAt, createdAt: now, updatedAt: now }).onConflictDoUpdate({ target: subscriptions.userId, set: { planId: "pro", interval: checkout.interval, status: "active", provider: checkout.provider, currentPeriodStartedAt: now, currentPeriodEndsAt: periodEndsAt, updatedAt: now } }).returning();
      const [completed] = await tx.update(billingCheckouts).set({ status: "completed", ...(providerCheckoutId ? { providerCheckoutId } : {}), completedAt: now, updatedAt: now }).where(eq(billingCheckouts.id, id)).returning();
      await tx.insert(creditLedger).values({ id: randomUUID(), userId: checkout.userId, type: "grant", amount: grant, balanceAfter: grant, action: "pro_period_grant", idempotencyKey: `checkout:${id}:grant`, createdAt: now }).onConflictDoNothing();
      if (!subscription || !completed) throw new Error(`Unable to complete checkout ${id}`);
      return { checkout: checkoutFromRow(completed), account: accountFromRow(account), subscription: subscriptionFromRow(subscription) };
    });
  }

  async recordAnalyticsEvent(record: AnalyticsEventRecord): Promise<AnalyticsEventRecord> {
    const [saved] = await this.db.insert(analyticsEvents).values(record).onConflictDoNothing().returning();
    if (saved) return eventFromRow(saved);
    if (record.idempotencyKey) {
      const [existing] = await this.db.select().from(analyticsEvents).where(and(eq(analyticsEvents.userId, record.userId), eq(analyticsEvents.idempotencyKey, record.idempotencyKey))).limit(1);
      if (existing) return eventFromRow(existing);
    }
    throw new Error(`Unable to record analytics event ${record.id}`);
  }

  async listAnalyticsEvents(userId: string): Promise<AnalyticsEventRecord[]> {
    const rows = await this.db.select().from(analyticsEvents).where(eq(analyticsEvents.userId, userId)).orderBy(desc(analyticsEvents.createdAt));
    return rows.map(eventFromRow);
  }
}
