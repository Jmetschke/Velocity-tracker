/**
 * Tests for the client-side What-If recalculation engine.
 * We import directly from the source file since it's pure TypeScript with no React deps.
 */
import { describe, it, expect } from "vitest";
import { recalcRow, applyBulkAdjustment, type WhatIfRow } from "../client/src/lib/what-if-calc";

// ─── Helper ─────────────────────────────────────────────────────────

function makeRow(overrides: Partial<Record<string, number>> = {}): WhatIfRow {
  return recalcRow(
    overrides.skuId ?? 1,
    "Test SKU",
    overrides.currentStock ?? 500,
    overrides.originalVelocity ?? 10,
    overrides.adjustedVelocity ?? 10,
    overrides.netBatchSize ?? 950,
    overrides.leadTimeDays ?? 5,
    overrides.committedQuantity ?? 0,
    overrides.bufferDays ?? 14,
    overrides.wipStock ?? 0,
  );
}

// ─── recalcRow ──────────────────────────────────────────────────────

describe("recalcRow", () => {
  it("calculates par level as velocity * bufferDays (ceiling)", () => {
    const row = recalcRow(1, "A", 500, 10, 10, 950, 5, 0, 14);
    expect(row.originalParLevel).toBe(140); // ceil(10 * 14)
    expect(row.adjustedParLevel).toBe(140);
  });

  it("calculates days to stockout as floor(stock / velocity)", () => {
    const row = recalcRow(1, "A", 500, 10, 10, 950, 5, 0, 14);
    expect(row.originalDaysToStockout).toBe(50);
    expect(row.adjustedDaysToStockout).toBe(50);
  });

  it("returns Infinity for days to stockout when velocity is 0", () => {
    const row = recalcRow(1, "A", 500, 0, 0, 950, 5, 0, 14);
    expect(row.originalDaysToStockout).toBe(Infinity);
    expect(row.adjustedDaysToStockout).toBe(Infinity);
  });

  it("returns Infinity for days to stockout when velocity is negative", () => {
    const row = recalcRow(1, "A", 500, -5, -5, 950, 5, 0, 14);
    expect(row.originalDaysToStockout).toBe(Infinity);
    expect(row.adjustedDaysToStockout).toBe(Infinity);
  });

  it("calculates deficit as max(0, parLevel - stock - committed)", () => {
    // par = ceil(10 * 14) = 140, stock = 100, committed = 0 → deficit = 40
    const row = recalcRow(1, "A", 100, 10, 10, 950, 5, 0, 14);
    expect(row.adjustedDeficit).toBe(40);
  });

  it("deficit is 0 when stock exceeds par level", () => {
    // par = 140, stock = 500 → deficit = 0
    const row = recalcRow(1, "A", 500, 10, 10, 950, 5, 0, 14);
    expect(row.adjustedDeficit).toBe(0);
  });

  it("committed quantity reduces deficit", () => {
    // par = 140, stock = 100 → raw deficit = 40, committed = 50 → adjusted deficit = 0
    const row = recalcRow(1, "A", 100, 10, 10, 950, 5, 50, 14);
    expect(row.adjustedDeficit).toBe(0);
  });

  it("calculates batches needed as ceil(deficit / batchSize)", () => {
    // par = ceil(50 * 14) = 700, stock = 100 → deficit = 600, batches = ceil(600/950) = 1
    const row = recalcRow(1, "A", 100, 50, 50, 950, 5, 0, 14);
    expect(row.adjustedBatchesNeeded).toBe(1);
  });

  it("batches needed is 0 when no deficit", () => {
    const row = recalcRow(1, "A", 500, 10, 10, 950, 5, 0, 14);
    expect(row.adjustedBatchesNeeded).toBe(0);
  });

  it("batches needed is 0 when batchSize is 0", () => {
    const row = recalcRow(1, "A", 100, 50, 50, 0, 5, 0, 14);
    expect(row.adjustedBatchesNeeded).toBe(0);
  });

  it("urgency is critical when stock is 0", () => {
    const row = recalcRow(1, "A", 0, 10, 10, 950, 5, 0, 14);
    expect(row.urgency).toBe("critical");
  });

  it("urgency is critical when days to stockout <= lead time", () => {
    // stock = 20, velocity = 10 → stockout in 2 days, lead time = 5 → critical
    const row = recalcRow(1, "A", 20, 10, 10, 950, 5, 0, 14);
    expect(row.adjustedDaysToStockout).toBe(2);
    expect(row.urgency).toBe("critical");
  });

  it("urgency is warning when deficit > 0 but not critical", () => {
    // stock = 100, velocity = 10, buffer = 14 → par = 140, deficit = 40
    // stockout = 10 days > lead time 5 → not critical, but deficit > 0 → warning
    const row = recalcRow(1, "A", 100, 10, 10, 950, 5, 0, 14);
    expect(row.urgency).toBe("warning");
  });

  it("urgency is ok when stock > par level", () => {
    const row = recalcRow(1, "A", 500, 10, 10, 950, 5, 0, 14);
    expect(row.urgency).toBe("ok");
  });

  it("velocity delta is 0 when no change", () => {
    const row = recalcRow(1, "A", 500, 10, 10, 950, 5, 0, 14);
    expect(row.velocityDelta).toBe(0);
  });

  it("velocity delta is positive when velocity increases", () => {
    const row = recalcRow(1, "A", 500, 10, 15, 950, 5, 0, 14);
    expect(row.velocityDelta).toBe(50); // (15-10)/10 * 100 = 50%
  });

  it("velocity delta is negative when velocity decreases", () => {
    const row = recalcRow(1, "A", 500, 10, 7, 950, 5, 0, 14);
    expect(row.velocityDelta).toBe(-30); // (7-10)/10 * 100 = -30%
  });

  it("velocity delta is 100 when original is 0 and adjusted > 0", () => {
    const row = recalcRow(1, "A", 500, 0, 5, 950, 5, 0, 14);
    expect(row.velocityDelta).toBe(100);
  });

  it("velocity delta is 0 when both original and adjusted are 0", () => {
    const row = recalcRow(1, "A", 500, 0, 0, 950, 5, 0, 14);
    expect(row.velocityDelta).toBe(0);
  });

  it("higher velocity increases par level and may increase deficit", () => {
    const original = recalcRow(1, "A", 200, 10, 10, 950, 5, 0, 14);
    const adjusted = recalcRow(1, "A", 200, 10, 20, 950, 5, 0, 14);
    expect(adjusted.adjustedParLevel).toBe(280); // ceil(20 * 14)
    expect(adjusted.adjustedParLevel).toBeGreaterThan(original.originalParLevel);
    expect(adjusted.adjustedDeficit).toBeGreaterThan(original.originalDeficit);
  });

  it("lower velocity decreases par level and may reduce deficit", () => {
    const original = recalcRow(1, "A", 100, 10, 10, 950, 5, 0, 14);
    const adjusted = recalcRow(1, "A", 100, 10, 5, 950, 5, 0, 14);
    expect(adjusted.adjustedParLevel).toBe(70); // ceil(5 * 14)
    expect(adjusted.adjustedDeficit).toBeLessThan(original.adjustedDeficit);
  });

  it("handles fractional velocities correctly", () => {
    const row = recalcRow(1, "A", 500, 3.7, 3.7, 950, 5, 0, 14);
    expect(row.originalParLevel).toBe(52); // ceil(3.7 * 14) = ceil(51.8) = 52
    expect(row.originalDaysToStockout).toBe(135); // floor(500 / 3.7) = 135
  });

  it("passes through input fields unchanged", () => {
    const row = recalcRow(42, "Test", 999, 10, 15, 800, 7, 100, 21, 500);
    expect(row.skuId).toBe(42);
    expect(row.skuName).toBe("Test");
    expect(row.currentStock).toBe(999);
    expect(row.wipStock).toBe(500);
    expect(row.projectedStock).toBe(1499);
    expect(row.originalVelocity).toBe(10);
    expect(row.adjustedVelocity).toBe(15);
    expect(row.netBatchSize).toBe(800);
    expect(row.leadTimeDays).toBe(7);
    expect(row.committedQuantity).toBe(100);
    expect(row.bufferDays).toBe(21);
  });

  // ─── WIP / Projected Stock ──────────────────────────────────────
  it("projectedStock = currentStock + wipStock", () => {
    const row = recalcRow(1, "A", 396, 50, 50, 950, 5, 0, 14, 7123);
    expect(row.currentStock).toBe(396);
    expect(row.wipStock).toBe(7123);
    expect(row.projectedStock).toBe(7519);
  });

  it("uses projected stock for stockout calculation", () => {
    const row = recalcRow(1, "A", 100, 10, 10, 950, 5, 0, 14, 400);
    // projected = 500, stockout = floor(500/10) = 50
    expect(row.adjustedDaysToStockout).toBe(50);
  });

  it("uses projected stock for deficit calculation", () => {
    // par = 140, projected = 100 + 30 = 130, deficit = 10
    const row = recalcRow(1, "A", 100, 10, 10, 950, 5, 0, 14, 30);
    expect(row.projectedStock).toBe(130);
    expect(row.adjustedDeficit).toBe(10);
  });

  it("WIP prevents false critical when available stock is low", () => {
    // available = 20, wip = 480, projected = 500, velocity = 10
    // stockout = 50 days > lead time 5 → not critical
    const row = recalcRow(1, "A", 20, 10, 10, 950, 5, 0, 14, 480);
    expect(row.urgency).toBe("ok");
  });

  it("wipStock defaults to 0 when omitted", () => {
    const row = recalcRow(1, "A", 500, 10, 10, 950, 5, 0, 14);
    expect(row.wipStock).toBe(0);
    expect(row.projectedStock).toBe(500);
  });
});

