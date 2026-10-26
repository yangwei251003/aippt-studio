import { boolean, integer, jsonb, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

export const projects = pgTable("projects", {
  id: text("id").primaryKey(),
  ownerUserId: text("owner_user_id").notNull().default("local-demo-user"),
  name: text("name").notNull(),
  topic: text("topic").notNull(),
  brief: jsonb("brief"),
  blueprint: jsonb("blueprint"),
  derivedDataStale: boolean("derived_data_stale").notNull().default(false),
  sourceRevision: integer("source_revision").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull(),
});

export const presentations = pgTable("presentations", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull(),
  title: text("title").notNull(),
  revision: integer("revision").notNull(),
  document: jsonb("document").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull(),
});

export const commandHistory = pgTable("command_history", {
  id: text("id").primaryKey(),
  sequence: serial("sequence").notNull(),
  presentationId: text("presentation_id").notNull(),
  inverses: jsonb("inverses").notNull(),
  undone: boolean("undone").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull(),
});

export const uploads = pgTable("uploads", {
  id: text("id").primaryKey(),
  projectId: text("project_id"),
  ownerUserId: text("owner_user_id").notNull().default("local-demo-user"),
  filename: text("filename").notNull(),
  mime: text("mime").notNull(),
  size: integer("size").notNull(),
  fileHash: text("file_hash").notNull().default(""),
  parsed: jsonb("parsed").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull(),
});

export const jobs = pgTable("jobs", {
  id: text("id").primaryKey(),
  projectId: text("project_id"),
  presentationId: text("presentation_id"),
  revision: integer("revision"),
  type: text("type").notNull(),
  status: text("status").notNull(),
  progress: integer("progress"),
  attempts: integer("attempts").notNull().default(0),
  maxAttempts: integer("max_attempts").notNull().default(3),
  idempotencyKey: text("idempotency_key"),
  payload: jsonb("payload").notNull(),
  result: jsonb("result"),
  error: text("error"),
  startedAt: timestamp("started_at", { withTimezone: true, mode: "string" }),
  completedAt: timestamp("completed_at", { withTimezone: true, mode: "string" }),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull(),
});

export const exportsTable = pgTable("exports", {
  id: text("id").primaryKey(),
  projectId: text("project_id"),
  presentationId: text("presentation_id").notNull(),
  revision: integer("revision"),
  format: text("format").notNull(),
  status: text("status").notNull(),
  jobId: text("job_id").notNull(),
  userId: text("user_id").notNull().default("local-demo-user"),
  branding: text("branding").notNull().default("none"),
  objectKey: text("object_key"),
  downloadUrl: text("download_url"),
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull(),
});

export const commercialAccounts = pgTable("commercial_accounts", {
  userId: text("user_id").primaryKey(),
  planId: text("plan_id").notNull(),
  creditBalance: integer("credit_balance").notNull(),
  creditGrant: integer("credit_grant").notNull(),
  periodStartedAt: timestamp("period_started_at", { withTimezone: true, mode: "string" }).notNull(),
  periodEndsAt: timestamp("period_ends_at", { withTimezone: true, mode: "string" }),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull(),
});

export const subscriptions = pgTable("subscriptions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  planId: text("plan_id").notNull(),
  interval: text("interval").notNull(),
  status: text("status").notNull(),
  provider: text("provider").notNull(),
  currentPeriodStartedAt: timestamp("current_period_started_at", { withTimezone: true, mode: "string" }).notNull(),
  currentPeriodEndsAt: timestamp("current_period_ends_at", { withTimezone: true, mode: "string" }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull(),
}, (table) => [uniqueIndex("subscriptions_user_idx").on(table.userId)]);

export const creditReservations = pgTable("credit_reservations", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  action: text("action").notNull(),
  amount: integer("amount").notNull(),
  status: text("status").notNull(),
  projectId: text("project_id").notNull(),
  jobId: text("job_id").notNull(),
  idempotencyKey: text("idempotency_key").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull(),
}, (table) => [uniqueIndex("credit_reservations_user_idempotency_idx").on(table.userId, table.idempotencyKey)]);

export const creditLedger = pgTable("credit_ledger", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  reservationId: text("reservation_id"),
  type: text("type").notNull(),
  amount: integer("amount").notNull(),
  balanceAfter: integer("balance_after").notNull(),
  action: text("action").notNull(),
  projectId: text("project_id"),
  jobId: text("job_id"),
  idempotencyKey: text("idempotency_key").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull(),
}, (table) => [uniqueIndex("credit_ledger_user_idempotency_idx").on(table.userId, table.idempotencyKey)]);

export const billingCheckouts = pgTable("billing_checkouts", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  planId: text("plan_id").notNull(),
  interval: text("interval").notNull(),
  status: text("status").notNull(),
  provider: text("provider").notNull(),
  mode: text("mode").notNull(),
  returnTo: text("return_to").notNull(),
  resumeAction: jsonb("resume_action"),
  providerCheckoutId: text("provider_checkout_id"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true, mode: "string" }),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull(),
});

export const analyticsEvents = pgTable("analytics_events", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  event: text("event").notNull(),
  projectId: text("project_id"),
  presentationId: text("presentation_id"),
  metadata: jsonb("metadata").notNull(),
  idempotencyKey: text("idempotency_key"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull(),
}, (table) => [uniqueIndex("analytics_user_idempotency_idx").on(table.userId, table.idempotencyKey)]);

export const qualityReports = pgTable("quality_reports", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull(),
  presentationId: text("presentation_id").notNull(),
  revision: integer("revision").notNull(),
  status: text("status").notNull(),
  jobId: text("job_id").notNull(),
  report: jsonb("report").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull(),
});

export const workflowRuns = pgTable("workflow_runs", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull(),
  ownerUserId: text("owner_user_id").notNull(),
  presentationId: text("presentation_id"),
  source: text("source").notNull(),
  status: text("status").notNull(),
  currentStep: text("current_step"),
  stepIndex: integer("step_index").notNull().default(0),
  artifacts: jsonb("artifacts").notNull().default({}),
  usage: jsonb("usage").notNull().default({ inputTokens: 0, outputTokens: 0, costUsd: 0 }),
  workflowVersion: text("workflow_version").notNull().default("1.0.0"),
  qualityProfile: text("quality_profile").notNull().default("standard"),
  sourceRevision: integer("source_revision").notNull().default(0),
  inputHash: text("input_hash"),
  modelAssignments: jsonb("model_assignments").notNull().default({}),
  bestArtifactId: text("best_artifact_id"),
  generationInput: jsonb("generation_input"),
  idempotencyKey: text("idempotency_key"),
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true, mode: "string" }),
}, (table) => [uniqueIndex("workflow_runs_project_idempotency_idx").on(table.projectId, table.idempotencyKey)]);

export const agentEvents = pgTable("agent_events", {
  id: text("id").primaryKey(),
  sequence: serial("sequence").notNull(),
  runId: text("run_id").notNull(),
  projectId: text("project_id").notNull(),
  type: text("type").notNull(),
  step: text("step"),
  agentId: text("agent_id"),
  modelId: text("model_id"),
  payload: jsonb("payload").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull(),
});
