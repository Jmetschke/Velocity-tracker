/**
 * Tests for the data validation layer.
 * Covers all three validators: QuickBooks, METRC, and Inventory.
 */

import { describe, it, expect } from "vitest";
import { validateQuickBooks, validateMetrc, validateInventory } from "./data-validation";
import type { QBParseResult } from "./quickbooks-parser";
import type { MetrcParseResult } from "./metrc-parser";
import type { ParsedInventoryItem } from "./parsers";

// ─── Helpers ─────────────────────────────────────────────────────────

function makeQBResult(overrides: Partial<QBParseResult> = {}): QBParseResult {
  return {
    items: [],
    unmatchedRows: [],
    excludedRows: [],
    months: ["Jan 2026", "Feb 2026"],
    partialMonths: [],
    totalRows: 0,
    csvForAI: "",
    ...overrides,
  };
}

function makeMetrcResult(overrides: Partial<MetrcParseResult> = {}): MetrcParseResult {
  return {
    items: [],
    unmatchedRows: [],
    totalRows: 0,
    includedRows: 0,
    excludedRows: 0,
    ...overrides,
  };
}

function makeInvItem(overrides: Partial<ParsedInventoryItem> = {}): ParsedInventoryItem {
  return {
    rawName: "Test Item",
    fullName: "Test Item",
    qtyInInventory: 100,
    qtyOnHold: 0,
    totalQty: 100,
    triggerPoint: 50,
    ...overrides,
  };
}

// ─── QuickBooks Validation ──────────────────────────────────────────

