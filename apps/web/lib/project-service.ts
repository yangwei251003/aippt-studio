import { ProjectRecoveryCache } from "./project-cache";
import type { ProjectRepository } from "./project-repository";
import type { ExportFormat, ExportJob, ProjectJob, ProjectWorkbench, QualityReport } from "./project-types";

function newIdempotencyKey(projectId: string, operation: string, revision: number): string {
  return `${projectId}:${operation}:v${revision}`;
}

function staleJobs(workbench: ProjectWorkbench): ProjectWorkbench {
  const revision = workbench.project.revision;
  const exports = workbench.project.exportJobs.map((job) => job.revision === revision || job.status === "failed" ? job : { ...job, status: "stale" as const });
  const jobs = workbench.jobs.map((job) => job.revision === revision || job.status === "failed" ? job : { ...job, status: "stale" as const });
  return {
    ...workbench,
    project: {
      ...workbench.project,
      qualityReport: workbench.project.qualityReport && workbench.project.qualityReport.revision !== revision
        ? { ...workbench.project.qualityReport, status: "stale" }
        : workbench.project.qualityReport,
      exportJobs: exports,
    },
    jobs,
  };
}

/** Orchestrates remote project state. Local storage is deliberately recovery-only. */
export class ProjectService {
  private readonly inFlight = new Map<string, Promise<ProjectJob | QualityReport | ExportJob>>();
  constructor(private readonly repository: ProjectRepository, private readonly cache = new ProjectRecoveryCache()) {}

  async load(projectId: string, signal?: AbortSignal): Promise<ProjectWorkbench> {
    try {
      const remote = staleJobs(await this.repository.getWorkbench(projectId, signal));
      this.cache.write(remote);
      return remote;
    } catch (error) {
      const cached = this.cache.read(projectId);
      if (cached) return staleJobs(cached);
      throw error;
    }
  }

  async requestQualityCheck(workbench: ProjectWorkbench): Promise<ProjectJob | QualityReport> {
    if (!workbench.presentationId) throw new Error("A presentation must exist before quality can be checked");
    const key = newIdempotencyKey(workbench.project.id, "quality-check", workbench.project.revision);
    return this.dedupe(key, () => this.repository.startQualityCheck(workbench.project.id, workbench.presentationId!, workbench.project.revision, key)) as Promise<ProjectJob | QualityReport>;
  }

  async requestExport(workbench: ProjectWorkbench, format: ExportFormat): Promise<ExportJob> {
    const presentationId = workbench.presentationId;
    if (!presentationId) throw new Error("A presentation must exist before it can be exported");
    const key = newIdempotencyKey(workbench.project.id, `export:${format}`, workbench.project.revision);
    return this.dedupe(key, () => this.repository.startExport({
      projectId: workbench.project.id,
      presentationId,
      revision: workbench.project.revision,
      format,
      idempotencyKey: key,
    })) as Promise<ExportJob>;
  }

  async retry(job: ProjectJob): Promise<ProjectJob> {
    return this.repository.retryJob(job.id, newIdempotencyKey(job.projectId, `retry:${job.type}`, job.revision));
  }

  async refreshJob(job: ProjectJob): Promise<ProjectJob> {
    const current = await this.repository.getJob(job.id);
    if (current.projectId !== job.projectId || current.revision !== job.revision) return { ...current, status: "stale" };
    return current;
  }

  private dedupe<T extends ProjectJob | QualityReport | ExportJob>(key: string, action: () => Promise<T>): Promise<T> {
    const current = this.inFlight.get(key);
    if (current) return current as Promise<T>;
    const request = action().finally(() => this.inFlight.delete(key));
    this.inFlight.set(key, request);
    return request;
  }
}
