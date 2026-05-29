/**
 * Production scheduling engine.
 * Business rules:
 * - No production on weekends (Saturday=6, Sunday=0)
 * - Batches take 5 business days from start to sellable
 * - Par level = daily velocity × buffer days (default 14)
 * - 5% loss factor is already baked into net batch sizes
 */

export interface SkuScheduleInput {
  skuId: number;
  skuName: string;
  currentStock: number;   // available (sellable) stock
  wipStock?: number;       // units in testing/curing (not yet sellable)
  dailyVelocity: number;
  parLevel: number;
  netBatchSize: number;
  leadTimeDays: number;
  committedQuantity?: number; // total units already committed in planned/in_progress batches
  scheduledStartDate?: Date;   // date from an existing production calendar batch
}

export interface ScheduleSuggestion {
  skuId: number;
  skuName: string;
  currentStock: number;    // available (sellable) stock
  wipStock: number;        // units in testing/curing
  projectedStock: number;  // currentStock + wipStock
  dailyVelocity: number;
  parLevel: number;
  deficit: number;
  committedQuantity: number;
  adjustedDeficit: number; // deficit minus committed quantity
  daysUntilStockout: number; // based on projectedStock
  batchesNeeded: number;
  batchSize: number;
  suggestedStartDate: Date;
  suggestedEndDate: Date;
  urgency: "critical" | "warning" | "ok";
  calendarWeek: number;
  calendarYear: number;
}

/** Add N business days to a date (skipping weekends). */
export function addBusinessDays(start: Date, days: number): Date {
  const result = new Date(start);
  let added = 0;
  while (added < days) {
    result.setDate(result.getDate() + 1);
    const dow = result.getDay();
    if (dow !== 0 && dow !== 6) {
      added++;
    }
  }
  return result;
}

/** Get the next business day on or after the given date. */
export function nextBusinessDay(date: Date): Date {
  const result = new Date(date);
  while (result.getDay() === 0 || result.getDay() === 6) {
    result.setDate(result.getDate() + 1);
  }
  return result;
}

/** Calculate days until stockout (including weekends as selling days). */
function daysUntilStockout(stock: number, velocity: number): number {
  if (velocity <= 0) return Infinity;
  return Math.floor(stock / velocity);
}

/** Generate production schedule suggestions for all SKUs. */
export function generateScheduleSuggestions(
  skuInputs: SkuScheduleInput[],
  asOfDate: Date = new Date()
): ScheduleSuggestion[] {
  const suggestions: ScheduleSuggestion[] = [];

  for (const sku of skuInputs) {
    const { skuId, skuName, currentStock, dailyVelocity, parLevel, netBatchSize, leadTimeDays } = sku;
    const wip = sku.wipStock ?? 0;
    const projected = currentStock + wip;

    const committed = sku.committedQuantity ?? 0;
    const stockoutDays = daysUntilStockout(projected, dailyVelocity);
    const deficit = parLevel - projected;
    const adjustedDeficit = Math.max(0, deficit - committed);
    const startDate = sku.scheduledStartDate ?? nextBusinessDay(asOfDate);
    const endDate = addBusinessDays(startDate, leadTimeDays);
    const { week, year } = getISOWeek(startDate);

    // SKUs with zero velocity: include in list but show as no-data / ok
    if (dailyVelocity <= 0) {
      suggestions.push({
        skuId,
        skuName,
        currentStock,
        wipStock: wip,
        projectedStock: projected,
        dailyVelocity: 0,
        parLevel,
        deficit: 0,
        committedQuantity: committed,
        adjustedDeficit: 0,
        daysUntilStockout: Infinity,
        batchesNeeded: 0,
        batchSize: netBatchSize,
        suggestedStartDate: sku.scheduledStartDate ?? asOfDate,
        suggestedEndDate: sku.scheduledStartDate ? endDate : asOfDate,
        urgency: "ok",
        calendarWeek: week,
        calendarYear: year,
      });
      continue;
    }

    let urgency: "critical" | "warning" | "ok" = "ok";
    if (projected <= 0 || stockoutDays <= leadTimeDays) {
      urgency = "critical";
    } else if (adjustedDeficit > 0) {
      urgency = "warning";
    }

    if (adjustedDeficit <= 0 && deficit <= 0) {
      // On track - no deficit even before committed batches
      suggestions.push({
        skuId,
        skuName,
        currentStock,
        wipStock: wip,
        projectedStock: projected,
        dailyVelocity,
        parLevel,
        deficit: 0,
        committedQuantity: committed,
        adjustedDeficit: 0,
        daysUntilStockout: stockoutDays,
        batchesNeeded: 0,
        batchSize: netBatchSize,
        suggestedStartDate: sku.scheduledStartDate ?? asOfDate,
        suggestedEndDate: sku.scheduledStartDate ? endDate : asOfDate,
        urgency: "ok",
        calendarWeek: week,
        calendarYear: year,
      });
      continue;
    }

    const batchesNeeded = adjustedDeficit > 0 ? Math.ceil(adjustedDeficit / netBatchSize) : 0;

    suggestions.push({
      skuId,
      skuName,
      currentStock,
      wipStock: wip,
      projectedStock: projected,
      dailyVelocity,
      parLevel,
      deficit: Math.max(0, deficit),
      committedQuantity: committed,
      adjustedDeficit,
      daysUntilStockout: stockoutDays,
      batchesNeeded,
      batchSize: netBatchSize,
      suggestedStartDate: startDate,
      suggestedEndDate: endDate,
      urgency: adjustedDeficit <= 0 ? "ok" : urgency,
      calendarWeek: week,
      calendarYear: year,
    });
  }

  // Sort by nearest stockout first, then apply urgency as the existing tie-breaker.
  const urgencyOrder = { critical: 0, warning: 1, ok: 2 };
  suggestions.sort(
    (a, b) =>
      a.daysUntilStockout - b.daysUntilStockout ||
      urgencyOrder[a.urgency] - urgencyOrder[b.urgency]
  );

  return suggestions;
}

/** Calculate par level from velocity and buffer days. */
export function calculateParLevel(dailyVelocity: number, bufferDays: number): number {
  return Math.ceil(dailyVelocity * bufferDays);
}

/** Get ISO week number and year for a date. */
export function getISOWeek(date: Date): { week: number; year: number } {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7; // Make Sunday = 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum); // Set to nearest Thursday
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return { week: weekNo, year: d.getUTCFullYear() };
}

/** Get the Monday start date for a given ISO week and year. */
export function getWeekStartDate(week: number, year: number): Date {
  // Jan 4 is always in ISO week 1
  const jan4 = new Date(year, 0, 4);
  const dayOfWeek = jan4.getDay() || 7; // Mon=1 ... Sun=7
  const monday = new Date(jan4);
  monday.setDate(jan4.getDate() - dayOfWeek + 1); // Monday of week 1
  monday.setDate(monday.getDate() + (week - 1) * 7); // Monday of target week
  return monday;
}

/** Get the Friday end date for a given ISO week and year. */
export function getWeekEndDate(week: number, year: number): Date {
  const monday = getWeekStartDate(week, year);
  const friday = new Date(monday);
  friday.setDate(monday.getDate() + 4);
  return friday;
}
