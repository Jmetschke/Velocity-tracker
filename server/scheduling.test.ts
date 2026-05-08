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

describe("addBusinessDays", () => {
  it("adds 5 business days skipping weekends", () => {
    // Monday March 10, 2026
    const monday = new Date(2026, 2, 10);
    const result = addBusinessDays(monday, 5);
    // Day 1: Tue Mar 11, Day 2: Wed Mar 12, Day 3: Thu Mar 13, Day 4: Fri Mar 14
    // Sat Mar 15 skipped, Sun Mar 16 skipped
    // Day 5: Mon Mar 17
    expect(result.getDay()).not.toBe(0);
    expect(result.getDay()).not.toBe(6);
    expect(result.getDate()).toBe(17);
    expect(result.getMonth()).toBe(2);
  });

  it("handles starting on Friday", () => {
    const friday = new Date(2026, 2, 13);
    const result = addBusinessDays(friday, 5);
    expect(result.getDate()).toBe(20);
    expect(result.getDay()).toBe(5);
  });

  it("adds 0 business days returns same date", () => {
    const monday = new Date(2026, 2, 10);
    const result = addBusinessDays(monday, 0);
    expect(result.getDate()).toBe(10);
  });
});

describe("nextBusinessDay", () => {
  it("returns same day if already a weekday", () => {
    const wednesday = new Date(2026, 2, 11);
    const result = nextBusinessDay(wednesday);
    expect(result.getDate()).toBe(11);
  });

  it("returns Monday for Saturday", () => {
    const saturday = new Date(2026, 2, 14);
    const result = nextBusinessDay(saturday);
    expect(result.getDay()).toBe(1);
    expect(result.getDate()).toBe(16);
  });

  it("returns Monday for Sunday", () => {
    const sunday = new Date(2026, 2, 15);
    const result = nextBusinessDay(sunday);
    expect(result.getDay()).toBe(1);
    expect(result.getDate()).toBe(16);
  });
});

describe("calculateParLevel", () => {
  it("calculates par as velocity * buffer days", () => {
    expect(calculateParLevel(100, 14)).toBe(1400);
  });

  it("rounds up to nearest integer", () => {
    expect(calculateParLevel(33.3, 14)).toBe(467);
  });

  it("returns 0 for zero velocity", () => {
    expect(calculateParLevel(0, 14)).toBe(0);
  });
});

describe("getISOWeek", () => {
  it("returns correct week for March 10, 2026 (Week 11)", () => {
    const date = new Date(2026, 2, 10);
    const { week, year } = getISOWeek(date);
    expect(week).toBe(11);
    expect(year).toBe(2026);
  });

  it("returns correct week for Jan 1, 2026", () => {
    const date = new Date(2026, 0, 1);
    const { week, year } = getISOWeek(date);
    expect(week).toBe(1);
    expect(year).toBe(2026);
  });

  it("returns correct week for Dec 31, 2025", () => {
    const date = new Date(2025, 11, 31);
    const { week, year } = getISOWeek(date);
    // Dec 31, 2025 is a Wednesday, ISO week 1 of 2026
    expect(week).toBe(1);
    expect(year).toBe(2026);
  });
});

describe("getWeekStartDate / getWeekEndDate", () => {
  it("returns Monday for week 11, 2026", () => {
    const monday = getWeekStartDate(11, 2026);
    expect(monday.getDay()).toBe(1); // Monday
    expect(monday.getDate()).toBe(9);
    expect(monday.getMonth()).toBe(2); // March
  });

  it("returns Friday for week 11, 2026", () => {
    const friday = getWeekEndDate(11, 2026);
    expect(friday.getDay()).toBe(5); // Friday
    expect(friday.getDate()).toBe(13);
    expect(friday.getMonth()).toBe(2); // March
  });
});

