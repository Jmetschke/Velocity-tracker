/**
 * Additional tests targeting specific coverage gaps identified during audit.
 * Covers: QB parseNum, classifyRow, category context reset, METRC batch keyword
 * fallback, vape pattern edge cases, normalizeName via findBestSkuMatch, and
 * scheduling edge cases.
 */
import { describe, expect, it } from "vitest";
import { parseQuickBooksExport } from "./quickbooks-parser";
import { parseMetrcExport } from "./metrc-parser";
import { findBestSkuMatch, parseInventoryReport } from "./parsers";
import {
  addBusinessDays,
  nextBusinessDay,
  generateScheduleSuggestions,
  type SkuScheduleInput,
} from "./scheduling";
import { buildExcelBuffer } from "./test-helpers";
import ExcelJS from "exceljs";

// ─── Shared helpers ─────────────────────────────────────────────────────

/** Build a minimal QB workbook with one month, sub-headers, and one product row. */
async function buildMinimalQB(
  productName: string,
  cellValues: Record<number, any>
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Sheet1");
  ws.getCell(1, 1).value = "Company";
  ws.getCell(2, 1).value = "Report";
  ws.getCell(3, 1).value = "Dates";
  // Row 5: month header
  ws.getCell(5, 2).value = "Jan 2025";
  ws.getCell(5, 9).value = "Total";
  // Row 6: sub-headers
  const subs = ["Quantity", "Amount", "% of Sales", "Avg Price", "COGS", "Gross Margin", "Gross Margin %"];
  subs.forEach((h, j) => { ws.getCell(6, 2 + j).value = h; });
  // Row 7: product
  ws.getCell(7, 1).value = productName;
  for (const [col, val] of Object.entries(cellValues)) {
    ws.getCell(7, Number(col) + 1).value = val; // ExcelJS is 1-indexed
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** Build a QB workbook with a footer row after a product. */
async function buildQBWithFooter(footerText: string): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Sheet1");
  ws.getCell(1, 1).value = "Company";
  ws.getCell(2, 1).value = "Report";
  ws.getCell(3, 1).value = "Dates";
  ws.getCell(5, 2).value = "Jan 2025";
  ws.getCell(5, 9).value = "Total";
  const subs = ["Quantity", "Amount", "% of Sales", "Avg Price", "COGS", "Gross Margin", "Gross Margin %"];
  subs.forEach((h, j) => { ws.getCell(6, 2 + j).value = h; });
  // Product row
  ws.getCell(7, 1).value = "Micro Dots";
  ws.getCell(7, 2).value = 50;
  // Footer row
  ws.getCell(8, 1).value = footerText;
  ws.getCell(8, 2).value = 0;
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** Build a QB workbook with Pheotera category then a product after. */
async function buildQBWithPheoteraThenMore(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Sheet1");
  ws.getCell(1, 1).value = "Company";
  ws.getCell(2, 1).value = "Report";
  ws.getCell(3, 1).value = "Dates";
  ws.getCell(5, 2).value = "Jan 2025";
  ws.getCell(5, 9).value = "Total";
  const subs = ["Quantity", "Amount", "% of Sales", "Avg Price", "COGS", "Gross Margin", "Gross Margin %"];
  subs.forEach((h, j) => { ws.getCell(6, 2 + j).value = h; });

  let r = 7;
  function addRow(name: string, qty?: number) {
    ws.getCell(r, 1).value = name;
    if (qty !== undefined) ws.getCell(r, 2).value = qty;
    r++;
  }

  addRow("Pheotera Topical");
  addRow("   Kick The Itch Lotion", 20);
  addRow("   Romance Oil", 10);
  addRow("Total Pheotera Topical");
  addRow("Micro Dots", 100);

  return Buffer.from(await wb.xlsx.writeBuffer());
}

// ─── METRC helpers ──────────────────────────────────────────────────────

const METRC_HEADERS = [
  "Tag", "Item", "Category", "Location", "Quantity",
  "Unit Of Measure", "Lab Test Status", "Production Batch Number",
  "Source Processing Job(s)",
];

async function buildMetrcBuffer(rows: any[][]): Promise<Buffer> {
  return buildExcelBuffer("Sheet1", [METRC_HEADERS, ...rows]);
}

function metrcRow(overrides: Partial<Record<string, any>> = {}): any[] {
  const defaults: Record<string, any> = {
    Tag: "TAG001",
    Item: "Hijnx Gummy RSO Some Ambiguous Name",
    Category: "Edible (Final Form)",
    Location: "Product Ready For Sale",
    Quantity: 100,
    "Unit Of Measure": "Each",
    "Lab Test Status": "TestPassed",
    "Production Batch Number": "",
    "Source Processing Job(s)": "",
  };
  const merged = { ...defaults, ...overrides };
  return METRC_HEADERS.map((h) => merged[h]);
}

function vapeRow(overrides: Partial<Record<string, any>> = {}): any[] {
  const defaults: Record<string, any> = {
    Tag: "TAG001",
    Item: "Snackbar Vape Pen 1g - Grape Crush",
    Category: "Vape Cartridge (Final Form)",
    Location: "Product Ready For Sale",
    Quantity: 100,
    "Unit Of Measure": "Each",
    "Lab Test Status": "TestPassed",
    "Production Batch Number": "",
    "Source Processing Job(s)": "",
  };
  const merged = { ...defaults, ...overrides };
  return METRC_HEADERS.map((h) => merged[h]);
}

// ─── QB parseNum edge cases ──────────────────────────────────────────────

describe("QB parser handles tricky numeric formats", () => {
  it("parses dollar-formatted amounts like '$14,725.00'", async () => {
    const buf = await buildMinimalQB("Micro Dots", { 1: 50, 2: "$500.00" });
    const result = await parseQuickBooksExport(buf);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].monthlyData[0].quantity).toBe(50);
    expect(result.items[0].monthlyData[0].amount).toBe(500);
  });

  it("parses comma-separated numbers like '3,100'", async () => {
    const buf = await buildMinimalQB("Micro Dots", { 1: "3,100" });
    const result = await parseQuickBooksExport(buf);
    expect(result.items[0].monthlyData[0].quantity).toBe(3100);
  });

  it("treats empty cells as zero", async () => {
    const buf = await buildMinimalQB("Micro Dots", { 1: 10, 2: "" });
    const result = await parseQuickBooksExport(buf);
    expect(result.items[0].monthlyData[0].amount).toBe(0);
  });

  it("treats null cells as NaN-safe (parseNum returns 0 for NaN)", async () => {
    const buf = await buildMinimalQB("Micro Dots", { 1: 10 });
    const result = await parseQuickBooksExport(buf);
    expect(result.items[0].monthlyData[0].amount).toBe(0);
  });

  it("handles negative quantities", async () => {
    const buf = await buildMinimalQB("Micro Dots", { 1: -5, 2: -50 });
    const result = await parseQuickBooksExport(buf);
    expect(result.items[0].monthlyData[0].quantity).toBe(-5);
    expect(result.items[0].monthlyData[0].amount).toBe(-50);
  });
});

