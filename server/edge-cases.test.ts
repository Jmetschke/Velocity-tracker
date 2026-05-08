/**
 * Edge case and additional coverage tests for scheduling, parsers, and business logic.
 */
import { describe, expect, it } from "vitest";
import {
  addBusinessDays,
  nextBusinessDay,
  calculateParLevel,
  generateScheduleSuggestions,
  getISOWeek,
  getWeekStartDate,
  getWeekEndDate,
  type SkuScheduleInput,
} from "./scheduling";
import { parseInventoryReport, parseSalesReport, findBestSkuMatch } from "./parsers";
import { buildExcelBuffer } from "./test-helpers";

// ─── Scheduling Edge Cases ──────────────────────────────────────────────

describe("addBusinessDays edge cases", () => {
  it("handles starting on Saturday", () => {
    const saturday = new Date(2026, 2, 14);
    const result = addBusinessDays(saturday, 1);
    expect(result.getDay()).toBe(1);
    expect(result.getDate()).toBe(16);
  });

  it("handles starting on Sunday", () => {
    const sunday = new Date(2026, 2, 15);
    const result = addBusinessDays(sunday, 1);
    expect(result.getDay()).toBe(1);
    expect(result.getDate()).toBe(16);
  });

  it("handles large number of business days (10)", () => {
    const monday = new Date(2026, 2, 9);
    const result = addBusinessDays(monday, 10);
    expect(result.getDate()).toBe(23);
    expect(result.getDay()).toBe(1);
  });

  it("handles crossing month boundary", () => {
    const friday = new Date(2026, 2, 27);
    const result = addBusinessDays(friday, 5);
    expect(result.getMonth()).toBe(3); // April
    expect(result.getDate()).toBe(3);
  });
});

describe("getISOWeek edge cases", () => {
  it("handles ISO week 53 (years that have it)", () => {
    const date = new Date(2020, 11, 31);
    const { week, year } = getISOWeek(date);
    expect(week).toBe(53);
    expect(year).toBe(2020);
  });

  it("handles Jan 1 that falls in previous year's last week", () => {
    const date = new Date(2021, 0, 1);
    const { week, year } = getISOWeek(date);
    expect(week).toBe(53);
    expect(year).toBe(2020);
  });

  it("handles mid-year date", () => {
    const date = new Date(2026, 5, 15);
    const { week, year } = getISOWeek(date);
    expect(week).toBe(25);
    expect(year).toBe(2026);
  });

  it("handles week 1 of a year where Jan 1 is Thursday", () => {
    const date = new Date(2026, 0, 1);
    const { week, year } = getISOWeek(date);
    expect(week).toBe(1);
    expect(year).toBe(2026);
  });
});

describe("getWeekStartDate / getWeekEndDate edge cases", () => {
  it("returns correct dates for week 1", () => {
    const monday = getWeekStartDate(1, 2026);
    expect(monday.getDay()).toBe(1);
    expect(monday.getMonth()).toBe(11); // December
    expect(monday.getDate()).toBe(29);
    expect(monday.getFullYear()).toBe(2025);
  });

  it("returns correct dates for week 52", () => {
    const monday = getWeekStartDate(52, 2026);
    expect(monday.getDay()).toBe(1);
    const friday = getWeekEndDate(52, 2026);
    expect(friday.getDay()).toBe(5);
    expect(monday.getMonth()).toBe(11);
    expect(monday.getDate()).toBe(21);
  });

  it("week start is always Monday and end is always Friday", () => {
    for (let w = 1; w <= 52; w++) {
      const start = getWeekStartDate(w, 2026);
      const end = getWeekEndDate(w, 2026);
      expect(start.getDay()).toBe(1);
      expect(end.getDay()).toBe(5);
      const diff = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
      expect(diff).toBe(4);
    }
  });
});

// ─── Net Batch Size Calculation (5% loss factor) ────────────────────────

describe("Net batch size calculation (5% loss factor)", () => {
  function calculateNetBatchSize(theoretical: number, lossPercent: number): number {
    return Math.floor(theoretical * (1 - lossPercent / 100));
  }

  it("Chunks: 7500 theoretical → 7125 net at 5% loss", () => {
    expect(calculateNetBatchSize(7500, 5)).toBe(7125);
  });

  it("Mini's: 6250 theoretical → 5937 net at 5% loss", () => {
    expect(calculateNetBatchSize(6250, 5)).toBe(5937);
  });

  it("Vapes/Whoopie/Dots: 1000 theoretical → 950 net at 5% loss", () => {
    expect(calculateNetBatchSize(1000, 5)).toBe(950);
  });

  it("Shooters: 1500 theoretical → 1425 net at 5% loss", () => {
    expect(calculateNetBatchSize(1500, 5)).toBe(1425);
  });

  it("handles 0% loss (no loss)", () => {
    expect(calculateNetBatchSize(1000, 0)).toBe(1000);
  });

  it("handles 10% loss", () => {
    expect(calculateNetBatchSize(1000, 10)).toBe(900);
  });

  it("floors fractional results", () => {
    expect(calculateNetBatchSize(333, 5)).toBe(316);
  });
});

