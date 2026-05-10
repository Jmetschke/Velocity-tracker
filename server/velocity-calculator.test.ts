import { describe, expect, it, vi } from "vitest";
import { calculateQuickBooksVelocity } from "./velocity-calculator";
import type { QBParseResult } from "./quickbooks-parser";

vi.mock("./db", () => ({
  updateSkuVelocity: vi.fn(),
}));

describe("calculateQuickBooksVelocity", () => {
  it("uses the most recent 6 full QuickBooks months and excludes partial months", async () => {
    const result: QBParseResult = {
      items: [{
        qbName: "OG alpha - 2pk",
        skuName: "Alpha Chunk - 2pk",
        monthlyData: [
          { month: "Jan 2026", quantity: 310, amount: 0, avgPrice: 0, cogs: 0, grossMargin: 0 },
          { month: "Feb 2026", quantity: 280, amount: 0, avgPrice: 0, cogs: 0, grossMargin: 0 },
          { month: "Mar 2026", quantity: 310, amount: 0, avgPrice: 0, cogs: 0, grossMargin: 0 },
          { month: "Apr 2026", quantity: 300, amount: 0, avgPrice: 0, cogs: 0, grossMargin: 0 },
          { month: "May 2026", quantity: 310, amount: 0, avgPrice: 0, cogs: 0, grossMargin: 0 },
          { month: "Jun 2026", quantity: 300, amount: 0, avgPrice: 0, cogs: 0, grossMargin: 0 },
          { month: "Jul 1-10 2026", quantity: 999, amount: 0, avgPrice: 0, cogs: 0, grossMargin: 0 },
        ],
        totalQuantity: 2809,
        totalAmount: 0,
      }],
      unmatchedRows: [],
      excludedRows: [],
      months: ["Jan 2026", "Feb 2026", "Mar 2026", "Apr 2026", "May 2026", "Jun 2026", "Jul 1-10 2026"],
      partialMonths: ["Jul 1-10 2026"],
      totalRows: 7,
      csvForAI: "",
    };

    const analysis = await calculateQuickBooksVelocity(result, [{ id: 1, name: "Alpha Chunk - 2pk" }]);

    expect(analysis.velocities[0]).toMatchObject({
      skuName: "Alpha Chunk - 2pk",
      monthsAnalyzed: 6,
      totalUnits: 1810,
      dailyVelocity: 10,
    });
    expect(analysis.summary).toContain("most recent 6 full month");
    expect(analysis.summary).toContain("Jan 2026");
    expect(analysis.summary).not.toContain("Jul 1-10 2026");
  });
});