describe("validateQuickBooks", () => {
  it("returns valid with no issues for clean data", () => {
    const result = validateQuickBooks(makeQBResult({
      items: [{
        qbName: "OG alpha 2pk", skuName: "Alpha Chunk - 2pk",
        monthlyData: [
          { month: "Jan 2026", quantity: 100, amount: 500, avgPrice: 5, cogs: 200, grossMargin: 300 },
          { month: "Feb 2026", quantity: 120, amount: 600, avgPrice: 5, cogs: 240, grossMargin: 360 },
        ],
        totalQuantity: 220, totalAmount: 1100,
      }],
    }));
    expect(result.valid).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it("flags ERROR when total column differs from sum by > 5%", () => {
    const result = validateQuickBooks(makeQBResult({
      items: [{
        qbName: "OG alpha 2pk", skuName: "Alpha Chunk - 2pk",
        monthlyData: [
          { month: "Jan 2026", quantity: 100, amount: 500, avgPrice: 5, cogs: 200, grossMargin: 300 },
        ],
        totalQuantity: 200, // sum is 100, diff is 100%
        totalAmount: 1000,
      }],
    }));
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.code === "QB_TOTAL_MISMATCH")).toBe(true);
  });

  it("flags WARNING when total column differs from sum by 1-5%", () => {
    const result = validateQuickBooks(makeQBResult({
      items: [{
        qbName: "OG alpha 2pk", skuName: "Alpha Chunk - 2pk",
        monthlyData: [
          { month: "Jan 2026", quantity: 98, amount: 490, avgPrice: 5, cogs: 196, grossMargin: 294 },
        ],
        totalQuantity: 100, // diff is 2%
        totalAmount: 500,
      }],
    }));
    expect(result.valid).toBe(true);
    expect(result.issues.some((i) => i.code === "QB_TOTAL_DRIFT")).toBe(true);
  });

  it("flags ERROR for negative quantities", () => {
    const result = validateQuickBooks(makeQBResult({
      items: [{
        qbName: "OG alpha 2pk", skuName: "Alpha Chunk - 2pk",
        monthlyData: [
          { month: "Jan 2026", quantity: -50, amount: -250, avgPrice: 5, cogs: -100, grossMargin: -150 },
        ],
        totalQuantity: -50, totalAmount: -250,
      }],
    }));
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.code === "QB_NEGATIVE_QTY")).toBe(true);
  });

  it("flags WARNING for fractional quantities on edible products", () => {
    const result = validateQuickBooks(makeQBResult({
      items: [{
        qbName: "OG alpha 2pk", skuName: "Alpha Chunk - 2pk",
        monthlyData: [
          { month: "Jan 2026", quantity: 100.5, amount: 502.5, avgPrice: 5, cogs: 201, grossMargin: 301.5 },
        ],
        totalQuantity: 100.5, totalAmount: 502.5,
      }],
    }));
    expect(result.valid).toBe(true);
    expect(result.issues.some((i) => i.code === "QB_FRACTIONAL_EDIBLE")).toBe(true);
  });

  it("does NOT flag fractional quantities on vape products", () => {
    const result = validateQuickBooks(makeQBResult({
      items: [{
        qbName: "Grape Crush 1g Vape", skuName: "Snackbar Vape - Grape Crush 1g",
        monthlyData: [
          { month: "Jan 2026", quantity: 100.5, amount: 2010, avgPrice: 20, cogs: 800, grossMargin: 1210 },
        ],
        totalQuantity: 100.5, totalAmount: 2010,
      }],
    }));
    expect(result.issues.some((i) => i.code === "QB_FRACTIONAL_EDIBLE")).toBe(false);
  });

  it("flags ERROR for duplicate SKU mappings", () => {
    const result = validateQuickBooks(makeQBResult({
      items: [
        {
          qbName: "OG alpha 2pk", skuName: "Alpha Chunk - 2pk",
          monthlyData: [{ month: "Jan 2026", quantity: 50, amount: 250, avgPrice: 5, cogs: 100, grossMargin: 150 }],
          totalQuantity: 50, totalAmount: 250,
        },
        {
          qbName: "Alpha OG 2-pack", skuName: "Alpha Chunk - 2pk",
          monthlyData: [{ month: "Jan 2026", quantity: 30, amount: 150, avgPrice: 5, cogs: 60, grossMargin: 90 }],
          totalQuantity: 30, totalAmount: 150,
        },
      ],
    }));
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.code === "QB_DUPLICATE_SKU")).toBe(true);
  });

  it("flags WARNING for partial month with anomalously high volume", () => {
    const result = validateQuickBooks(makeQBResult({
      months: ["Jan 2026", "Feb 2026", "Mar 1-10, 2026"],
      partialMonths: ["Mar 1-10, 2026"],
      items: [{
        qbName: "OG alpha 2pk", skuName: "Alpha Chunk - 2pk",
        monthlyData: [
          { month: "Jan 2026", quantity: 100, amount: 500, avgPrice: 5, cogs: 200, grossMargin: 300 },
          { month: "Feb 2026", quantity: 110, amount: 550, avgPrice: 5, cogs: 220, grossMargin: 330 },
          { month: "Mar 1-10, 2026", quantity: 200, amount: 1000, avgPrice: 5, cogs: 400, grossMargin: 600 },
        ],
        totalQuantity: 410, totalAmount: 2050,
      }],
    }));
    expect(result.valid).toBe(true);
    expect(result.issues.some((i) => i.code === "QB_PARTIAL_MONTH_HIGH")).toBe(true);
  });

  it("does NOT flag partial month with normal volume", () => {
    const result = validateQuickBooks(makeQBResult({
      months: ["Jan 2026", "Feb 2026", "Mar 1-10, 2026"],
      partialMonths: ["Mar 1-10, 2026"],
      items: [{
        qbName: "OG alpha 2pk", skuName: "Alpha Chunk - 2pk",
        monthlyData: [
          { month: "Jan 2026", quantity: 100, amount: 500, avgPrice: 5, cogs: 200, grossMargin: 300 },
          { month: "Feb 2026", quantity: 110, amount: 550, avgPrice: 5, cogs: 220, grossMargin: 330 },
          { month: "Mar 1-10, 2026", quantity: 30, amount: 150, avgPrice: 5, cogs: 60, grossMargin: 90 },
        ],
        totalQuantity: 240, totalAmount: 1200,
      }],
    }));
    expect(result.issues.some((i) => i.code === "QB_PARTIAL_MONTH_HIGH")).toBe(false);
  });

  it("skips total mismatch check when both total and sum are zero", () => {
    const result = validateQuickBooks(makeQBResult({
      items: [{
        qbName: "OG alpha 2pk", skuName: "Alpha Chunk - 2pk",
        monthlyData: [],
        totalQuantity: 0, totalAmount: 0,
      }],
    }));
    expect(result.issues.some((i) => i.code === "QB_TOTAL_MISMATCH" || i.code === "QB_TOTAL_DRIFT")).toBe(false);
  });
});

// ─── METRC Validation ───────────────────────────────────────────────

