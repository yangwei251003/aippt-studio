import {
  GENERATION_WORKFLOW_VERSION,
  WORKFLOW_STEPS_V2,
  generationRunInputSchema,
  qualityProfileSchema,
  workflowArtifactSchema,
  type GenerationRunInput,
  type QualityProfile,
  type WorkflowArtifact,
} from "@aippt/core";
import { z } from "zod";

export const WORKFLOW_STEPS = WORKFLOW_STEPS_V2;
export type WorkflowStep = typeof WORKFLOW_STEPS[number];
export type WorkflowRunStatus = "running" | "executing" | "completed" | "failed" | "cancelled";
export type ModelCapability = "reasoning" | "fast" | "vision" | "image";

export interface AgentDefinition {
  id: string;
  role: string;
  step: WorkflowStep;
  capability: ModelCapability;
  promptVersion: string;
  inputSchema: string;
  outputSchema: string;
  allowedTools: string[];
  stopCondition: string;
}

export interface ModelAssignment {
  agentId: string;
  capability: ModelCapability;
  modelId: string;
  fallback: boolean;
  reason: "configured" | "policy" | "primary-default" | "availability-fallback" | "runtime-fallback";
  promptVersion?: string;
}

export const workflowUsageSchema = z.object({
  inputTokens: z.number().int().nonnegative().default(0),
  outputTokens: z.number().int().nonnegative().default(0),
  costUsd: z.number().nonnegative().default(0),
});
export type WorkflowUsage = z.infer<typeof workflowUsageSchema>;

export const legacyWorkflowStepArtifactSchema = z.object({
  schemaVersion: z.literal("1.0.0"),
  step: z.enum(WORKFLOW_STEPS),
  summary: z.string().min(1).max(500),
  data: z.record(z.string(), z.unknown()).default({}),
});
export const workflowStepArtifactSchema = z.union([legacyWorkflowStepArtifactSchema, workflowArtifactSchema]);
export type LegacyWorkflowStepArtifact = z.infer<typeof legacyWorkflowStepArtifactSchema>;
export type WorkflowStepArtifact = LegacyWorkflowStepArtifact | WorkflowArtifact;
export type WorkflowArtifacts = Partial<Record<WorkflowStep, WorkflowStepArtifact>>;

export interface WorkflowRunRecord {
  id: string;
  projectId: string;
  ownerUserId: string;
  presentationId?: string;
  source: "api" | "generation" | "manual-codex-test";
  status: WorkflowRunStatus;
  currentStep?: WorkflowStep;
  stepIndex: number;
  artifacts: WorkflowArtifacts;
  usage: WorkflowUsage;
  workflowVersion: "1.0.0" | typeof GENERATION_WORKFLOW_VERSION;
  qualityProfile: QualityProfile;
  sourceRevision: number;
  inputHash?: string;
  modelAssignments: Partial<Record<WorkflowStep, ModelAssignment>>;
  bestArtifactId?: string;
  generationInput?: GenerationRunInput;
  idempotencyKey?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export const persistedWorkflowMetadataSchema = z.object({
  workflowVersion: z.enum(["1.0.0", GENERATION_WORKFLOW_VERSION]).default("1.0.0"),
  qualityProfile: qualityProfileSchema.default("standard"),
  sourceRevision: z.number().int().nonnegative().default(0),
  inputHash: z.string().optional(),
  modelAssignments: z.record(z.string(), z.unknown()).default({}),
  bestArtifactId: z.string().optional(),
  generationInput: generationRunInputSchema.optional(),
});

export type AgentEventType =
  | "run.started" | "agent.assigned" | "step.started" | "step.completed" | "step.failed"
  | "gate.passed" | "gate.failed" | "fallback.used" | "repair.started" | "repair.completed"
  | "run.completed" | "run.failed" | "run.cancelled" | "run.retried";

export interface AgentEventRecord {
  id: string;
  runId: string;
  projectId: string;
  sequence: number;
  type: AgentEventType;
  step?: WorkflowStep;
  agentId?: string;
  modelId?: string;
  payload: Record<string, unknown>;
  createdAt: string;
}
