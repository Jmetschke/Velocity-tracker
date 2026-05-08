import { describe, expect, it } from "vitest";
import { parseInventoryReport, parseSalesReport, findBestSkuMatch } from "./parsers";
import { buildExcelBuffer } from "./test-helpers";

// ─── Helper: Build a mock inventory xlsx buffer ───────────────────────

async function buildInventoryBuffer(): Promise<Buffer> {
  return buildExcelBuffer("Sheet1", [
    [null, "Qty in Inventory", "Qty on Hold for COA", "Total", "Trigger Point to Produce"],
    ["Hijnx", null, null, null, null],
    ["Alpha Chunk", null, null, null, null],
    ["2-pack", 11640, null, 11640, 2400],
    ["1-pack", 2707, null, 2707, 1100],
    ["Rex Chunk 2-pack", 5873, null, 5873, 1000],
    ["Zuul Chunk 2-pack", 2256, null, 2256, 1000],
    ["Chill Chunk", null, null, null, null],
    ["2-pack", 2162, null, 2162, 1100],
    ["1-pack", 1961, null, 1961, 800],
    ["Sleep Chunk", null, null, null, null],
    ["2-pack", 926, 7123, 8049, 700],
    ["1-pack", 2117, null, 2117, 400],
    ["MiNi's Chunks 10-pack", 8382, null, 8382, 900],
    ["Sugar Free MiNi's Chunks 10-pack", 2578, null, 2578, 400],
    ["Whoopie His", 823, null, 823, 150],
    ["Micro Dots", 758, null, 758, 100],
    [null, null, null, null, null],
    ["Snackbar", null, null, null, null],
    ["Grape Crush", 1436, null, 1436, 500],
    ["Lemon Yuzu", 1936, null, 1936, 500],
    ["Magic Mango", 1399, null, 1399, 500],
    ["Watermelon Lychee", 1535, null, 1535, 600],
  ]);
}

// ─── Inventory Parser Tests ───────────────────────────────────────────

describe("parseInventoryReport", () => {
  it("parses hierarchical inventory with correct full names", async () => {
    const buffer = await buildInventoryBuffer();
    const items = await parseInventoryReport(buffer);

    expect(items.length).toBe(16);

    const names = items.map((i) => i.fullName);
    expect(names).toContain("Alpha Chunk - 2pk");
    expect(names).toContain("Alpha Chunk - 1pk");
    expect(names).toContain("Rex Chunk - 2pk");
    expect(names).toContain("Zuul Chunk - 2pk");
    expect(names).toContain("Chill Chunk - 2pk");
    expect(names).toContain("Chill Chunk - 1pk");
    expect(names).toContain("Sleep Chunk - 2pk");
    expect(names).toContain("Sleep Chunk - 1pk");
    expect(names).toContain("MiNi's Chunks - 10pk");
    expect(names).toContain("Sugar Free MiNi's Chunks - 10pk");
    expect(names).toContain("Whoopie Hi");
    expect(names).toContain("Micro Dots");
  });

  it("correctly parses quantities including COA holds", async () => {
    const buffer = await buildInventoryBuffer();
    const items = await parseInventoryReport(buffer);

    const alphaChunk2pk = items.find((i) => i.fullName === "Alpha Chunk - 2pk");
    expect(alphaChunk2pk).toBeDefined();
    expect(alphaChunk2pk!.qtyInInventory).toBe(11640);
    expect(alphaChunk2pk!.qtyOnHold).toBe(0);
    expect(alphaChunk2pk!.totalQty).toBe(11640);

    const sleepChunk2pk = items.find((i) => i.fullName === "Sleep Chunk - 2pk");
    expect(sleepChunk2pk).toBeDefined();
    expect(sleepChunk2pk!.qtyInInventory).toBe(926);
    expect(sleepChunk2pk!.qtyOnHold).toBe(7123);
    expect(sleepChunk2pk!.totalQty).toBe(8049);
  });

  it("handles Whoopie His -> Whoopie Hi name correction", async () => {
    const buffer = await buildInventoryBuffer();
    const items = await parseInventoryReport(buffer);
    const whoopie = items.find((i) => i.fullName === "Whoopie Hi");
    expect(whoopie).toBeDefined();
    expect(whoopie!.qtyInInventory).toBe(823);
  });

  it("parses vape SKUs under Snackbar brand", async () => {
    const buffer = await buildInventoryBuffer();
    const items = await parseInventoryReport(buffer);

    const grapeCrush = items.find((i) => i.fullName === "Grape Crush");
    expect(grapeCrush).toBeDefined();
    expect(grapeCrush!.qtyInInventory).toBe(1436);

    const watermelonLychee = items.find((i) => i.fullName === "Watermelon Lychee");
    expect(watermelonLychee).toBeDefined();
    expect(watermelonLychee!.qtyInInventory).toBe(1535);
  });
});

// ─── SKU Name Matching Tests ──────────────────────────────────────────

