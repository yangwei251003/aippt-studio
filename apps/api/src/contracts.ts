import type { Blueprint, CommandEnvelope, CreationBrief, PresentationDocument, ProjectJobStatus, ProjectJobType, QualityReport, QualityReportV2 } from "@aippt/core";
import type { ParsedUpload } from "./upload/types.js";
import type { CommercialStore } from "./commercial/types.js";
import type { AgentEventRecord, WorkflowRunRecord, WorkflowStep } from "./workflow/types.js";

export interface ProjectRecord {
  id: string;
  ownerUserId: string;
  name: string;
  topic: string;
  brief?: CreationBrief;
  blueprint?: Blueprint;
  derivedDataStale: boolean;
  sourceRevision: number;
  createdAt: string;
  updatedAt: string;
}

export type JobStatus = ProjectJobStatus;
export type ExportFormat = "pptx" | "pdf" | "png" | "html" | "html-zip";

export interface JobRecord {
  id: string;
  projectId: string;
  presentationId?: string;
  revision: number;
  type: ProjectJobType;
  status: JobStatus;
  progress?: number;
  attempts: number;
  maxAttempts: number;
  idempotencyKey?: string;
  payload: Record<string, unknown>;
  result?: Record<string, unknown>;
  error?: string;
  startedAt?: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ExportRecord {
  id: string;
  projectId: string;
  presentationId: string;
  revision: number;
  format: ExportFormat;
  status: JobStatus;
  jobId: string;
  userId: string;
  branding: "aippt" | "none";
  objectKey?: string;
  downloadUrl?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

export interface QualityReportRecord {
  id: string;
  projectId: string;
  presentationId: string;
  revision: number;
  status: "success" | "stale";
  jobId: string;
  report: QualityReport | QualityReportV2;
  createdAt: string;
  updatedAt: string;
}

export interface UploadRecord {
  id: string;
  projectId?: string;
  ownerUserId: string;
  filename: string;
  mime: string;
  size: number;
  fileHash: string;
  parsed: ParsedUpload;
  createdAt: string;
}

export interface CommandHistoryRecord {
  id: string;
  sequence: number;
  undone: boolean;
  createdAt: string;
}

export interface CreateProjectInput {
  name: string;
  topic?: string;
  ownerUserId?: string;
}

export interface AppStore extends CommercialStore {
  init(): Promise<void>;
  close(): Promise<void>;
  listProjects(): Promise<ProjectRecord[]>;
  getProject(id: string): Promise<ProjectRecord | undefined>;
  createProject(input: CreateProjectInput): Promise<ProjectRecord>;
  updateProject(id: string, patch: Partial<Pick<ProjectRecord, "name" | "topic" | "brief" | "blueprint" | "derivedDataStale">>): Promise<ProjectRecord | undefined>;
  deleteProject(id: string): Promise<boolean>;
  listPresentations(projectId?: string): Promise<PresentationDocument[]>;
  getPresentation(id: string): Promise<PresentationDocument | undefined>;
  createPresentation(document: PresentationDocument): Promise<PresentationDocument>;
  commitGenerationResult(jobId: string, sourceRevision: number, document: PresentationDocument): Promise<PresentationDocument | undefined>;
  replacePresentation(document: PresentationDocument, expectedRevision: number): Promise<PresentationDocument>;
  deletePresentation(id: string): Promise<boolean>;
  applyCommands(id: string, commands: CommandEnvelope[], scopeSlideId?: string): Promise<PresentationDocument>;
  undo(id: string, expectedRevision: number): Promise<PresentationDocument>;
  listCommandHistory(presentationId: string): Promise<CommandHistoryRecord[]>;
  createUpload(record: UploadRecord): Promise<UploadRecord>;
  getUpload(id: string): Promise<UploadRecord | undefined>;
  listUploads(projectId?: string): Promise<UploadRecord[]>;
  bindUpload(id: string, projectId: string, ownerUserId: string): Promise<UploadRecord | undefined>;
  createJob(job: JobRecord): Promise<JobRecord>;
  getJob(id: string): Promise<JobRecord | undefined>;
  listJobs(projectId: string, presentationId?: string): Promise<JobRecord[]>;
  findReusableJob(input: { projectId: string; presentationId?: string; revision: number; type: ProjectJobType; idempotencyKey?: string }): Promise<JobRecord | undefined>;
  claimJob(id: string): Promise<JobRecord | undefined>;
  claimNextJob(): Promise<JobRecord | undefined>;
  updateJob(id: string, patch: Partial<Pick<JobRecord, "status" | "progress" | "result" | "error" | "startedAt" | "completedAt">>): Promise<JobRecord | undefined>;
  retryJob(id: string): Promise<JobRecord | undefined>;
  createExport(record: ExportRecord): Promise<ExportRecord>;
  getExport(id: string): Promise<ExportRecord | undefined>;
  getExportByJobId(jobId: string): Promise<ExportRecord | undefined>;
  listExports(projectId: string, presentationId?: string): Promise<ExportRecord[]>;
  findReusableExport(input: { projectId: string; presentationId: string; revision: number; format: ExportFormat; userId?: string; branding?: ExportRecord["branding"] }): Promise<ExportRecord | undefined>;
  updateExport(id: string, patch: Partial<Pick<ExportRecord, "status" | "objectKey" | "downloadUrl" | "error">>): Promise<ExportRecord | undefined>;
  createQualityReport(record: QualityReportRecord): Promise<QualityReportRecord>;
  getLatestQualityReport(presentationId: string): Promise<QualityReportRecord | undefined>;
  createWorkflowRun(record: WorkflowRunRecord): Promise<WorkflowRunRecord>;
  getWorkflowRun(id: string): Promise<WorkflowRunRecord | undefined>;
  getLatestWorkflowRun(projectId: string): Promise<WorkflowRunRecord | undefined>;
  findWorkflowRun(projectId: string, idempotencyKey: string): Promise<WorkflowRunRecord | undefined>;
  updateWorkflowRun(id: string, patch: { status?: WorkflowRunRecord["status"]; currentStep?: WorkflowStep | undefined; stepIndex?: number; artifacts?: WorkflowRunRecord["artifacts"]; usage?: WorkflowRunRecord["usage"]; modelAssignments?: WorkflowRunRecord["modelAssignments"]; bestArtifactId?: string | undefined; error?: string | undefined; completedAt?: string | undefined }, expected?: { status?: WorkflowRunRecord["status"]; stepIndex?: number }): Promise<WorkflowRunRecord | undefined>;
  appendAgentEvent(record: Omit<AgentEventRecord, "sequence">): Promise<AgentEventRecord>;
  listAgentEvents(runId: string, afterSequence?: number): Promise<AgentEventRecord[]>;
}

export interface ProductionPostgresAdapter {
  readonly kind: "postgres";
  createStore(): Promise<AppStore>;
}
