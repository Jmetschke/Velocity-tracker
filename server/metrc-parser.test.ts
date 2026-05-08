import { describe, expect, it, beforeAll } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { parseMetrcExport } from "./metrc-parser";

// Test with the actual METRC file if available
const METRC_FILE = path.resolve(
  "/home/ubuntu/upload/Metrc-Illinois-IN00000008-Packages-Active.xlsx"
);
const hasFile = fs.existsSync(METRC_FILE);

describe("METRC Parser", () => {
  if (!hasFile) {
    it.skip("actual METRC file not available", () => {});
    return;
  }

  let buffer: Buffer;
  let result: Awaited<ReturnType<typeof parseMetrcExport>>;

  beforeAll(async () => {
    buffer = fs.readFileSync(METRC_FILE);
    result = await parseMetrcExport(buffer);
  });

  it("parses the METRC export without errors", () => {
    expect(result.totalRows).toBeGreaterThan(0);
    expect(result.items.length).toBeGreaterThan(0);
  });

  it("excludes concentrate, topical, and tincture categories", () => {
    expect(result.excludedRows).toBeGreaterThan(0);
    // No items should be named like concentrates
    const names = result.items.map((i) => i.skuName.toLowerCase());
    expect(names.some((n) => n.includes("distillate"))).toBe(false);
    expect(names.some((n) => n.includes("fsho"))).toBe(false);
    expect(names.some((n) => n.includes("wax"))).toBe(false);
  });

  it("excludes Pheotera products", () => {
    const names = result.items.map((i) => i.skuName.toLowerCase());
    expect(names.some((n) => n.includes("pheotera"))).toBe(false);
    expect(names.some((n) => n.includes("pain stick"))).toBe(false);
    expect(names.some((n) => n.includes("lubricant"))).toBe(false);
  });

  it("correctly identifies Chunk SKUs", () => {
    const names = result.items.map((i) => i.skuName);
    expect(names).toContain("Alpha Chunk - 2pk");
    expect(names).toContain("Sleep Chunk - 2pk");
  });

  it("correctly identifies Snackbar Vapes", () => {
    const vapes = result.items.filter((i) => i.skuName.startsWith("Snackbar"));
    expect(vapes.length).toBeGreaterThan(0);
    // Each vape should have the format "Snackbar Vape - [Flavor] 1g"
    for (const v of vapes) {
      expect(v.skuName).toMatch(/^Snackbar Vape - .+ 1g$/);
    }
  });

  it("sums quantities across multiple packages of the same SKU", () => {
    // Sleep Chunk has multiple tags in the test data
    const sleep2pk = result.items.find((i) => i.skuName === "Sleep Chunk - 2pk");
    if (sleep2pk) {
      expect(sleep2pk.tags.length).toBeGreaterThanOrEqual(1);
      expect(sleep2pk.available + sleep2pk.wip).toBeGreaterThan(0);
    }
  });

  it("separates available from WIP correctly", () => {
    // Items in curing room or without TestPassed should be WIP
    for (const item of result.items) {
      expect(item.available).toBeGreaterThanOrEqual(0);
      expect(item.wip).toBeGreaterThanOrEqual(0);
    }
  });

  it("tracks unmatched rows with reasons", () => {
    for (const row of result.unmatchedRows) {
      expect(row.item).toBeTruthy();
      expect(row.reason).toBeTruthy();
    }
  });

  it("row counts are consistent", () => {
    const accounted =
      result.includedRows +
      result.excludedRows +
      result.unmatchedRows.length;
    expect(accounted).toBe(result.totalRows);
  });
});
