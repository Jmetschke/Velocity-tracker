/**
 * Unit tests for METRC parser using synthetic data.
 * These tests don't depend on a real METRC export file.
 */
import { describe, expect, it } from "vitest";
import { parseMetrcExport } from "./metrc-parser";
import { buildExcelBuffer } from "./test-helpers";

// ─── Helpers ────────────────────────────────────────────────────────────

const HEADERS = [
  "Tag",
  "Item",
  "Category",
  "Location",
  "Quantity",
  "Unit Of Measure",
  "Lab Test Status",
  "Production Batch Number",
  "Source Processing Job(s)",
];

async function buildMetrcBuffer(rows: any[][]): Promise<Buffer> {
  return buildExcelBuffer("Sheet1", [HEADERS, ...rows]);
}

function row(overrides: Partial<Record<string, any>> = {}): any[] {
  const defaults: Record<string, any> = {
    Tag: "TAG001",
    Item: "Hijnx Gummy RSO 100mg Space Chunks",
    Category: "Edible (Final Form)",
    Location: "Product Ready For Sale",
    Quantity: 100,
    "Unit Of Measure": "Each",
    "Lab Test Status": "TestPassed",
    "Production Batch Number": "",
    "Source Processing Job(s)": "",
  };
  const merged = { ...defaults, ...overrides };
  return HEADERS.map(h => merged[h]);
}

// ─── Tests ──────────────────────────────────────────────────────────────