describe("validateMetrc", () => {
  it("returns valid with no issues for clean data", () => {
    const result = validateMetrc(makeMetrcResult({
      items: [
        { skuName: "Alpha Chunk - 2pk", available: 100, wip: 20, tags: ["TAG001", "TAG002"] },
      ],
      totalRows: 10,
      includedRows: 2,
    }));
    expect(result.valid).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it("flags ERROR for duplicate package tags across SKUs", () => {
    const result = validateMetrc(makeMetrcResult({
      items: [
        { skuName: "Alpha Chunk - 2pk", available: 50, wip: 0, tags: ["TAG001"] },
        { skuName: "Chill Chunk - 2pk", available: 30, wip: 0, tags: ["TAG001"] },
      ],
    }));
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.code === "METRC_DUPLICATE_TAG")).toBe(true);
  });

  it("flags ERROR for negative total quantity", () => {
    const result = validateMetrc(makeMetrcResult({
      items: [
        { skuName: "Alpha Chunk - 2pk", available: -10, wip: 5, tags: ["TAG001"] },
      ],
    }));
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.code === "METRC_NEGATIVE_QTY")).toBe(true);
  });

  it("flags WARNING for zero total quantity", () => {
    const result = validateMetrc(makeMetrcResult({
      items: [
        { skuName: "Alpha Chunk - 2pk", available: 0, wip: 0, tags: ["TAG001"] },
      ],
    }));
    expect(result.valid).toBe(true);
    expect(result.issues.some((i) => i.code === "METRC_ZERO_QTY")).toBe(true);
  });

  it("flags INFO (not warning) for WIP > 10x available — normal production cycle", () => {
    const result = validateMetrc(makeMetrcResult({
      items: [
        { skuName: "Alpha Chunk - 2pk", available: 10, wip: 150, tags: ["TAG001"] },
      ],
    }));
    expect(result.valid).toBe(true);
    const wipIssue = result.issues.find((i) => i.code === "METRC_WIP_ANOMALY");
    expect(wipIssue).toBeDefined();
    expect(wipIssue!.severity).toBe("info");
  });

  it("does NOT flag WIP anomaly when available is zero", () => {
    const result = validateMetrc(makeMetrcResult({
      items: [
        { skuName: "Alpha Chunk - 2pk", available: 0, wip: 500, tags: ["TAG001"] },
      ],
    }));
    expect(result.issues.some((i) => i.code === "METRC_WIP_ANOMALY")).toBe(false);
  });

  it("flags WARNING for high unmatched row percentage", () => {
    const result = validateMetrc(makeMetrcResult({
      items: [
        { skuName: "Alpha Chunk - 2pk", available: 50, wip: 0, tags: ["TAG001"] },
      ],
      unmatchedRows: [
        { item: "Unknown 1", qty: 10, reason: "No mapping" },
        { item: "Unknown 2", qty: 20, reason: "No mapping" },
        { item: "Unknown 3", qty: 30, reason: "No mapping" },
      ],
    }));
    expect(result.valid).toBe(true);
    // 3 unmatched out of 4 total = 75%
    expect(result.issues.some((i) => i.code === "METRC_HIGH_UNMATCHED")).toBe(true);
  });

  it("does NOT flag unmatched when percentage is low", () => {
    const result = validateMetrc(makeMetrcResult({
      items: [
        { skuName: "Alpha Chunk - 2pk", available: 50, wip: 0, tags: ["TAG001", "TAG002", "TAG003", "TAG004", "TAG005"] },
      ],
      unmatchedRows: [
        { item: "Unknown 1", qty: 10, reason: "No mapping" },
      ],
    }));
    // 1 unmatched out of 6 total = 16.7%
    expect(result.issues.some((i) => i.code === "METRC_HIGH_UNMATCHED")).toBe(false);
  });

  it("skips duplicate tag check for empty tags", () => {
    const result = validateMetrc(makeMetrcResult({
      items: [
        { skuName: "Alpha Chunk - 2pk", available: 50, wip: 0, tags: ["", ""] },
      ],
    }));
    expect(result.issues.some((i) => i.code === "METRC_DUPLICATE_TAG")).toBe(false);
  });
});

// ─── Inventory Validation ───────────────────────────────────────────