// ─── QB classifyRow: footer timestamp detection ─────────────────────────

describe("QB classifyRow footer detection", () => {
  it("excludes Tuesday footer timestamp", async () => {
    const result = await parseQuickBooksExport(
      await buildQBWithFooter("Tuesday, Mar 10, 2026 08:42:22 PM GMT-7 - Accrual Basis")
    );
    expect(result.items).toHaveLength(1);
    expect(result.excludedRows.some((r) => r.reason === "Report footer")).toBe(true);
  });

  it("excludes Monday footer timestamp", async () => {
    const result = await parseQuickBooksExport(
      await buildQBWithFooter("Monday, Jan 5, 2026 10:00:00 AM GMT-6 - Accrual Basis")
    );
    expect(result.excludedRows.some((r) => r.reason === "Report footer")).toBe(true);
  });

  it("excludes Sunday footer timestamp", async () => {
    const result = await parseQuickBooksExport(
      await buildQBWithFooter("Sunday, Dec 28, 2025 03:15:00 PM GMT-5 - Cash Basis")
    );
    expect(result.excludedRows.some((r) => r.reason === "Report footer")).toBe(true);
  });

  it("does not falsely exclude a product starting with a day name", async () => {
    const result = await parseQuickBooksExport(
      await buildQBWithFooter("Sundaybreak Gummy")
    );
    const footerExcluded = result.excludedRows.filter((r) => r.reason === "Report footer");
    expect(footerExcluded).toHaveLength(0);
  });
});

