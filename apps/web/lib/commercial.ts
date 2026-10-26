export type PlanId = "free" | "pro";
export type BillingInterval = "monthly" | "yearly";
export type UpgradeReason = "insufficient_credits" | "project_limit" | "page_limit" | "advanced_model" | "advanced_template" | "unbranded_pptx" | "advanced_image" | "version_history" | "export_format";
export type CommercialEvent = "landing_view" | "create_click" | "generation_started" | "deck_generated" | "editor_opened" | "export_clicked" | "pricing_viewed" | "upgrade_modal_viewed" | "upgrade_clicked" | "checkout_started" | "checkout_completed" | "checkout_cancelled" | "credits_exhausted";

export type AccountSnapshot = {
  account: { userId: string; planId: PlanId; billingInterval?: BillingInterval; subscriptionStatus: "none" | "active"; creditBalance: number; creditGrant: number; periodStartedAt: string; periodEndsAt?: string };
  entitlements: { maxProjects: number; maxPagesPerPresentation: number; textModels: string[]; imageModels: string[]; advancedTemplates: boolean; unbrandedPptx: boolean; exportFormats: string[]; versionHistoryDays: number; freeBrandedPptxExports: number };
};
export type CreditEstimate = { cost: number; balance: number; sufficient: boolean; allowed: boolean; blockingReason?: "insufficient_credits" | "page_limit" | "feature_not_entitled"; requiredPlan?: PlanId };
export type ResumeAction = { type: "export" | "generate" | "feature"; projectId?: string; presentationId?: string; payload?: Record<string, unknown> };

export const PLANS = {
  free: { name: "Free", monthly: 0, yearly: 0, credits: 300, maxPages: 10, features: ["300 AI 点", "单份最多 10 页", "标准文本与图片", "首次带 AIPPT 标识的 PPTX"] },
  pro: { name: "Pro", monthly: 29, yearly: 268, credits: 3000, maxPages: 30, features: ["每月 3,000 AI 点", "单份最多 30 页", "高级模型与全部模板", "无品牌 PPTX、PDF / PNG 导出", "90 天版本历史"] },
} as const;

const apiOrigin = process.env.NEXT_PUBLIC_API_ORIGIN ?? "/backend-api";
const resumeKey = "aippt-commercial-resume";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiOrigin}${path}`, { ...init, headers: { "content-type": "application/json", ...init?.headers }, cache: "no-store" });
  if (!response.ok) {
    const error = new Error(await response.text() || `商业服务暂不可用 (${response.status})`) as Error & { status?: number };
    error.status = response.status;
    throw error;
  }
  return response.json() as Promise<T>;
}

export function getAccount() { return request<AccountSnapshot>("/api/account"); }
export function getUsage() { return request<AccountSnapshot & { usage: { balance: number; granted: number; spent: number; refunded: number; reserved: number }; ledger: Array<{ id: string; type: string; amount: number; balanceAfter: number; projectId?: string; jobId?: string; action: string; createdAt: string }> }>("/api/account/usage"); }
export function estimateCredits(input: { action: "generate"; pageCount: number; textModel?: "standard" | "advanced"; imageModel?: "standard" | "advanced"; projectId?: string }) { return request<{ estimate: CreditEstimate }>("/api/credits/estimate", { method: "POST", body: JSON.stringify(input) }); }
type CheckoutPayload = { checkout: { id: string; status: string; provider: "mock" | string; mode: "development" | "production"; completeUrl: string; cancelUrl: string; returnTo: string; resumeAction?: ResumeAction } };
function checkoutBody(input: { interval: BillingInterval; returnTo: string; resumeAction?: ResumeAction }) { return JSON.stringify({ planId: "pro", plan: "pro", ...input }); }
function normalizeCheckout(raw: CheckoutPayload | Record<string, unknown>, input: { interval: BillingInterval; returnTo: string; resumeAction?: ResumeAction }): CheckoutPayload {
  if ("checkout" in raw && raw.checkout) return raw as CheckoutPayload;
  const legacy = raw as Record<string, unknown>;
  return { checkout: { id: typeof legacy.id === "string" ? legacy.id : "legacy-mock", status: "pending", provider: typeof legacy.provider === "string" ? legacy.provider : "mock", mode: legacy.mode === "production" ? "production" : "development", completeUrl: typeof legacy.completeUrl === "string" ? legacy.completeUrl : "", cancelUrl: typeof legacy.cancelUrl === "string" ? legacy.cancelUrl : "", returnTo: input.returnTo, resumeAction: input.resumeAction } };
}
export async function startCheckout(input: { interval: BillingInterval; returnTo: string; resumeAction?: ResumeAction }): Promise<CheckoutPayload> {
  return normalizeCheckout(await request<CheckoutPayload | Record<string, unknown>>("/api/checkout/start", { method: "POST", body: checkoutBody(input) }), input);
}
export function completeCheckout(checkoutId: string) { return request<{ checkout: { id: string; status: string }; account: AccountSnapshot["account"]; entitlements: AccountSnapshot["entitlements"]; redirectTo: string }>("/api/checkout/complete", { method: "POST", body: JSON.stringify({ checkoutId }) }); }
export function track(event: CommercialEvent, detail?: { projectId?: string; presentationId?: string; metadata?: Record<string, unknown>; idempotencyKey?: string }) {
  return request("/api/analytics/events", { method: "POST", body: JSON.stringify({ event, ...detail, idempotencyKey: detail?.idempotencyKey ?? `${event}:${Date.now()}:${Math.random().toString(36).slice(2)}` }) }).catch(() => undefined);
}
export function saveResumeAction(action: ResumeAction) { if (typeof window !== "undefined") sessionStorage.setItem(resumeKey, JSON.stringify(action)); }
export function peekResumeAction(): ResumeAction | undefined { if (typeof window === "undefined") return undefined; const raw = sessionStorage.getItem(resumeKey); try { return raw ? JSON.parse(raw) as ResumeAction : undefined; } catch { return undefined; } }
export function takeResumeAction(): ResumeAction | undefined { const action = peekResumeAction(); if (typeof window !== "undefined") sessionStorage.removeItem(resumeKey); return action; }
export function reasonFromEstimate(estimate: CreditEstimate): UpgradeReason { return estimate.blockingReason === "page_limit" ? "page_limit" : estimate.blockingReason === "feature_not_entitled" ? "advanced_model" : "insufficient_credits"; }