describe("validateInventory", () => {
  const dbSkus = [
    { id: 1, name: "Alpha Chunk - 2pk" },
    { id: 2, name: "Alpha Chunk - 1pk" },
    { id: 3, name: "Chill Chunk - 2pk" },
    { id: 4, name: "Rex Chunk - 2pk" },
  ];

  it("returns valid with no issues for clean data", () => {
    const items = [
      makeInvItem({ fullName: "Alpha Chunk - 2pk", qtyInInventory: 100, totalQty: 100 }),
      makeInvItem({ fullName: "Chill Chunk - 2pk", qtyInInventory: 80, totalQty: 80 }),
    ];
    const result = validateInventory(items, dbSkus);
    expect(result.valid).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it("flags WARNING for ambiguous SKU matches", () => {
    // "Alpha Chunk" matches both "Alpha Chunk - 2pk" and "Alpha Chunk - 1pk"
    const items = [
      makeInvItem({ fullName: "Alpha Chunk", qtyInInventory: 100, totalQty: 100 }),
    ];
    const result = validateInventory(items, dbSkus);
    expect(result.valid).toBe(true);
    expect(result.issues.some((i) => i.code === "INV_AMBIGUOUS_MATCH")).toBe(true);
  });

  it("flags WARNING for quantity outliers", () => {
    const items = [
      makeInvItem({ fullName: "Alpha Chunk - 2pk", qtyInInventory: 100, totalQty: 100 }),
      makeInvItem({ fullName: "Chill Chunk - 2pk", qtyInInventory: 80, totalQty: 80 }),
      makeInvItem({ fullName: "Rex Chunk - 2pk", qtyInInventory: 90, totalQty: 90 }),
      makeInvItem({ fullName: "Outlier Item", qtyInInventory: 50000, totalQty: 50000 }),
    ];
    const result = validateInventory(items, dbSkus);
    expect(result.valid).toBe(true);
    expect(result.issues.some((i) => i.code === "INV_QTY_OUTLIER")).toBe(true);
  });

  it("does NOT flag outlier when all quantities are similar", () => {
    const items = [
      makeInvItem({ fullName: "Alpha Chunk - 2pk", qtyInInventory: 100, totalQty: 100 }),
      makeInvItem({ fullName: "Chill Chunk - 2pk", qtyInInventory: 120, totalQty: 120 }),
      makeInvItem({ fullName: "Rex Chunk - 2pk", qtyInInventory: 90, totalQty: 90 }),
    ];
    const result = validateInventory(items, dbSkus);
    expect(result.issues.some((i) => i.code === "INV_QTY_OUTLIER")).toBe(false);
  });

  it("flags ERROR for negative quantities", () => {
    const items = [
      makeInvItem({ fullName: "Alpha Chunk - 2pk", qtyInInventory: -10, totalQty: -10 }),
    ];
    const result = validateInventory(items, dbSkus);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.code === "INV_NEGATIVE_QTY")).toBe(true);
  });

  it("flags ERROR when hold qty exceeds total", () => {
    const items = [
      makeInvItem({ fullName: "Alpha Chunk - 2pk", qtyInInventory: 50, qtyOnHold: 200, totalQty: 100 }),
    ];
    const result = validateInventory(items, dbSkus);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.code === "INV_HOLD_EXCEEDS_TOTAL")).toBe(true);
  });

  it("does NOT flag hold exceeds total when total is zero", () => {
    const items = [
      makeInvItem({ fullName: "Alpha Chunk - 2pk", qtyInInventory: 0, qtyOnHold: 5, totalQty: 0 }),
    ];
    const result = validateInventory(items, dbSkus);
    expect(result.issues.some((i) => i.code === "INV_HOLD_EXCEEDS_TOTAL")).toBe(false);
  });

  it("handles empty items array gracefully", () => {
    const result = validateInventory([], dbSkus);
    expect(result.valid).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it("handles multiple errors in the same file", () => {
    const items = [
      makeInvItem({ fullName: "Alpha Chunk - 2pk", qtyInInventory: -10, totalQty: -10 }),
      makeInvItem({ fullName: "Chill Chunk - 2pk", qtyInInventory: 50, qtyOnHold: 200, totalQty: 100 }),
    ];
    const result = validateInventory(items, dbSkus);
    expect(result.valid).toBe(false);
    expect(result.errorCount).toBe(2);
  });
});

// ─── Cross-cutting ──────────────────────────────────────────────────

describe("ValidationResult structure", () => {
  it("buildResult correctly counts errors and warnings", () => {
    const result = validateQuickBooks(makeQBResult({
      items: [
        {
          qbName: "OG alpha 2pk", skuName: "Alpha Chunk - 2pk",
          monthlyData: [
            { month: "Jan 2026", quantity: -50, amount: -250, avgPrice: 5, cogs: -100, grossMargin: -150 },
            { month: "Feb 2026", quantity: 100.5, amount: 502.5, avgPrice: 5, cogs: 201, grossMargin: 301.5 },
          ],
          totalQuantity: 50.5, totalAmount: 252.5,
        },
      ],
    }));
    // Should have: QB_NEGATIVE_QTY (error) + QB_FRACTIONAL_EDIBLE (warning)
    expect(result.errorCount).toBeGreaterThanOrEqual(1);
    expect(result.warningCount).toBeGreaterThanOrEqual(1);
    expect(result.errorCount + result.warningCount).toBe(result.issues.length);
  });

  it("valid is true when only warnings exist", () => {
    const result = validateMetrc(makeMetrcResult({
      items: [
        { skuName: "Alpha Chunk - 2pk", available: 0, wip: 0, tags: ["TAG001"] },
      ],
    }));
    expect(result.valid).toBe(true);
    expect(result.warningCount).toBeGreaterThan(0);
  });
});