// ─── QB category context reset after "Total Pheotera Topical" ───────────

describe("QB category context resets after excluded category total", () => {
  it("does not exclude products that appear after Pheotera total row", async () => {
    const result = await parseQuickBooksExport(await buildQBWithPheoteraThenMore());
    expect(result.items).toHaveLength(1);
    expect(result.items[0].skuName).toBe("Micro Dots");
    const pheoExcluded = result.excludedRows.filter((r) => r.reason === "Pheotera brand (child product)");
    expect(pheoExcluded).toHaveLength(2);
  });
});

// ─── METRC batch keyword fallback coverage ──────────────────────────────

describe("METRC batch keyword fallback mapping", () => {
  it("maps 'cbd 1pk' batch keyword to Chill Chunk - 1pk", async () => {
    const buf = await buildMetrcBuffer([
      metrcRow({ "Production Batch Number": "CBD 1pk Batch 042" }),
    ]);
    const result = await parseMetrcExport(buf);
    expect(result.items[0].skuName).toBe("Chill Chunk - 1pk");
  });

  it("maps 'cbn 2pk' batch keyword to Sleep Chunk - 2pk", async () => {
    const buf = await buildMetrcBuffer([
      metrcRow({ "Production Batch Number": "CBN 2pk Run 7" }),
    ]);
    const result = await parseMetrcExport(buf);
    expect(result.items[0].skuName).toBe("Sleep Chunk - 2pk");
  });

  it("maps 'sf mini' batch keyword to Sugar Free MiNi's - 10pk", async () => {
    const buf = await buildMetrcBuffer([
      metrcRow({ "Production Batch Number": "SF Mini Production 12" }),
    ]);
    const result = await parseMetrcExport(buf);
    expect(result.items[0].skuName).toBe("Sugar Free MiNi's - 10pk");
  });

  it("maps 'mini 10pk' batch keyword to MiNi's Chunks - 10pk", async () => {
    const buf = await buildMetrcBuffer([
      metrcRow({ "Production Batch Number": "Mini 10pk Batch 5" }),
    ]);
    const result = await parseMetrcExport(buf);
    expect(result.items[0].skuName).toBe("MiNi's Chunks - 10pk");
  });

  it("maps 'triple citrus' batch keyword to Hijnx Shooter - Triple Citrus 2oz", async () => {
    const buf = await buildMetrcBuffer([
      metrcRow({ "Production Batch Number": "Triple Citrus Shooter Run" }),
    ]);
    const result = await parseMetrcExport(buf);
    expect(result.items[0].skuName).toBe("Hijnx Shooter - Triple Citrus 2oz");
  });

  it("maps 'blue razz' batch keyword to Hijnx Shooter - Sour Blue Razz 2oz", async () => {
    const buf = await buildMetrcBuffer([
      metrcRow({ "Production Batch Number": "Blue Razz Batch 3" }),
    ]);
    const result = await parseMetrcExport(buf);
    expect(result.items[0].skuName).toBe("Hijnx Shooter - Sour Blue Razz 2oz");
  });

  it("uses Source Processing Job(s) as fallback when batch number has no keyword", async () => {
    const buf = await buildMetrcBuffer([
      metrcRow({
        "Production Batch Number": "Generic Batch 99",
        "Source Processing Job(s)": "OG Zuul 2pk Processing",
      }),
    ]);
    const result = await parseMetrcExport(buf);
    expect(result.items[0].skuName).toBe("Zuul Chunk - 2pk");
  });
});

// ─── METRC vape pattern edge cases ──────────────────────────────────────