// ─── Days-to-Stockout via generateScheduleSuggestions ────────────────────

describe("Days-to-stockout in schedule suggestions", () => {
  const baseDate = new Date(2026, 2, 10);

  function makeInput(overrides: Partial<SkuScheduleInput> = {}): SkuScheduleInput {
    return {
      skuId: 1,
      skuName: "Test SKU",
      currentStock: 500,
      dailyVelocity: 50,
      parLevel: 700,
      netBatchSize: 7125,
      leadTimeDays: 5,
      ...overrides,
    };
  }

  it("calculates daysUntilStockout correctly", () => {
    const input = makeInput({ currentStock: 500, dailyVelocity: 50 });
    const results = generateScheduleSuggestions([input], baseDate);
    expect(results[0].daysUntilStockout).toBe(10);
  });

  it("includes zero-velocity SKUs with Infinity stockout days", () => {
    const input = makeInput({ dailyVelocity: 0 });
    const results = generateScheduleSuggestions([input], baseDate);
    expect(results).toHaveLength(1);
    expect(results[0].daysUntilStockout).toBe(Infinity);
    expect(results[0].urgency).toBe("ok");
    expect(results[0].batchesNeeded).toBe(0);
  });

  it("returns 0 days for zero stock", () => {
    const input = makeInput({ currentStock: 0, dailyVelocity: 50 });
    const results = generateScheduleSuggestions([input], baseDate);
    expect(results[0].daysUntilStockout).toBe(0);
    expect(results[0].urgency).toBe("critical");
  });

  it("handles very large stock (many days)", () => {
    const input = makeInput({ currentStock: 100000, dailyVelocity: 10, parLevel: 140 });
    const results = generateScheduleSuggestions([input], baseDate);
    expect(results[0].daysUntilStockout).toBe(10000);
    expect(results[0].urgency).toBe("ok");
  });

  it("handles fractional velocity", () => {
    const input = makeInput({ currentStock: 100, dailyVelocity: 3.5, parLevel: 49 });
    const results = generateScheduleSuggestions([input], baseDate);
    expect(results[0].daysUntilStockout).toBe(28);
  });
});

// ─── Multiple SKU Scheduling ────────────────────────────────────────────

describe("Multi-SKU scheduling scenarios", () => {
  const baseDate = new Date(2026, 2, 10);

  it("handles a realistic mix of 5 SKUs with varying urgency", () => {
    const inputs: SkuScheduleInput[] = [
      { skuId: 1, skuName: "Alpha Chunk - 2pk", currentStock: 5000, dailyVelocity: 100, parLevel: 1400, netBatchSize: 7125, leadTimeDays: 5 },
      { skuId: 2, skuName: "Sleep Chunk - 2pk", currentStock: 200, dailyVelocity: 50, parLevel: 700, netBatchSize: 7125, leadTimeDays: 5 },
      { skuId: 3, skuName: "Whoopie Hi", currentStock: 50, dailyVelocity: 20, parLevel: 280, netBatchSize: 950, leadTimeDays: 5 },
      { skuId: 4, skuName: "Grape Crush 1g Vape", currentStock: 800, dailyVelocity: 30, parLevel: 420, netBatchSize: 950, leadTimeDays: 5 },
      { skuId: 5, skuName: "MiNi's Chunks - 10pk", currentStock: 3000, dailyVelocity: 40, parLevel: 560, netBatchSize: 5938, leadTimeDays: 5 },
    ];

    const results = generateScheduleSuggestions(inputs, baseDate);
    expect(results).toHaveLength(5);

    const urgencies = results.map((r) => r.urgency);
    const criticalIdx = urgencies.indexOf("critical");
    const warningIdx = urgencies.indexOf("warning");
    const okIdx = urgencies.indexOf("ok");

    if (criticalIdx >= 0 && warningIdx >= 0) {
      expect(criticalIdx).toBeLessThan(warningIdx);
    }
    if (warningIdx >= 0 && okIdx >= 0) {
      expect(warningIdx).toBeLessThan(okIdx);
    }
  });

  it("correctly calculates batches needed for small batch sizes", () => {
    const input: SkuScheduleInput = {
      skuId: 1,
      skuName: "Whoopie Hi",
      currentStock: 0,
      dailyVelocity: 20,
      parLevel: 280,
      netBatchSize: 950,
      leadTimeDays: 5,
    };
    const results = generateScheduleSuggestions([input], baseDate);
    expect(results[0].batchesNeeded).toBe(1);
  });

  it("correctly calculates batches for deficit larger than batch size", () => {
    const input: SkuScheduleInput = {
      skuId: 1,
      skuName: "Alpha Chunk - 2pk",
      currentStock: 0,
      dailyVelocity: 200,
      parLevel: 2800,
      netBatchSize: 950,
      leadTimeDays: 5,
    };
    const results = generateScheduleSuggestions([input], baseDate);
    expect(results[0].batchesNeeded).toBe(3);
  });
});

