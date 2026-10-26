export type ProjectStage = "brief" | "outline" | "generate" | "edit" | "review" | "export";

export type ProjectJobStatus = "idle" | "queued" | "running" | "success" | "failed" | "cancelled" | "stale";
export type ProjectJobType = "generate" | "quality-check" | "export";
export type ExportFormat = "pptx" | "pdf" | "png" | "html" | "html-zip";

export interface OutlineItem {
  id: string;
  title: string;
  purpose?: string;
  section?: string;
  slideId?: string;
}

export interface ThemeSpec {
  name: string;
  headingFont?: string;
  bodyFont?: string;
  colors?: Record<string, string>;
}

export interface PresentationElementBase {
  id: string;
  type: "text" | "image" | "shape" | "chart" | "table";
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
  opacity?: number;
  locked?: boolean;
  name?: string;
  semanticRole?: "title" | "subtitle" | "body" | "caption" | "source" | "decorative" | "data-visual" | "data-table" | "image" | "shape";
  readingOrder?: number;
  decorative?: boolean;
  evidenceRefs?: string[];
}

export interface PresentationTextElement extends PresentationElementBase {
  type: "text";
  text: string;
  fontFamily?: string;
  fontSize?: number;
  color?: string;
  bold?: boolean;
  italic?: boolean;
  align?: "left" | "center" | "right";
  verticalAlign?: "top" | "middle" | "bottom";
}

export interface PresentationImageElement extends PresentationElementBase {
  type: "image";
  src: string;
  alt?: string;
  fit?: "cover" | "contain" | "fill";
}

export interface PresentationShapeElement extends PresentationElementBase {
  type: "shape";
  shape?: "rect" | "roundRect" | "ellipse" | "line" | "arrow";
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
}

export interface PresentationChartElement extends PresentationElementBase {
  type: "chart";
  chartType: "bar" | "column" | "line" | "area" | "pie" | "doughnut";
  categories: string[];
  series: Array<{ name: string; values: number[] }>;
  unit?: string;
  sourceEvidenceId: string;
  showLegend?: boolean;
  showValues?: boolean;
  colorScheme?: string[];
}

export interface PresentationTableElement extends PresentationElementBase {
  type: "table";
  columns: Array<{ key: string; label: string; width?: number }>;
  rows: Array<Record<string, string | number | boolean | null>>;
  headerColor?: string;
  bodyColor?: string;
  textColor?: string;
  sourceEvidenceId: string;
}

export type PresentationElement = PresentationTextElement | PresentationImageElement | PresentationShapeElement | PresentationChartElement | PresentationTableElement;

export interface SlideSpec {
  id: string;
  title: string;
  background?: string;
  notes?: string;
  elements?: PresentationElement[];
}

export interface QualityIssue {
  code: string;
  message: string;
  slideId?: string;
  elementId?: string;
  severity?: "info" | "warning" | "error";
  stage?: "content" | "geometry" | "render";
  verification?: "verified" | "risk" | "unverifiable" | "manual";
  evidence?: string;
  repairHint?: string;
  bbox?: { x: number; y: number; width: number; height: number };
}

export interface QualityDeduction {
  code: string;
  points: number;
  reason: string;
  slideId?: string;
  elementId?: string;
}

export interface QualityCheck {
  id: string;
  label: string;
  status: "verified" | "risk" | "unverifiable" | "manual";
  message: string;
  issueCodes: string[];
}

export interface QualityReport {
  version?: "1.0.0" | "2.0.0";
  revision: number;
  status: "success" | "passed" | "needs_review" | "stale";
  score?: number;
  issues: QualityIssue[];
  deductions: QualityDeduction[];
  majorDeductions: QualityDeduction[];
  checks: QualityCheck[];
  hardGates?: Array<{ id: string; status: "passed" | "failed" | "warning"; issueIds: string[] }>;
  dimensions?: Array<{ id: string; label: string; weight: number; score: number }>;
  worstSlides?: Array<{ slideId: string; score: number; issueCount: number }>;
  renderRefs?: Array<{ slideId: string; width: number; height: number; artifactKey?: string; sha256?: string }>;
  checkedAt?: string;
}

export interface ProjectJob {
  id: string;
  projectId: string;
  presentationId?: string;
  revision: number;
  type: ProjectJobType;
  status: ProjectJobStatus;
  progress?: number;
  idempotencyKey?: string;
  startedAt?: string;
  completedAt?: string;
  error?: string;
  updatedAt?: string;
}

export interface ExportJob extends ProjectJob {
  type: "export";
  exportId?: string;
  format: ExportFormat;
  downloadUrl?: string;
}

export interface PresentationProject {
  id: string;
  title: string;
  brief: {
    originalPrompt: string;
    topic: string;
    audience?: string[];
    purpose?: string;
    scenario?: string;
    language: string;
    pageCount: number;
    sourceFileIds: string[];
    answers: Record<string, string>;
  };
  outline: OutlineItem[];
  theme: ThemeSpec;
  slides: SlideSpec[];
  activeSlideId?: string;
  generationStatus: ProjectJobStatus;
  generationStale: boolean;
  sourceRevision: number;
  revision: number;
  qualityReport?: QualityReport;
  exportJobs: ExportJob[];
  createdAt: string;
  updatedAt: string;
}

export interface ProjectWorkbench {
  project: PresentationProject;
  presentationId?: string;
  presentation?: RemotePresentation;
  jobs: ProjectJob[];
  source: "api" | "recovery-cache";
  loadedAt: string;
}

export interface PresentationRevisionUpdate {
  projectId: string;
  presentationId: string;
  revision: number;
  title?: string;
  slides?: SlideSpec[];
  activeSlideId?: string;
  updatedAt?: string;
}

export function isRevisionStale(revision: number, currentRevision: number): boolean {
  return revision !== currentRevision;
}

export interface RemoteProjectRecord {
  id: string;
  name: string;
  topic?: string;
  brief?: Record<string, unknown>;
  blueprint?: Record<string, unknown>;
  derivedDataStale?: boolean;
  sourceRevision?: number;
  createdAt: string;
  updatedAt: string;
}

export interface RemotePresentation {
  id: string;
  projectId: string;
  title: string;
  revision: number;
  brief?: Record<string, unknown>;
  theme?: ThemeSpec;
  storyboard?: Array<Record<string, unknown>>;
  slides?: Array<Record<string, unknown>>;
  createdAt: string;
  updatedAt: string;
}