describe("METRC vape pattern edge cases", () => {
  it("handles extra whitespace in vape item name", async () => {
    const buf = await buildMetrcBuffer([
      vapeRow({ Item: "Snackbar Vape Pen 1g  -  Grape Crush" }),
    ]);
    const result = await parseMetrcExport(buf);
    expect(result.items[0].skuName).toBe("Snackbar Vape - Grape Crush 1g");
  });

  it("handles lowercase vape item name", async () => {
    const buf = await buildMetrcBuffer([
      vapeRow({ Item: "snackbar vape pen 1g - lemon yuzu" }),
    ]);
    const result = await parseMetrcExport(buf);
    expect(result.items[0].skuName).toBe("Snackbar Vape - Lemon Yuzu 1g");
  });

  it("handles vape with no space before dash", async () => {
    const buf = await buildMetrcBuffer([
      vapeRow({ Item: "Snackbar Vape Pen 1g- Magic Mango" }),
    ]);
    const result = await parseMetrcExport(buf);
    expect(result.items[0].skuName).toBe("Snackbar Vape - Magic Mango 1g");
  });
});

// ─── findBestSkuMatch normalization edge cases ──────────────────────────

describe("findBestSkuMatch normalization edge cases", () => {
  const dbSkus = [
    { id: 1, name: "Alpha Chunk - 2pk" },
    { id: 2, name: "Sleep Chunk - 1pk" },
    { id: 3, name: "MiNi's Chunks - 10pk" },
    { id: 4, name: "Snackbar Vape - Grape Crush 1g" },
    { id: 5, name: "Whoopie Hi" },
  ];

  it("normalizes '2-pack' to '2pk'", () => {
    expect(findBestSkuMatch("Alpha Chunk - 2-pack", dbSkus)?.id).toBe(1);
  });

  it("normalizes '2 pack' to '2pk'", () => {
    expect(findBestSkuMatch("Alpha Chunk - 2 pack", dbSkus)?.id).toBe(1);
  });

  it("normalizes '10-pack' to '10pk'", () => {
    expect(findBestSkuMatch("MiNi's Chunks - 10-pack", dbSkus)?.id).toBe(3);
  });

  it("normalizes multiple spaces to single space", () => {
    expect(findBestSkuMatch("Alpha   Chunk   -   2pk", dbSkus)?.id).toBe(1);
  });

  it("handles mixed case", () => {
    expect(findBestSkuMatch("SLEEP CHUNK - 1PK", dbSkus)?.id).toBe(2);
  });

  it("handles tab characters in name", () => {
    expect(findBestSkuMatch("\tAlpha Chunk - 2pk\t", dbSkus)?.id).toBe(1);
  });

  it("returns null for completely unrelated name", () => {
    expect(findBestSkuMatch("Organic Kombucha 12oz", dbSkus)).toBeNull();
  });

  it("keyword overlap: single word 'Chunk' matches via contains check", () => {
    const result = findBestSkuMatch("Chunk", dbSkus);
    expect(result).not.toBeNull();
    expect(result?.id).toBe(1);
  });

  it("returns null when no keyword overlap reaches 50%", () => {
    expect(findBestSkuMatch("Organic Fizz", dbSkus)).toBeNull();
  });
});

// ─── Scheduling: addBusinessDays from Friday ────────────────────────────

describe("addBusinessDays from Friday", () => {
  it("adding 1 day from Friday lands on Monday", () => {
    const friday = new Date(2026, 2, 13);
    const result = addBusinessDays(friday, 1);
    expect(result.getDay()).toBe(1);
    expect(result.getDate()).toBe(16);
  });

  it("adding 2 days from Friday lands on Tuesday", () => {
    const friday = new Date(2026, 2, 13);
    const result = addBusinessDays(friday, 2);
    expect(result.getDay()).toBe(2);
    expect(result.getDate()).toBe(17);
  });
});

// ─── Scheduling: negative velocity ─────────────────────────────────────

