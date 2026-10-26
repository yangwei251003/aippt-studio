"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { getAccount, type AccountSnapshot } from "../../lib/commercial";

type CommercialContextValue = { snapshot?: AccountSnapshot; loading: boolean; refresh: () => Promise<void> };
const CommercialContext = createContext<CommercialContextValue>({ loading: true, refresh: async () => undefined });

export function CommercialProvider({ children }: { children: React.ReactNode }) {
  const [snapshot, setSnapshot] = useState<AccountSnapshot>(); const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => { const demoPro = process.env.NODE_ENV !== "production" && typeof window !== "undefined" && sessionStorage.getItem("aippt-commercial-demo-pro") === "1"; if (demoPro) { setSnapshot({ account: { userId: "local-demo-user", planId: "pro", billingInterval: "monthly", subscriptionStatus: "active", creditBalance: 3000, creditGrant: 3000, periodStartedAt: new Date().toISOString() }, entitlements: { maxProjects: 30, maxPagesPerPresentation: 30, textModels: ["standard", "advanced"], imageModels: ["standard", "advanced"], advancedTemplates: true, unbrandedPptx: true, exportFormats: ["pptx", "pdf", "png", "html", "html-zip"], versionHistoryDays: 90, freeBrandedPptxExports: 0 } }); setLoading(false); return; } try { const remote = await getAccount(); setSnapshot(remote); } catch { /* A disconnected account remains conservatively Free in the UI. */ } finally { setLoading(false); } }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  const value = useMemo(() => ({ snapshot, loading, refresh }), [snapshot, loading, refresh]);
  return <CommercialContext.Provider value={value}>{children}</CommercialContext.Provider>;
}
export function useCommercial() { return useContext(CommercialContext); }
