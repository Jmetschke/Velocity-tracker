/**
 * Client-side What-If recalculation engine.
 * Mirrors the server-side scheduling logic so the panel can update
 * instantly without round-tripping to the backend.
 */

export interface WhatIfRow {
  skuId: number;
  skuName: string;
  currentStock: number;    // available (sellable) stock
  wipStock: number;        // units in testing/curing
  projectedStock: number;  // currentStock + wipStock
  originalVelocity: number;
  adjustedVelocity: number;
  netBatchSize: number;
  leadTimeDays: number;
  committedQuantity: number;
  bufferDays: number;
  // Computed
  originalParLevel: number;
  adjustedParLevel: number;
  originalDaysToStockout: number;
  adjustedDaysToStockout: number;
  originalDeficit: number;
  adjustedDeficit: number;
  originalBatchesNeeded: number;
  adjustedBatchesNeeded: number;
  urgency: "critical" | "warning" | "ok";
  velocityDelta: number; // percentage change
}

function daysToStockout(stock: number, velocity: number): number {
  if (velocity <= 0) return Infinity;
  return Math.floor(stock / velocity);
}

function parLevel(velocity: number, bufferDays: number): number {
  return Math.ceil(velocity * bufferDays);
}

function batchesNeeded(deficit: number, batchSize: number): number {
  if (deficit <= 0 || batchSize <= 0) return 0;
  return Math.ceil(deficit / batchSize);
}

function urgencyLevel(
  stock: number,
  stockoutDays: number,
  adjustedDeficit: number,
  leadTimeDays: number,
): "critical" | "warning" | "ok" {
  if (stock <= 0 || stockoutDays <= leadTimeDays) return "critical";
  if (adjustedDeficit > 0) return "warning";
  return "ok";
}

/** Recalculate a single row with an adjusted velocity. */
export function recalcRow(
  skuId: number,
  skuName: string,
  currentStock: number,
  originalVelocity: number,
  adjustedVelocity: number,
  netBatchSize: number,
  leadTimeDays: number,
  committedQuantity: number,
  bufferDays: number,
  wipStock: number = 0,
): WhatIfRow {
  const projected = currentStock + wipStock;
  const origPar = parLevel(originalVelocity, bufferDays);
  const adjPar = parLevel(adjustedVelocity, bufferDays);

  const origStockout = daysToStockout(projected, originalVelocity);
  const adjStockout = daysToStockout(projected, adjustedVelocity);

  const origDeficit = Math.max(0, origPar - projected);
  const rawAdjDeficit = adjPar - projected;
  const adjDeficit = Math.max(0, rawAdjDeficit - committedQuantity);

  const origBatches = batchesNeeded(Math.max(0, origDeficit - committedQuantity), netBatchSize);
  const adjBatches = batchesNeeded(adjDeficit, netBatchSize);

  const delta = originalVelocity > 0
    ? ((adjustedVelocity - originalVelocity) / originalVelocity) * 100
    : adjustedVelocity > 0 ? 100 : 0;

  return {
    skuId,
    skuName,
    currentStock,
    wipStock,
    projectedStock: projected,
    originalVelocity,
    adjustedVelocity,
    netBatchSize,
    leadTimeDays,
    committedQuantity,
    bufferDays,
    originalParLevel: origPar,
    adjustedParLevel: adjPar,
    originalDaysToStockout: origStockout,
    adjustedDaysToStockout: adjStockout,
    originalDeficit: Math.max(0, origDeficit - committedQuantity),
    adjustedDeficit: adjDeficit,
    originalBatchesNeeded: origBatches,
    adjustedBatchesNeeded: adjBatches,
    urgency: urgencyLevel(projected, adjStockout, adjDeficit, leadTimeDays),
    velocityDelta: Math.round(delta * 10) / 10,
  };
}

/** Apply a percentage adjustment to all velocities. */
export function applyBulkAdjustment(
  rows: WhatIfRow[],
  percentChange: number,
): WhatIfRow[] {
  return rows.map((r) => {
    const newVelocity = Math.max(0, r.originalVelocity * (1 + percentChange / 100));
    return recalcRow(
      r.skuId, r.skuName, r.currentStock, r.originalVelocity,
      Math.round(newVelocity * 100) / 100,
      r.netBatchSize, r.leadTimeDays, r.committedQuantity, r.bufferDays,
      r.wipStock,
    );
  });
}