// ─── Parser Edge Cases ──────────────────────────────────────────────────

describe("parseInventoryReport edge cases", () => {
  it("handles empty spreadsheet", async () => {
    const buffer = await buildExcelBuffer("Sheet1", [
      [null, "Qty in Inventory", "Qty on Hold for COA", "Total", "Trigger Point"],
    ]);
    const items = await parseInventoryReport(buffer);
    expect(items).toHaveLength(0);
  });

  it("handles rows with null quantities gracefully", async () => {
    const buffer = await buildExcelBuffer("Sheet1", [
      [null, "Qty in Inventory", "Qty on Hold for COA", "Total", "Trigger Point"],
      ["Micro Dots", null, null, null, null],
    ]);
    const items = await parseInventoryReport(buffer);
    // Row with null qty in col B is treated as a header/context row
    expect(items).toHaveLength(0);
  });

  it("handles rows with zero quantities", async () => {
    const buffer = await buildExcelBuffer("Sheet1", [
      [null, "Qty in Inventory", "Qty on Hold for COA", "Total", "Trigger Point"],
      ["Micro Dots", 0, 0, 0, 100],
    ]);
    const items = await parseInventoryReport(buffer);
    expect(items).toHaveLength(1);
    expect(items[0].qtyInInventory).toBe(0);
    expect(items[0].totalQty).toBe(0);
  });
});

describe("findBestSkuMatch edge cases", () => {
  const dbSkus = [
    { id: 1, name: "Alpha Chunk - 2pk" },
    { id: 2, name: "Alpha Chunk - 1pk" },
    { id: 3, name: "Snackbar Vape - Grape Crush 1g" },
    { id: 4, name: "MiNi's Chunks - 10pk" },
  ];

  it("handles empty string input gracefully (no crash)", () => {
    const result = findBestSkuMatch("", dbSkus);
    expect(result === null || typeof result?.id === "number").toBe(true);
  });

  it("handles whitespace-only input gracefully (no crash)", () => {
    const result = findBestSkuMatch("   ", dbSkus);
    expect(result === null || typeof result?.id === "number").toBe(true);
  });

  it("is case-insensitive", () => {
    expect(findBestSkuMatch("ALPHA CHUNK - 2PK", dbSkus)?.id).toBe(1);
    expect(findBestSkuMatch("alpha chunk - 2pk", dbSkus)?.id).toBe(1);
  });

  it("handles pack suffix normalization (2-pack → 2pk)", () => {
    expect(findBestSkuMatch("Alpha Chunk - 2-pack", dbSkus)?.id).toBe(1);
    expect(findBestSkuMatch("Alpha Chunk - 2 pack", dbSkus)?.id).toBe(1);
  });

  it("handles extra whitespace between words", () => {
    expect(findBestSkuMatch("Alpha  Chunk  -  2pk", dbSkus)?.id).toBe(1);
  });

  it("returns null for empty SKU list", () => {
    expect(findBestSkuMatch("Alpha Chunk - 2pk", [])).toBeNull();
  });

  it("matches with keyword overlap when no exact match", () => {
    const result = findBestSkuMatch("Grape Crush Vape", dbSkus);
    expect(result).not.toBeNull();
    expect(result?.id).toBe(3);
  });
});

describe("parseSalesReport edge cases", () => {
  it("handles spreadsheet with no product data rows", async () => {
    const buffer = await buildExcelBuffer("Sheet1", [
      ["Company Name"],
      ["Report Title"],
      ["Date Range"],
      [null],
      [null, "Jan 2026", null, null, null, "Total"],
      [null, "Quantity", "Amount", "% of Sales", "Avg Price", "Quantity"],
    ]);
    const { items, csvForAI } = await parseSalesReport(buffer);
    expect(items).toHaveLength(0);
    expect(csvForAI).toContain("SKU Name");
  });

  it("excludes category headers like 'Hijnx Edibles'", async () => {
    const buffer = await buildExcelBuffer("Sheet1", [
      ["Company"],
      ["Report"],
      ["Dates"],
      [null],
      [null, "Jan 2026", null, null, null, "Total"],
      [null, "Quantity", "Amount", "% of Sales", "Avg Price", "Quantity"],
      ["Hijnx Edibles"],
      ["   Alpha Chunk - 2pk", "100", "$475.00", "50%", "4.75", "100"],
    ]);
    const { items } = await parseSalesReport(buffer);
    expect(items).toHaveLength(1);
    expect(items[0].skuName).toBe("Alpha Chunk - 2pk");
  });
});

// ─── calculateParLevel edge cases ───────────────────────────────────────

describe("calculateParLevel edge cases", () => {
  it("handles very small velocity", () => {
    expect(calculateParLevel(0.1, 14)).toBe(2);
  });

  it("handles very large velocity", () => {
    expect(calculateParLevel(1000, 14)).toBe(14000);
  });

  it("handles 1-day buffer", () => {
    expect(calculateParLevel(100, 1)).toBe(100);
  });

  it("handles 30-day buffer", () => {
    expect(calculateParLevel(50, 30)).toBe(1500);
  });
});
