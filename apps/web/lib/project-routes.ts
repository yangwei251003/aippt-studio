import type { ProjectStage } from "./project-types";

const stages = new Set<ProjectStage>(["brief", "outline", "generate", "edit", "review", "export"]);

export function resolveProjectStage(value: string | undefined): ProjectStage {
  return value && stages.has(value as ProjectStage) ? value as ProjectStage : "brief";
}

export function projectHref(projectId: string, stage: ProjectStage = "brief"): string {
  return `/projects/${encodeURIComponent(projectId)}/${stage}`;
}
