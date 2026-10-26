import { HttpProjectRepository } from "./project-repository";
import { ProjectService } from "./project-service";
import type { ExportFormat, ExportJob, PresentationRevisionUpdate, ProjectJob, ProjectWorkbench, QualityReport } from "./project-types";

export interface ProjectStoreState {
  projectId?: string;
  workbench?: ProjectWorkbench;
  loading: boolean;
  error?: string;
}

type Listener = () => void;

/** Small framework-free store so every P0 screen observes the same projectId-scoped snapshot. */
export class ProjectStore {
  private state: ProjectStoreState = { loading: false };
  private readonly listeners = new Set<Listener>();
  private request?: AbortController;

  constructor(private readonly service = new ProjectService(new HttpProjectRepository())) {}

  getSnapshot = (): ProjectStoreState => this.state;
  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private publish(next: ProjectStoreState): void {
    this.state = next;
    this.listeners.forEach((listener) => listener());
  }

  async open(projectId: string): Promise<void> {
    this.request?.abort();
    const request = new AbortController();
    this.request = request;
    this.publish({ projectId, workbench: this.state.projectId === projectId ? this.state.workbench : undefined, loading: true });
    try {
      const workbench = await this.service.load(projectId, request.signal);
      if (this.request !== request) return;
      this.publish({ projectId, workbench, loading: false });
    } catch (error) {
      if (request.signal.aborted || this.request !== request) return;
      this.publish({ projectId, loading: false, error: error instanceof Error ? error.message : "Unable to load project" });
    }
  }

  async checkQuality(): Promise<ProjectJob | QualityReport> {
    const workbench = this.requireWorkbench();
    const result = await this.service.requestQualityCheck(workbench);
    if ("issues" in result) this.mergeQuality(result);
    else this.mergeJob(result);
    return result;
  }

  async export(format: ExportFormat): Promise<ExportJob> {
    const result = await this.service.requestExport(this.requireWorkbench(), format);
    this.mergeJob(result);
    return result;
  }

  async retry(jobId: string): Promise<ProjectJob> {
    const job = this.requireWorkbench().jobs.find((entry) => entry.id === jobId);
    if (!job) throw new Error("The requested job is not part of this project");
    const retried = await this.service.retry(job);
    this.mergeJob(retried);
    return retried;
  }

  async refreshJob(jobId: string): Promise<ProjectJob> {
    const job = this.requireWorkbench().jobs.find((entry) => entry.id === jobId);
    if (!job) throw new Error("The requested job is not part of this project");
    const current = await this.service.refreshJob(job);
    this.mergeJob(current);
    return current;
  }

  /**
   * Call after an authoritative presentation save. This is intentionally
   * projectId-scoped: an older response or another project's save is ignored.
   */
  applyPresentationRevision(update: PresentationRevisionUpdate): void {
    const workbench = this.state.workbench;
    if (!workbench || workbench.project.id !== update.projectId || workbench.presentationId !== update.presentationId) return;
    if (update.revision <= workbench.project.revision) return;
    const stale = <T extends ProjectJob>(job: T): T => job.revision === update.revision || job.status === "failed" ? job : { ...job, status: "stale" };
    const project = {
      ...workbench.project,
      title: update.title ?? workbench.project.title,
      slides: update.slides ?? workbench.project.slides,
      activeSlideId: update.activeSlideId ?? workbench.project.activeSlideId,
      revision: update.revision,
      updatedAt: update.updatedAt ?? new Date().toISOString(),
      qualityReport: workbench.project.qualityReport
        ? { ...workbench.project.qualityReport, status: "stale" as const }
        : undefined,
      exportJobs: workbench.project.exportJobs.map(stale),
    };
    this.publish({ ...this.state, workbench: { ...workbench, project, jobs: workbench.jobs.map(stale) } });
  }

  private requireWorkbench(): ProjectWorkbench {
    if (!this.state.workbench) throw new Error("No project has been loaded");
    return this.state.workbench;
  }

  private mergeQuality(quality: QualityReport): void {
    const workbench = this.requireWorkbench();
    if (quality.revision !== workbench.project.revision) return;
    this.publish({ ...this.state, workbench: { ...workbench, project: { ...workbench.project, qualityReport: quality } } });
  }

  private mergeJob(job: ProjectJob): void {
    const workbench = this.requireWorkbench();
    if (job.projectId !== workbench.project.id || job.revision !== workbench.project.revision) return;
    const jobs = [...workbench.jobs.filter((entry) => entry.id !== job.id), job];
    const exports = job.type === "export"
      ? [...workbench.project.exportJobs.filter((entry) => entry.id !== job.id), job as ExportJob]
      : workbench.project.exportJobs;
    this.publish({ ...this.state, workbench: { ...workbench, jobs, project: { ...workbench.project, exportJobs: exports } } });
  }
}

let browserStore: ProjectStore | undefined;

export function getProjectStore(): ProjectStore {
  browserStore ??= new ProjectStore();
  return browserStore;
}
