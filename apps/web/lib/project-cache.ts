import type { ProjectWorkbench } from "./project-types";

const CACHE_PREFIX = "aippt.project-workbench.v1.";

function key(projectId: string): string {
  return `${CACHE_PREFIX}${encodeURIComponent(projectId)}`;
}

/** Recovery cache only. It is never treated as the system of record. */
export class ProjectRecoveryCache {
  read(projectId: string): ProjectWorkbench | undefined {
    if (typeof window === "undefined") return undefined;
    try {
      const value = window.localStorage.getItem(key(projectId));
      if (!value) return undefined;
      const cached = JSON.parse(value) as ProjectWorkbench;
      return cached.project.id === projectId
        ? { ...cached, source: "recovery-cache" }
        : undefined;
    } catch {
      return undefined;
    }
  }

  write(workbench: ProjectWorkbench): void {
    if (typeof window === "undefined" || workbench.source !== "api") return;
    try {
      window.localStorage.setItem(key(workbench.project.id), JSON.stringify(workbench));
    } catch {
      // Browser storage may be disabled or full. Remote data remains authoritative.
    }
  }
}