describe("findBestSkuMatch", () => {
  const dbSkus = [
    { id: 1, name: "Alpha Chunk - 2pk" },
    { id: 2, name: "Alpha Chunk - 1pk" },
    { id: 3, name: "Rex Chunk - 2pk" },
    { id: 4, name: "Zuul Chunk - 2pk" },
    { id: 5, name: "Chill Chunk - 2pk" },
    { id: 6, name: "Chill Chunk - 1pk" },
    { id: 7, name: "Sleep Chunk - 2pk" },
    { id: 8, name: "Sleep Chunk - 1pk" },
    { id: 9, name: "MiNi's Chunks - 10pk" },
    { id: 10, name: "Sugar Free MiNi's Chunks - 10pk" },
    { id: 11, name: "Whoopie Hi" },
    { id: 12, name: "Micro Dots" },
    { id: 13, name: "Grape Crush 1g Vape" },
    { id: 14, name: "Lemon Yuzu 1g Vape" },
    { id: 15, name: "Magic Mango 1g Vape" },
    { id: 16, name: "Watermelon Lychee 1g Vape" },
  ];

  it("matches exact normalized names", () => {
    expect(findBestSkuMatch("Alpha Chunk - 2pk", dbSkus)?.id).toBe(1);
    expect(findBestSkuMatch("Micro Dots", dbSkus)?.id).toBe(12);
  });

  it("matches sales file names with leading spaces", () => {
    expect(findBestSkuMatch("   Chill Chunk - 1pk", dbSkus)?.id).toBe(6);
    expect(findBestSkuMatch("   Alpha Chunk - 2pk", dbSkus)?.id).toBe(1);
  });

  it("matches vape names from sales file", () => {
    expect(findBestSkuMatch("Grape Crush 1g Vape", dbSkus)?.id).toBe(13);
    expect(findBestSkuMatch("   Grape Crush 1g Vape", dbSkus)?.id).toBe(13);
  });

  it("matches inventory names to DB names", () => {
    expect(findBestSkuMatch("Whoopie Hi", dbSkus)?.id).toBe(11);
    expect(findBestSkuMatch("MiNi's Chunks - 10pk", dbSkus)?.id).toBe(9);
  });

  it("returns null for non-matching names", () => {
    expect(findBestSkuMatch("Nonexistent Product", dbSkus)).toBeNull();
  });
});

// ─── Sales Parser Tests ───────────────────────────────────────────────

describe("parseSalesReport", () => {
  async function buildSalesBuffer(): Promise<Buffer> {
    return buildExcelBuffer("Sales", [
      ["Elevated Organics, LLC"],
      ["Sales by Product/Service Summary"],
      ["All Dates"],
      [null],
      [null, "Jan 2026", null, null, null, "Feb 2026", null, null, null, "Total", null, null, null],
      [null, "Quantity", "Amount", "% of Sales", "Avg Price", "Quantity", "Amount", "% of Sales", "Avg Price", "Quantity", "Amount", "% of Sales", "Avg Price"],
      ["Hijnx Edibles"],
      ["   Alpha Chunk - 2pk", "3,100.00", "$14,725.00", "40%", "4.75", "2,800.00", "$13,300.00", "38%", "4.75", "5,900.00", "$28,025.00", "39%", "4.75"],
      ["   Alpha Chunk - 2pk (SAMPLE)"],
      ["   Chill Chunk - 1pk", "1,500.00", "$5,250.00", "15%", "3.50", "1,200.00", "$4,200.00", "12%", "3.50", "2,700.00", "$9,450.00", "13%", "3.50"],
    ]);
  }

  it("parses sales data and excludes SAMPLE rows", async () => {
    const buffer = await buildSalesBuffer();
    const { items } = await parseSalesReport(buffer);

    expect(items.length).toBe(2);
    expect(items[0].skuName).toBe("Alpha Chunk - 2pk");
    expect(items[1].skuName).toBe("Chill Chunk - 1pk");
  });

  it("generates clean CSV for AI analysis", async () => {
    const buffer = await buildSalesBuffer();
    const { csvForAI } = await parseSalesReport(buffer);

    expect(csvForAI).toContain("SKU Name");
    expect(csvForAI).toContain("Alpha Chunk - 2pk");
    expect(csvForAI).toContain("Chill Chunk - 1pk");
    expect(csvForAI).not.toContain("SAMPLE");
  });

  it("parses monthly quantities correctly", async () => {
    const buffer = await buildSalesBuffer();
    const { items } = await parseSalesReport(buffer);

    const alpha = items[0];
    expect(alpha.monthlyData.length).toBe(2);
    expect(alpha.monthlyData[0].month).toBe("Jan 2026");
    expect(alpha.monthlyData[0].quantity).toBe(3100);
    expect(alpha.monthlyData[1].month).toBe("Feb 2026");
    expect(alpha.monthlyData[1].quantity).toBe(2800);
    expect(alpha.totalQuantity).toBe(5900);
  });
});