// ─── applyBulkAdjustment ────────────────────────────────────────────

describe("applyBulkAdjustment", () => {
  function makeRows(): WhatIfRow[] {
    return [
      recalcRow(1, "Alpha", 500, 10, 10, 950, 5, 0, 14),
      recalcRow(2, "Beta", 200, 20, 20, 950, 5, 0, 14),
      recalcRow(3, "Gamma", 100, 5, 5, 950, 5, 0, 14),
    ];
  }

  it("applies positive percentage to all rows", () => {
    const result = applyBulkAdjustment(makeRows(), 50);
    expect(result[0].adjustedVelocity).toBe(15); // 10 * 1.5
    expect(result[1].adjustedVelocity).toBe(30); // 20 * 1.5
    expect(result[2].adjustedVelocity).toBe(7.5); // 5 * 1.5
  });

  it("applies negative percentage to all rows", () => {
    const result = applyBulkAdjustment(makeRows(), -30);
    expect(result[0].adjustedVelocity).toBe(7); // 10 * 0.7
    expect(result[1].adjustedVelocity).toBe(14); // 20 * 0.7
    expect(result[2].adjustedVelocity).toBe(3.5); // 5 * 0.7
  });

  it("0% change returns same velocities", () => {
    const result = applyBulkAdjustment(makeRows(), 0);
    expect(result[0].adjustedVelocity).toBe(10);
    expect(result[1].adjustedVelocity).toBe(20);
    expect(result[2].adjustedVelocity).toBe(5);
  });

  it("-100% clamps velocity to 0", () => {
    const result = applyBulkAdjustment(makeRows(), -100);
    result.forEach((r) => expect(r.adjustedVelocity).toBe(0));
  });

  it("beyond -100% still clamps to 0 (no negatives)", () => {
    const result = applyBulkAdjustment(makeRows(), -150);
    result.forEach((r) => expect(r.adjustedVelocity).toBe(0));
  });

  it("recalculates all derived fields after adjustment", () => {
    const result = applyBulkAdjustment(makeRows(), 100); // double velocity
    // Alpha: velocity 10 → 20, par = ceil(20*14) = 280, stock = 500 → deficit = 0
    expect(result[0].adjustedParLevel).toBe(280);
    expect(result[0].adjustedDeficit).toBe(0);
    // Beta: velocity 20 → 40, par = ceil(40*14) = 560, stock = 200 → deficit = 360
    expect(result[1].adjustedParLevel).toBe(560);
    expect(result[1].adjustedDeficit).toBe(360);
    expect(result[1].adjustedBatchesNeeded).toBe(1); // ceil(360/950)
  });

  it("preserves original velocities in the output rows", () => {
    const result = applyBulkAdjustment(makeRows(), 50);
    expect(result[0].originalVelocity).toBe(10);
    expect(result[1].originalVelocity).toBe(20);
    expect(result[2].originalVelocity).toBe(5);
  });

  it("handles empty array", () => {
    const result = applyBulkAdjustment([], 50);
    expect(result).toEqual([]);
  });

  it("handles row with 0 original velocity", () => {
    const rows = [recalcRow(1, "Zero", 500, 0, 0, 950, 5, 0, 14)];
    const result = applyBulkAdjustment(rows, 50);
    expect(result[0].adjustedVelocity).toBe(0); // 0 * 1.5 = 0
  });

  it("rounds adjusted velocity to 2 decimal places", () => {
    const rows = [recalcRow(1, "A", 500, 3, 3, 950, 5, 0, 14)];
    const result = applyBulkAdjustment(rows, 33); // 3 * 1.33 = 3.99
    expect(result[0].adjustedVelocity).toBe(3.99);
  });
});

