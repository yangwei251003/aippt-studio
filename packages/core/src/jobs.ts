import { z } from "zod";

export const projectJobStatusSchema = z.enum(["idle", "queued", "running", "success", "failed", "cancelled", "stale"]);
export const projectJobTypeSchema = z.enum(["generate", "quality-check", "export"]);

export type ProjectJobStatus = z.infer<typeof projectJobStatusSchema>;
export type ProjectJobType = z.infer<typeof projectJobTypeSchema>;

export interface ProjectJob {
  id: string;
  projectId: string;
  presentationId?: string;
  revision: number;
  type: ProjectJobType;
  status: ProjectJobStatus;
  progress?: number;
  attempts: number;
  maxAttempts: number;
  idempotencyKey?: string;
  startedAt?: string;
  completedAt?: string;
  error?: string;
}

/** Maps persisted V3.2 job rows onto the canonical P0 state machine. */
export function normalizeProjectJobStatus(status: ProjectJobStatus | "completed"): ProjectJobStatus {
  return status === "completed" ? "success" : status;
}