describe("generateScheduleSuggestions", () => {
  const baseDate = new Date(2026, 2, 10); // Monday March 10

  const makeInput = (overrides: Partial<SkuScheduleInput> = {}): SkuScheduleInput => ({
    skuId: 1,
    skuName: "Test SKU",
    currentStock: 500,
    wipStock: 0,
    dailyVelocity: 50,
    parLevel: 700,
    netBatchSize: 7125,
    leadTimeDays: 5,
    ...overrides,
  });

  it("flags SKU below par as warning", () => {
    const input = makeInput({ currentStock: 500, parLevel: 700 });
    const results = generateScheduleSuggestions([input], baseDate);
    expect(results).toHaveLength(1);
    expect(results[0].urgency).toBe("warning");
    expect(results[0].deficit).toBe(200);
    expect(results[0].adjustedDeficit).toBe(200);
    expect(results[0].batchesNeeded).toBe(1);
  });

  it("flags SKU at critical when stock <= lead time days of velocity", () => {
    const input = makeInput({
      currentStock: 200,
      dailyVelocity: 50,
      parLevel: 700,
      leadTimeDays: 5,
    });
    const results = generateScheduleSuggestions([input], baseDate);
    expect(results[0].urgency).toBe("critical");
  });

  it("marks SKU as ok when above par", () => {
    const input = makeInput({ currentStock: 1000, parLevel: 700 });
    const results = generateScheduleSuggestions([input], baseDate);
    expect(results[0].urgency).toBe("ok");
    expect(results[0].batchesNeeded).toBe(0);
  });

  it("calculates correct number of batches needed", () => {
    const input = makeInput({
      currentStock: 0,
      parLevel: 15000,
      netBatchSize: 7125,
    });
    const results = generateScheduleSuggestions([input], baseDate);
    expect(results[0].batchesNeeded).toBe(3);
  });

  it("sorts by urgency: critical first, then warning, then ok", () => {
    const inputs = [
      makeInput({ skuId: 1, skuName: "OK SKU", currentStock: 1000, parLevel: 700 }),
      makeInput({ skuId: 2, skuName: "Critical SKU", currentStock: 100, dailyVelocity: 50, parLevel: 700 }),
      makeInput({ skuId: 3, skuName: "Warning SKU", currentStock: 500, parLevel: 700 }),
    ];
    const results = generateScheduleSuggestions(inputs, baseDate);
    expect(results[0].urgency).toBe("critical");
    expect(results[1].urgency).toBe("warning");
    expect(results[2].urgency).toBe("ok");
  });

  it("includes zero-velocity SKUs as ok with no batches needed", () => {
    const input = makeInput({ dailyVelocity: 0 });
    const results = generateScheduleSuggestions([input], baseDate);
    expect(results).toHaveLength(1);
    expect(results[0].urgency).toBe("ok");
    expect(results[0].dailyVelocity).toBe(0);
    expect(results[0].daysUntilStockout).toBe(Infinity);
    expect(results[0].batchesNeeded).toBe(0);
    expect(results[0].deficit).toBe(0);
  });

  it("suggested start date is a business day", () => {
    const saturday = new Date(2026, 2, 14);
    const input = makeInput({ currentStock: 100, parLevel: 700 });
    const results = generateScheduleSuggestions([input], saturday);
    const startDay = results[0].suggestedStartDate.getDay();
    expect(startDay).not.toBe(0);
    expect(startDay).not.toBe(6);
  });

  // ─── Committed Batches Tests ─────────────────────────────────────
  it("subtracts committed quantity from deficit", () => {
    const input = makeInput({
      currentStock: 500,
      parLevel: 1000,
      committedQuantity: 400,
      netBatchSize: 7125,
    });
    const results = generateScheduleSuggestions([input], baseDate);
    expect(results[0].deficit).toBe(500);
    expect(results[0].committedQuantity).toBe(400);
    expect(results[0].adjustedDeficit).toBe(100); // 500 - 400
    expect(results[0].batchesNeeded).toBe(1); // ceil(100/7125) = 1
  });

  it("marks SKU as ok when committed batches cover the deficit", () => {
    const input = makeInput({
      currentStock: 500,
      parLevel: 1000,
      committedQuantity: 600, // more than the 500 deficit
      netBatchSize: 7125,
    });
    const results = generateScheduleSuggestions([input], baseDate);
    expect(results[0].adjustedDeficit).toBe(0);
    expect(results[0].batchesNeeded).toBe(0);
    expect(results[0].urgency).toBe("ok");
  });

  it("still shows critical urgency even with committed batches if stock is dangerously low", () => {
    const input = makeInput({
      currentStock: 100,
      dailyVelocity: 50,
      parLevel: 1000,
      committedQuantity: 500, // covers some deficit but stock is still critical
      leadTimeDays: 5,
    });
    const results = generateScheduleSuggestions([input], baseDate);
    // daysUntilStockout = 100/50 = 2, which is <= 5
    expect(results[0].urgency).toBe("critical");
    expect(results[0].adjustedDeficit).toBe(400); // 900 - 500
  });

  it("includes calendarWeek and calendarYear in results", () => {
    const input = makeInput({ currentStock: 500, parLevel: 700 });
    const results = generateScheduleSuggestions([input], baseDate);
    expect(results[0].calendarWeek).toBeDefined();
    expect(results[0].calendarYear).toBe(2026);
    expect(results[0].calendarWeek).toBe(11);
  });

  it("handles zero committed quantity same as no committed", () => {
    const input = makeInput({
      currentStock: 500,
      parLevel: 700,
      committedQuantity: 0,
    });
    const results = generateScheduleSuggestions([input], baseDate);
    expect(results[0].committedQuantity).toBe(0);
    expect(results[0].adjustedDeficit).toBe(200);
  });

  // ─── WIP / Projected Stock Tests ─────────────────────────────────
  it("uses projected stock (available + WIP) for stockout calculation", () => {
    const input = makeInput({
      currentStock: 396,
      wipStock: 7123,
      dailyVelocity: 50,
      parLevel: 700,
    });
    const results = generateScheduleSuggestions([input], baseDate);
    // projectedStock = 396 + 7123 = 7519
    expect(results[0].currentStock).toBe(396);
    expect(results[0].wipStock).toBe(7123);
    expect(results[0].projectedStock).toBe(7519);
    // daysUntilStockout = floor(7519 / 50) = 150
    expect(results[0].daysUntilStockout).toBe(150);
    // 7519 > 700 par, so no deficit
    expect(results[0].urgency).toBe("ok");
    expect(results[0].batchesNeeded).toBe(0);
  });

  it("WIP prevents false critical when available stock is low", () => {
    const input = makeInput({
      currentStock: 80,
      wipStock: 5151,
      dailyVelocity: 50,
      parLevel: 700,
      leadTimeDays: 5,
    });
    const results = generateScheduleSuggestions([input], baseDate);
    // Without WIP: 80/50 = 1.6 days → critical
    // With WIP: (80+5151)/50 = 104 days → ok
    expect(results[0].projectedStock).toBe(5231);
    expect(results[0].daysUntilStockout).toBe(104);
    expect(results[0].urgency).toBe("ok");
  });

  it("deficit is calculated against projected stock, not just available", () => {
    const input = makeInput({
      currentStock: 200,
      wipStock: 300,
      parLevel: 700,
      dailyVelocity: 50,
    });
    const results = generateScheduleSuggestions([input], baseDate);
    // projected = 500, par = 700, deficit = 200
    expect(results[0].projectedStock).toBe(500);
    expect(results[0].deficit).toBe(200);
    expect(results[0].urgency).toBe("warning");
  });

  it("zero WIP behaves same as no WIP", () => {
    const withZero = makeInput({ currentStock: 500, wipStock: 0, parLevel: 700 });
    const withUndefined = makeInput({ currentStock: 500, parLevel: 700 });
    delete (withUndefined as any).wipStock;
    const r1 = generateScheduleSuggestions([withZero], baseDate);
    const r2 = generateScheduleSuggestions([withUndefined], baseDate);
    expect(r1[0].projectedStock).toBe(r2[0].projectedStock);
    expect(r1[0].daysUntilStockout).toBe(r2[0].daysUntilStockout);
    expect(r1[0].deficit).toBe(r2[0].deficit);
  });
});
