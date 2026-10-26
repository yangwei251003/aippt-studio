import { z } from "zod";

export const evidenceRecordSchema = z.object({
  id: z.string().min(1),
  claim: z.string().min(1),
  title: z.string().min(1),
  sourceId: z.string().min(1).optional(),
  url: z.string().url().optional(),
  locator: z.string().default("web page"),
  accessedAt: z.string().datetime(),
  license: z.string().default("linked citation; reuse not asserted"),
  status: z.enum(["verified", "manual-review", "assumption", "simulation"]).default("manual-review"),
});

export type EvidenceRecord = z.infer<typeof evidenceRecordSchema>;

export function sourceNotes(records: EvidenceRecord[], disclosure?: string): string {
  const verified = records.map((record) => `- ${record.title} | ${record.url ?? record.sourceId ?? "local-source"} | ${record.locator} | ${record.status}`).join("\n");
  return [disclosure, "[Sources]", verified || "- No external factual claim on this slide."].filter(Boolean).join("\n\n");
}

export function validateEvidenceLedger(records: EvidenceRecord[]): EvidenceRecord[] {
  const parsed = z.array(evidenceRecordSchema).parse(records);
  const ids = new Set<string>();
  for (const record of parsed) {
    if (ids.has(record.id)) throw new Error(`Duplicate evidence record ${record.id}`);
    ids.add(record.id);
  }
  return parsed;
}