// ─── Integration scenarios ──────────────────────────────────────────

describe("What-If scenarios", () => {
  it("holiday surge: +30% velocity increases batches needed", () => {
    // SKU with 200 stock, velocity 15, par = ceil(15*14) = 210, deficit = 10
    const baseline = recalcRow(1, "Alpha", 200, 15, 15, 950, 5, 0, 14);
    expect(baseline.adjustedBatchesNeeded).toBe(1); // ceil(10/950) = 1

    // +30%: velocity 19.5, par = ceil(19.5*14) = 273, deficit = 73
    const surge = recalcRow(1, "Alpha", 200, 15, 19.5, 950, 5, 0, 14);
    expect(surge.adjustedParLevel).toBe(273);
    expect(surge.adjustedDeficit).toBe(73);
    expect(surge.adjustedBatchesNeeded).toBe(1);
    expect(surge.adjustedDaysToStockout).toBe(10); // floor(200/19.5) = 10
  });

  it("new dispensary: doubling velocity on one SKU", () => {
    const baseline = recalcRow(1, "Chill Chunk", 300, 8, 8, 950, 5, 0, 14);
    const doubled = recalcRow(1, "Chill Chunk", 300, 8, 16, 950, 5, 0, 14);

    expect(doubled.adjustedParLevel).toBe(224); // ceil(16*14)
    expect(doubled.adjustedDaysToStockout).toBe(18); // floor(300/16)
    expect(doubled.velocityDelta).toBe(100); // doubled = +100%
    expect(baseline.urgency).toBe("ok"); // 300 > 112
    expect(doubled.urgency).toBe("ok"); // 300 > 224
  });

  it("slowdown: -50% velocity reduces urgency", () => {
    // Critical: stock 30, velocity 10, stockout in 3 days < lead time 5
    const critical = recalcRow(1, "Rex", 30, 10, 10, 950, 5, 0, 14);
    expect(critical.urgency).toBe("critical");

    // -50%: velocity 5, stockout in 6 days > lead time 5
    const slowdown = recalcRow(1, "Rex", 30, 10, 5, 950, 5, 0, 14);
    expect(slowdown.adjustedDaysToStockout).toBe(6);
    expect(slowdown.urgency).toBe("warning"); // deficit still > 0
  });

  it("committed batches offset deficit in what-if", () => {
    // par = ceil(20*14) = 280, stock = 100, raw deficit = 180, committed = 200 → 0
    const row = recalcRow(1, "Alpha", 100, 20, 20, 950, 5, 200, 14);
    expect(row.adjustedDeficit).toBe(0);
    expect(row.adjustedBatchesNeeded).toBe(0);
    expect(row.urgency).toBe("critical"); // stockout = floor(100/20) = 5 = lead time
  });

  it("WIP + committed batches together reduce urgency", () => {
    // available = 50, wip = 200, projected = 250, velocity = 10
    // par = 140, deficit = 0 (250 > 140), stockout = 25 days > lead 5
    const row = recalcRow(1, "Alpha", 50, 10, 10, 950, 5, 0, 14, 200);
    expect(row.projectedStock).toBe(250);
    expect(row.urgency).toBe("ok");
  });
});
