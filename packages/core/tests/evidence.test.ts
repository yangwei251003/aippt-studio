import { describe, expect, it } from "vitest";
import { sourceNotes, validateEvidenceLedger } from "../src/index.js";

describe("evidence ledger", () => {
  it("emits traceable speaker notes without turning assumptions into facts", () => {
    const records = validateEvidenceLedger([{ id: "e1", claim: "planning context", title: "Official plan", url: "https://example.com/plan", locator: "section 2", accessedAt: "2026-08-23T00:00:00.000Z", license: "citation", status: "verified" }]);
    expect(sourceNotes(records, "[Simulation] Values are illustrative.")).toContain("[Sources]");
    expect(sourceNotes(records)).toContain("https://example.com/plan");
  });

  it("rejects duplicate evidence ids", () => {
    const item = { id: "e1", claim: "claim", title: "Source", url: "https://example.com", accessedAt: "2026-08-23T00:00:00.000Z" };
    expect(() => validateEvidenceLedger([item, item])).toThrow(/Duplicate evidence/);
  });
});
