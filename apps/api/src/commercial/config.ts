import type { CommercialPlan, PlanId } from "./types.js";

export const COMMERCIAL_PLANS = {
  free: {
    id: "free",
    name: "Free",
    priceMonthlyCny: 0,
    priceYearlyCny: 0,
    creditGrant: 300,
    entitlements: {
      maxProjects: 3,
      maxPagesPerPresentation: 10,
      textModels: ["standard"],
      imageModels: ["standard"],
      advancedTemplates: false,
      unbrandedPptx: false,
      exportFormats: ["pptx", "html", "html-zip"],
      developmentOnlyFormats: ["html", "html-zip"],
      versionHistoryDays: 7,
      freeBrandedPptxExports: 1,
    },
  },
  pro: {
    id: "pro",
    name: "Pro",
    priceMonthlyCny: 29,
    priceYearlyCny: 268,
    creditGrant: 3000,
    entitlements: {
      maxProjects: 30,
      maxPagesPerPresentation: 30,
      textModels: ["standard", "advanced"],
      imageModels: ["standard", "advanced"],
      advancedTemplates: true,
      unbrandedPptx: true,
      exportFormats: ["pptx", "pdf", "png", "html", "html-zip"],
      developmentOnlyFormats: ["html", "html-zip"],
      versionHistoryDays: 90,
      freeBrandedPptxExports: 0,
    },
  },
} as const satisfies Record<PlanId, CommercialPlan>;

export const CREDIT_COSTS = {
  standardTextPerPage: 5,
  advancedTextPerPage: 9,
  standardImagePerPage: 0,
  advancedImagePerPage: 6,
} as const;
