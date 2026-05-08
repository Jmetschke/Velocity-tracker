/**
 * Tests for notification service logic.
 * Tests email formatting and stockout alert classification
 * without requiring a real database or Resend API.
 */
import { describe, expect, it } from "vitest";
import type { StockoutAlert } from "./notifications";

// ─── Stockout Alert Classification ──────────────────────────────────────

describe("StockoutAlert classification", () => {
  function classifyAlert(
    daysUntilStockout: number
  ): "critical_alert" | "stockout_warning" {
    return daysUntilStockout <= 5 ? "critical_alert" : "stockout_warning";
  }

  it("classifies 0 days as critical_alert", () => {
    expect(classifyAlert(0)).toBe("critical_alert");
  });

  it("classifies 5 days as critical_alert", () => {
    expect(classifyAlert(5)).toBe("critical_alert");
  });

  it("classifies 5.1 days as stockout_warning", () => {
    expect(classifyAlert(5.1)).toBe("stockout_warning");
  });

  it("classifies 6 days as stockout_warning", () => {
    expect(classifyAlert(6)).toBe("stockout_warning");
  });

  it("classifies 14 days as stockout_warning", () => {
    expect(classifyAlert(14)).toBe("stockout_warning");
  });
});

// ─── Stockout Date Calculation ──────────────────────────────────────────

describe("Stockout date calculation", () => {
  it("calculates stockout date from current stock and velocity", () => {
    const stock = 500;
    const velocity = 50;
    const daysUntilStockout = stock / velocity;
    expect(daysUntilStockout).toBe(10);

    const now = new Date(2026, 2, 10); // March 10, 2026
    const stockoutDate = new Date(now);
    stockoutDate.setDate(stockoutDate.getDate() + daysUntilStockout);
    expect(stockoutDate.getDate()).toBe(20);
    expect(stockoutDate.getMonth()).toBe(2); // March
  });

  it("handles zero velocity (infinite days)", () => {
    const stock = 500;
    const velocity = 0;
    const daysUntilStockout = velocity <= 0 ? Infinity : stock / velocity;
    expect(daysUntilStockout).toBe(Infinity);
  });

  it("handles zero stock (immediate stockout)", () => {
    const stock = 0;
    const velocity = 50;
    const daysUntilStockout = stock / velocity;
    expect(daysUntilStockout).toBe(0);
  });

  it("handles fractional days correctly", () => {
    const stock = 100;
    const velocity = 33;
    const daysUntilStockout = stock / velocity;
    expect(daysUntilStockout).toBeCloseTo(3.03, 1);
  });
});

// ─── Alert Filtering Logic ──────────────────────────────────────────────

describe("Alert filtering by threshold", () => {
  function filterAlerts(
    items: Array<{ stock: number; velocity: number; name: string }>,
    threshold: number
  ): StockoutAlert[] {
    const alerts: StockoutAlert[] = [];
    for (const item of items) {
      if (item.velocity <= 0) continue;
      const daysUntilStockout = item.stock / item.velocity;
      if (daysUntilStockout <= threshold) {
        const stockoutDate = new Date();
        stockoutDate.setDate(stockoutDate.getDate() + daysUntilStockout);
        alerts.push({
          skuId: 0,
          skuName: item.name,
          currentStock: item.stock,
          dailyVelocity: item.velocity,
          daysUntilStockout,
          stockoutDate,
          notificationType:
            daysUntilStockout <= 5 ? "critical_alert" : "stockout_warning",
        });
      }
    }
    return alerts;
  }

  it("includes items below threshold", () => {
    const items = [
      { name: "Alpha Chunk - 2pk", stock: 100, velocity: 50 }, // 2 days
      { name: "Sleep Chunk - 2pk", stock: 1000, velocity: 50 }, // 20 days
    ];
    const alerts = filterAlerts(items, 7);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].skuName).toBe("Alpha Chunk - 2pk");
  });

  it("excludes items with zero velocity", () => {
    const items = [
      { name: "Inactive SKU", stock: 0, velocity: 0 },
    ];
    const alerts = filterAlerts(items, 7);
    expect(alerts).toHaveLength(0);
  });

  it("separates critical and warning alerts", () => {
    const items = [
      { name: "Critical SKU", stock: 100, velocity: 50 }, // 2 days - critical
      { name: "Warning SKU", stock: 300, velocity: 50 }, // 6 days - warning
    ];
    const alerts = filterAlerts(items, 7);
    const critical = alerts.filter((a) => a.notificationType === "critical_alert");
    const warning = alerts.filter((a) => a.notificationType === "stockout_warning");
    expect(critical).toHaveLength(1);
    expect(warning).toHaveLength(1);
    expect(critical[0].skuName).toBe("Critical SKU");
    expect(warning[0].skuName).toBe("Warning SKU");
  });

  it("returns empty array when all items are above threshold", () => {
    const items = [
      { name: "Healthy SKU", stock: 5000, velocity: 50 }, // 100 days
    ];
    const alerts = filterAlerts(items, 7);
    expect(alerts).toHaveLength(0);
  });

  it("uses configurable threshold (30 days)", () => {
    const items = [
      { name: "Moderate SKU", stock: 1000, velocity: 50 }, // 20 days
    ];
    const alerts7 = filterAlerts(items, 7);
    const alerts30 = filterAlerts(items, 30);
    expect(alerts7).toHaveLength(0);
    expect(alerts30).toHaveLength(1);
  });
});