describe("METRC Parser (synthetic data)", () => {
  // ─── Basic Parsing ──────────────────────────────────────────────────

  it("parses an empty sheet with no data rows", async () => {
    const buffer = await buildMetrcBuffer([]);
    const result = await parseMetrcExport(buffer);
    expect(result.totalRows).toBe(0);
    expect(result.items).toHaveLength(0);
    expect(result.excludedRows).toBe(0);
  });

  it("parses a single Alpha Chunk row", async () => {
    const buffer = await buildMetrcBuffer([
      row({ Item: "Hijnx Gummy RSO 100mg Space Chunks", Quantity: 500 }),
    ]);
    const result = await parseMetrcExport(buffer);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].skuName).toBe("Alpha Chunk - 2pk");
    expect(result.items[0].available).toBe(500);
    expect(result.items[0].wip).toBe(0);
    expect(result.items[0].itemNames).toContain(
      "Hijnx Gummy RSO 100mg Space Chunks"
    );
  });

  // ─── Item-to-SKU Mapping ────────────────────────────────────────────

  it("maps all Chunk variants correctly", async () => {
    const buffer = await buildMetrcBuffer([
      row({
        Tag: "T1",
        Item: "Hijnx Gummy RSO 100mg Space Chunks",
        Quantity: 100,
      }),
      row({
        Tag: "T2",
        Item: "Hijnx Gummy RSO 50mg Space Chunk Gummy",
        Quantity: 200,
      }),
      row({
        Tag: "T3",
        Item: "Hijnx Gummy RSO 100mg / 100mg Space Chunks",
        Quantity: 300,
      }),
      row({
        Tag: "T4",
        Item: "Hijnx Gummy RSO 50mg/50mg Space Chunk Gummy",
        Quantity: 400,
      }),
      row({
        Tag: "T5",
        Item: "Hijnx Gummy RSO CBN 100mg/100mg Sleep Space Chunk Gummies",
        Quantity: 500,
      }),
      row({
        Tag: "T6",
        Item: "Hijnx Gummy RSO CBN 50mg/50mg Sleep Space Chunk Gummy",
        Quantity: 600,
      }),
      row({
        Tag: "T7",
        Item: "Hijnx Gummy RSO Rex OG 100mg Rex Space Chunk Gummies",
        Quantity: 700,
      }),
      row({
        Tag: "T8",
        Item: "Hijnx Gummy RSO Zuul OG 100mg Zuul Space Chunk Gummies",
        Quantity: 800,
      }),
    ]);
    const result = await parseMetrcExport(buffer);
    const nameMap = new Map(result.items.map(i => [i.skuName, i.available]));

    expect(nameMap.get("Alpha Chunk - 2pk")).toBe(100);
    expect(nameMap.get("Alpha Chunk - 1pk")).toBe(200);
    expect(nameMap.get("Chill Chunk - 2pk")).toBe(300);
    expect(nameMap.get("Chill Chunk - 1pk")).toBe(400);
    expect(nameMap.get("Sleep Chunk - 2pk")).toBe(500);
    expect(nameMap.get("Sleep Chunk - 1pk")).toBe(600);
    expect(nameMap.get("Rex Chunk - 2pk")).toBe(700);
    expect(nameMap.get("Zuul Chunk - 2pk")).toBe(800);
  });

  it("maps MiNi's and Sugar Free MiNi's correctly", async () => {
    const buffer = await buildMetrcBuffer([
      row({
        Tag: "T1",
        Item: "Hijnx Gummy RSO 100mg Mini Space Chunk Gummies",
        Quantity: 150,
      }),
      row({
        Tag: "T2",
        Item: "Hijnx Gummy RSO Sugar Free 100mg Mini Sugar Free Space Chunk Gummies",
        Quantity: 75,
      }),
    ]);
    const result = await parseMetrcExport(buffer);
    const nameMap = new Map(result.items.map(i => [i.skuName, i.available]));

    expect(nameMap.get("MiNi's Chunks - 10pk")).toBe(150);
    expect(nameMap.get("Sugar Free MiNi's - 10pk")).toBe(75);
  });

  it("maps Whoopie Hi and Micro Dots correctly", async () => {
    const buffer = await buildMetrcBuffer([
      row({
        Tag: "T1",
        Item: "Hijnx Whoopie RSO 100mg Whoopie Hi Cookie",
        Quantity: 200,
      }),
      row({
        Tag: "T2",
        Item: "Hijnx Micro Dots 50mg Purple Raz - Edible",
        Quantity: 300,
      }),
    ]);
    const result = await parseMetrcExport(buffer);
    const nameMap = new Map(result.items.map(i => [i.skuName, i.available]));

    expect(nameMap.get("Whoopie Hi")).toBe(200);
    expect(nameMap.get("Micro Dots")).toBe(300);
  });

  it("maps Snackbar Vape flavors correctly", async () => {
    const buffer = await buildMetrcBuffer([
      row({
        Tag: "T1",
        Item: "Snackbar Vape Pen 1g - Grape Crush",
        Quantity: 100,
      }),
      row({
        Tag: "T2",
        Item: "Snackbar Vape Pen 1g - Lemon Yuzu",
        Quantity: 200,
      }),
      row({
        Tag: "T3",
        Item: "Snackbar Vape Pen 1g - Magic Mango",
        Quantity: 300,
      }),
      row({
        Tag: "T4",
        Item: "Snackbar Vape Pen 1g - Watermelon Lychee",
        Quantity: 400,
      }),
    ]);
    const result = await parseMetrcExport(buffer);
    const nameMap = new Map(result.items.map(i => [i.skuName, i.available]));

    expect(nameMap.get("Snackbar Vape - Grape Crush 1g")).toBe(100);
    expect(nameMap.get("Snackbar Vape - Lemon Yuzu 1g")).toBe(200);
    expect(nameMap.get("Snackbar Vape - Mango Magic 1g")).toBe(300);
    expect(nameMap.get("Snackbar Vape - Watermelon Lychee 1g")).toBe(400);
  });

  it("maps the current 2g Snackbar and sampler METRC item names", async () => {
    const buffer = await buildMetrcBuffer([
      row({
        Tag: "T1",
        Item: "Snackbar Vape Pen 2g - Strawberry Dragonfruit",
        Quantity: 174,
      }),
      row({
        Tag: "T2",
        Item: "Snackbar Vape Pen 2g - Peach Passion Fruit",
        Quantity: 242,
      }),
      row({
        Tag: "T3",
        Item: "Snackbar Vape Pen 2g - Cherry Pomegranate Lemon",
        Quantity: 266,
      }),
      row({
        Tag: "T4",
        Item: "Hijnx Edible: Sampler Medley Bag",
        Quantity: 11198,
      }),
    ]);
    const result = await parseMetrcExport(buffer);
    const nameMap = new Map(result.items.map(i => [i.skuName, i.available]));

    expect(result.unmatchedRows).toHaveLength(0);
    expect(nameMap.get("Snackbar Vape - Strawberry Dragonfruit 2g")).toBe(174);
    expect(nameMap.get("Snackbar Vape - Peach Passion Fruit 2g")).toBe(242);
    expect(nameMap.get("Snackbar Vape - Cherry Pomegranate Lemon 2g")).toBe(
      266
    );
    expect(nameMap.get("Hijnx Sampler Medley Bag")).toBe(11198);
  });

  it("maps Shooter SKUs correctly", async () => {
    const buffer = await buildMetrcBuffer([
      row({
        Tag: "T1",
        Item: "Hijnx Beverage: Triple Citrus RSO Shooter - 2oz",
        Quantity: 50,
      }),
      row({
        Tag: "T2",
        Item: "Hijnx Beverage: Watermelon RSO Shooter - 2oz",
        Quantity: 60,
      }),
      row({
        Tag: "T3",
        Item: "Hijnx Beverage: Blue Razz RSO Shooter - 2oz",
        Quantity: 70,
      }),
    ]);
    const result = await parseMetrcExport(buffer);
    const nameMap = new Map(result.items.map(i => [i.skuName, i.available]));

    expect(nameMap.get("Hijnx Shooter - Triple Citrus 2oz")).toBe(50);
    expect(nameMap.get("Hijnx Shooter - Watermelon 2oz")).toBe(60);
    expect(nameMap.get("Hijnx Shooter - Sour Blue Razz 2oz")).toBe(70);
  });

  // ─── Quantity Aggregation ───────────────────────────────────────────

  it("sums quantities across multiple tags of the same SKU", async () => {
    const buffer = await buildMetrcBuffer([
      row({
        Tag: "TAG001",
        Item: "Hijnx Gummy RSO 100mg Space Chunks",
        Quantity: 100,
      }),
      row({
        Tag: "TAG002",
        Item: "Hijnx Gummy RSO 100mg Space Chunks",
        Quantity: 250,
      }),
      row({
        Tag: "TAG003",
        Item: "Hijnx Gummy RSO 100mg Space Chunks",
        Quantity: 150,
      }),
    ]);
    const result = await parseMetrcExport(buffer);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].skuName).toBe("Alpha Chunk - 2pk");
    expect(result.items[0].available).toBe(500);
    expect(result.items[0].tags).toHaveLength(3);
  });

  // ─── WIP vs Available Separation ────────────────────────────────────

  it("marks items in EO Curing Room as WIP", async () => {
    const buffer = await buildMetrcBuffer([
      row({ Tag: "T1", Location: "Product Ready For Sale", Quantity: 300 }),
      row({ Tag: "T2", Location: "EO Curing Room", Quantity: 200 }),
    ]);
    const result = await parseMetrcExport(buffer);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].available).toBe(300);
    expect(result.items[0].wip).toBe(200);
  });

  it("marks items without TestPassed lab status as WIP", async () => {
    const buffer = await buildMetrcBuffer([
      row({ Tag: "T1", "Lab Test Status": "TestPassed", Quantity: 100 }),
      row({
        Tag: "T2",
        "Lab Test Status": "SubmittedForTesting",
        Quantity: 50,
      }),
      row({ Tag: "T3", "Lab Test Status": "", Quantity: 25 }),
    ]);
    const result = await parseMetrcExport(buffer);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].available).toBe(100);
    expect(result.items[0].wip).toBe(75);
  });

  it("marks EO Vault items with TestPassed as available", async () => {
    const buffer = await buildMetrcBuffer([
      row({
        Tag: "T1",
        Location: "EO Vault",
        "Lab Test Status": "TestPassed",
        Quantity: 500,
      }),
    ]);
    const result = await parseMetrcExport(buffer);
    expect(result.items[0].available).toBe(500);
    expect(result.items[0].wip).toBe(0);
  });

  // ─── Exclusion Rules ────────────────────────────────────────────────

  it("excludes Concentrate (Bulk) category", async () => {
    const buffer = await buildMetrcBuffer([
      row({
        Category: "Concentrate (Bulk)",
        Item: "Some Distillate",
        Quantity: 1000,
      }),
      row({ Quantity: 100 }),
    ]);
    const result = await parseMetrcExport(buffer);
    expect(result.items).toHaveLength(1);
    expect(result.excludedRows).toBe(1);
  });

  it("excludes Topical and Tincture categories", async () => {
    const buffer = await buildMetrcBuffer([
      row({
        Category: "Topical (Final Form)",
        Item: "Pain Cream",
        Quantity: 50,
      }),
      row({
        Category: "Tincture (Final Form)",
        Item: "CBD Tincture",
        Quantity: 30,
      }),
      row({ Quantity: 100 }),
    ]);
    const result = await parseMetrcExport(buffer);
    expect(result.items).toHaveLength(1);
    expect(result.excludedRows).toBe(2);
  });

  it("excludes Pheotera brand items", async () => {
    const buffer = await buildMetrcBuffer([
      row({ Item: "Pheotera Pain Stick 100mg", Quantity: 20 }),
      row({ Item: "Pheotera Lubricant 50mg", Quantity: 10 }),
      row({ Quantity: 100 }),
    ]);
    const result = await parseMetrcExport(buffer);
    expect(result.items).toHaveLength(1);
    expect(result.excludedRows).toBe(2);
  });

  it("excludes items not in included locations", async () => {
    const buffer = await buildMetrcBuffer([
      row({ Location: "EO Concentrate Cabinet", Quantity: 500 }),
      row({ Location: "Some Other Room", Quantity: 200 }),
      row({ Location: "Product Ready For Sale", Quantity: 100 }),
    ]);
    const result = await parseMetrcExport(buffer);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].available).toBe(100);
    expect(result.excludedRows).toBe(2);
  });

  it("excludes gram-based UOM items (raw materials)", async () => {
    const buffer = await buildMetrcBuffer([
      row({ "Unit Of Measure": "g", Quantity: 5000 }),
      row({ "Unit Of Measure": "Each", Quantity: 100 }),
    ]);
    const result = await parseMetrcExport(buffer);
    expect(result.items).toHaveLength(1);
    expect(result.excludedRows).toBe(1);
  });

  // ─── Unmatched Rows ─────────────────────────────────────────────────

  it("uses the METRC item name for included items without a known SKU mapping", async () => {
    const buffer = await buildMetrcBuffer([
      row({ Item: "Unknown Product XYZ", Quantity: 42 }),
    ]);
    const result = await parseMetrcExport(buffer);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].skuName).toBe("Unknown Product XYZ");
    expect(result.items[0].available).toBe(42);
    expect(result.unmatchedRows).toHaveLength(0);
  });

  it("tracks blank unmatched items with reason", async () => {
    const buffer = await buildMetrcBuffer([row({ Item: "", Quantity: 42 })]);
    const result = await parseMetrcExport(buffer);
    expect(result.items).toHaveLength(0);
    expect(result.unmatchedRows).toHaveLength(1);
    expect(result.unmatchedRows[0].item).toBe("");
    expect(result.unmatchedRows[0].qty).toBe(42);
    expect(result.unmatchedRows[0].reason).toContain("No SKU mapping");
  });

  // ─── Row Count Consistency ──────────────────────────────────────────

  it("row counts are consistent (included + excluded + unmatched = total)", async () => {
    const buffer = await buildMetrcBuffer([
      row({ Quantity: 100 }),
      row({ Tag: "T2", Quantity: 200 }),
      row({ Category: "Concentrate (Bulk)", Quantity: 50 }),
      row({ Item: "", Quantity: 10 }),
      row({ Location: "EO Concentrate Cabinet", Quantity: 30 }),
    ]);
    const result = await parseMetrcExport(buffer);
    const accounted =
      result.includedRows + result.excludedRows + result.unmatchedRows.length;
    expect(accounted).toBe(result.totalRows);
  });

  // ─── Batch Name Fallback ────────────────────────────────────────────

  it("uses batch name keyword fallback for ambiguous items", async () => {
    const buffer = await buildMetrcBuffer([
      row({
        Item: "Hijnx Gummy RSO 100mg Space Chunks",
        "Production Batch Number": "CBD 2pk Batch 001",
        Quantity: 100,
      }),
    ]);
    const result = await parseMetrcExport(buffer);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].skuName).toBe("Alpha Chunk - 2pk");
  });

  // ─── Corrupted Sheet Range ──────────────────────────────────────────

  it("handles normal sheet range correctly", async () => {
    const buffer = await buildMetrcBuffer([
      row({ Tag: "TAG001", Quantity: 500 }),
    ]);
    const result = await parseMetrcExport(buffer);
    expect(result.totalRows).toBe(1);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].skuName).toBe("Alpha Chunk - 2pk");
    expect(result.items[0].available).toBe(500);
  });
});
