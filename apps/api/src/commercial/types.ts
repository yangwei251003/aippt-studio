export type PlanId = "free" | "pro";
export type BillingInterval = "monthly" | "yearly";
export type ModelTier = "standard" | "advanced";
export type CommercialFeature =
  | "advanced_text_model"
  | "advanced_image_model"
  | "advanced_template"
  | "unbranded_pptx"
  | "pdf_export"
  | "png_export"
  | "extended_history"
  | "html_export";

export interface PlanEntitlements {
  maxProjects: number;
  maxPagesPerPresentation: number;
  textModels: ModelTier[];
  imageModels: ModelTier[];
  advancedTemplates: boolean;
  unbrandedPptx: boolean;
  exportFormats: Array<"pptx" | "pdf" | "png" | "html" | "html-zip">;
  developmentOnlyFormats: Array<"html" | "html-zip">;
  versionHistoryDays: number;
  freeBrandedPptxExports: number;
}

export interface CommercialPlan {
  id: PlanId;
  name: string;
  priceMonthlyCny: number;
  priceYearlyCny: number;
  creditGrant: number;
  entitlements: PlanEntitlements;
}

export interface AccountRecord {
  userId: string;
  planId: PlanId;
  creditBalance: number;
  creditGrant: number;
  periodStartedAt: string;
  periodEndsAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SubscriptionRecord {
  id: string;
  userId: string;
  planId: PlanId;
  interval: BillingInterval;
  status: "active" | "cancelled";
  provider: string;
  currentPeriodStartedAt: string;
  currentPeriodEndsAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreditReservationRecord {
  id: string;
  userId: string;
  action: "generate";
  amount: number;
  status: "reserved" | "settled" | "refunded";
  projectId: string;
  jobId: string;
  idempotencyKey: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreditLedgerRecord {
  id: string;
  userId: string;
  reservationId?: string;
  type: "grant" | "reserve" | "settle" | "refund";
  amount: number;
  balanceAfter: number;
  action: string;
  projectId?: string;
  jobId?: string;
  idempotencyKey: string;
  createdAt: string;
}

export interface ResumeAction {
  type: string;
  projectId?: string | undefined;
  presentationId?: string | undefined;
  payload?: Record<string, unknown> | undefined;
}

export interface CheckoutRecord {
  id: string;
  userId: string;
  planId: "pro";
  interval: BillingInterval;
  status: "pending" | "completed" | "cancelled";
  provider: string;
  mode: "development" | "production";
  returnTo: string;
  resumeAction?: ResumeAction;
  providerCheckoutId?: string;
  createdAt: string;
  completedAt?: string;
  updatedAt: string;
}

export type AnalyticsEventName =
  | "landing_view"
  | "create_click"
  | "generation_started"
  | "deck_generated"
  | "editor_opened"
  | "export_clicked"
  | "pricing_viewed"
  | "upgrade_modal_viewed"
  | "upgrade_clicked"
  | "checkout_started"
  | "checkout_completed"
  | "checkout_cancelled"
  | "credits_exhausted";

export interface AnalyticsEventRecord {
  id: string;
  userId: string;
  event: AnalyticsEventName;
  projectId?: string;
  presentationId?: string;
  metadata: Record<string, unknown>;
  idempotencyKey?: string;
  createdAt: string;
}

export interface CommercialStore {
  ensureAccount(userId: string): Promise<AccountRecord>;
  getSubscription(userId: string): Promise<SubscriptionRecord | undefined>;
  countProjectsForUser(userId: string): Promise<number>;
  countBrandedPptxExportsForUser(userId: string): Promise<number>;
  listCreditLedger(userId: string, limit?: number): Promise<CreditLedgerRecord[]>;
  getCreditReservation(id: string): Promise<CreditReservationRecord | undefined>;
  reserveCredit(input: Omit<CreditReservationRecord, "status" | "createdAt" | "updatedAt">): Promise<CreditReservationRecord | undefined>;
  settleCredit(id: string): Promise<CreditReservationRecord | undefined>;
  refundCredit(id: string): Promise<CreditReservationRecord | undefined>;
  createCheckout(record: CheckoutRecord): Promise<CheckoutRecord>;
  getCheckout(id: string): Promise<CheckoutRecord | undefined>;
  completeCheckout(id: string, providerCheckoutId?: string): Promise<{ checkout: CheckoutRecord; account: AccountRecord; subscription: SubscriptionRecord } | undefined>;
  recordAnalyticsEvent(record: AnalyticsEventRecord): Promise<AnalyticsEventRecord>;
  listAnalyticsEvents(userId: string): Promise<AnalyticsEventRecord[]>;
}