describe("generateScheduleSuggestions with negative velocity", () => {
  const baseDate = new Date(2026, 2, 10);

  it("includes negative-velocity SKUs as ok with no batches needed", () => {
    const input: SkuScheduleInput = {
      skuId: 1,
      skuName: "Negative Velocity SKU",
      currentStock: 500,
      dailyVelocity: -10,
      parLevel: 700,
      netBatchSize: 950,
      leadTimeDays: 5,
    };
    const results = generateScheduleSuggestions([input], baseDate);
    expect(results).toHaveLength(1);
    expect(results[0].urgency).toBe("ok");
    expect(results[0].daysUntilStockout).toBe(Infinity);
    expect(results[0].batchesNeeded).toBe(0);
    expect(results[0].dailyVelocity).toBe(0);
  });
});

// ─── Scheduling: committed quantity exceeds deficit ─────────────────────

describe("generateScheduleSuggestions committed quantity edge cases", () => {
  const baseDate = new Date(2026, 2, 10);

  it("adjustedDeficit never goes negative", () => {
    const input: SkuScheduleInput = {
      skuId: 1,
      skuName: "Over-committed SKU",
      currentStock: 500,
      dailyVelocity: 50,
      parLevel: 700,
      netBatchSize: 7125,
      leadTimeDays: 5,
      committedQuantity: 1000,
    };
    const results = generateScheduleSuggestions([input], baseDate);
    expect(results[0].adjustedDeficit).toBe(0);
    expect(results[0].batchesNeeded).toBe(0);
  });

  it("handles undefined committedQuantity as 0", () => {
    const input: SkuScheduleInput = {
      skuId: 1,
      skuName: "No Committed SKU",
      currentStock: 500,
      dailyVelocity: 50,
      parLevel: 700,
      netBatchSize: 7125,
      leadTimeDays: 5,
    };
    const results = generateScheduleSuggestions([input], baseDate);
    expect(results[0].committedQuantity).toBe(0);
    expect(results[0].adjustedDeficit).toBe(200);
  });
});

// ─── Inventory parser: standalone items without context ─────────────────

describe("parseInventoryReport standalone items", () => {
  it("handles standalone items with no parent context", async () => {
    const buffer = await buildExcelBuffer("Sheet1", [
      [null, "Qty in Inventory", "Qty on Hold for COA", "Total", "Trigger Point"],
      ["Micro Dots", 758, null, 758, 100],
      ["Whoopie His", 823, null, 823, 150],
    ]);
    const items = await parseInventoryReport(buffer);
    expect(items).toHaveLength(2);
    expect(items[0].fullName).toBe("Micro Dots");
    expect(items[1].fullName).toBe("Whoopie Hi");
  });

  it("resets context after standalone pack item", async () => {
    const buffer = await buildExcelBuffer("Sheet1", [
      [null, "Qty in Inventory", "Qty on Hold for COA", "Total", "Trigger Point"],
      ["Rex Chunk 2-pack", 5873, null, 5873, 1000],
      ["Micro Dots", 758, null, 758, 100],
    ]);
    const items = await parseInventoryReport(buffer);
    expect(items[0].fullName).toBe("Rex Chunk - 2pk");
    expect(items[1].fullName).toBe("Micro Dots");
  });

  it("handles sub-item without parent context (orphan pack row)", async () => {
    const buffer = await buildExcelBuffer("Sheet1", [
      [null, "Qty in Inventory", "Qty on Hold for COA", "Total", "Trigger Point"],
      ["2-pack", 100, null, 100, 50],
    ]);
    const items = await parseInventoryReport(buffer);
    expect(items).toHaveLength(1);
    expect(items[0].fullName).toBe("2-pack");
  });
});

// ─── nextBusinessDay for all days of the week ───────────────────────────

describe("nextBusinessDay for every day of the week", () => {
  it("returns same day for Monday through Friday", () => {
    for (let d = 9; d <= 13; d++) {
      const date = new Date(2026, 2, d);
      const result = nextBusinessDay(date);
      expect(result.getDate()).toBe(d);
    }
  });

  it("returns Monday for Saturday", () => {
    const result = nextBusinessDay(new Date(2026, 2, 14));
    expect(result.getDay()).toBe(1);
    expect(result.getDate()).toBe(16);
  });

  it("returns Monday for Sunday", () => {
    const result = nextBusinessDay(new Date(2026, 2, 15));
    expect(result.getDay()).toBe(1);
    expect(result.getDate()).toBe(16);
  });
});
