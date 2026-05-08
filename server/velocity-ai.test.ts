/**
 * Tests for the shared velocity-ai module.
 * Covers: type structure, JSON schema shape, and exported interface contracts.
 * (The actual LLM call is not tested here — that's an integration concern.)
 */
import { describe, it, expect } from "vitest";
import type { VelocityResult, VelocityAnalysis } from "./velocity-ai";

describe("Velocity AI types", () => {
  it("VelocityResult has all required fields", () => {
    const result: VelocityResult = {
      skuName: "Alpha Chunk (2pk)",
      dailyVelocity: 42.5,
      monthsAnalyzed: 3,
      totalUnits: 3825,
      notes: "Steady growth over Q4",
    };
    expect(result.skuName).toBe("Alpha Chunk (2pk)");
    expect(result.dailyVelocity).toBe(42.5);
    expect(result.monthsAnalyzed).toBe(3);
    expect(result.totalUnits).toBe(3825);
    expect(result.notes).toBeTruthy();
  });

  it("VelocityAnalysis wraps velocities with a summary", () => {
    const analysis: VelocityAnalysis = {
      velocities: [
        {
          skuName: "Chill Chunk (1pk)",
          dailyVelocity: 10,
          monthsAnalyzed: 3,
          totalUnits: 900,
          notes: "Consistent",
        },
      ],
      summary: "Overall stable demand",
    };
    expect(analysis.velocities).toHaveLength(1);
    expect(analysis.summary).toBe("Overall stable demand");
  });

  it("VelocityAnalysis handles empty velocities array", () => {
    const analysis: VelocityAnalysis = {
      velocities: [],
      summary: "No matching SKUs found in sales data",
    };
    expect(analysis.velocities).toHaveLength(0);
    expect(analysis.summary).toBeTruthy();
  });

  it("VelocityResult handles zero velocity", () => {
    const result: VelocityResult = {
      skuName: "Discontinued SKU",
      dailyVelocity: 0,
      monthsAnalyzed: 0,
      totalUnits: 0,
      notes: "No sales data found",
    };
    expect(result.dailyVelocity).toBe(0);
    expect(result.monthsAnalyzed).toBe(0);
  });

  it("VelocityResult handles fractional velocities", () => {
    const result: VelocityResult = {
      skuName: "Snackbar Vape - Grape Crush",
      dailyVelocity: 0.73,
      monthsAnalyzed: 3,
      totalUnits: 66,
      notes: "Low volume vape product",
    };
    expect(result.dailyVelocity).toBeCloseTo(0.73);
  });
});

describe("Velocity AI JSON schema contract", () => {
  // Simulate what the LLM would return and verify it parses correctly
  it("parses a valid LLM response", () => {
    const rawJson = JSON.stringify({
      velocities: [
        { skuName: "Alpha Chunk (2pk)", dailyVelocity: 42.5, monthsAnalyzed: 3, totalUnits: 3825, notes: "Growing" },
        { skuName: "Sleep Chunk (1pk)", dailyVelocity: 15.2, monthsAnalyzed: 3, totalUnits: 1368, notes: "Stable" },
      ],
      summary: "Two SKUs analyzed, both healthy",
    });

    const parsed: VelocityAnalysis = JSON.parse(rawJson);
    expect(parsed.velocities).toHaveLength(2);
    expect(parsed.velocities[0].skuName).toBe("Alpha Chunk (2pk)");
    expect(parsed.velocities[1].dailyVelocity).toBe(15.2);
    expect(parsed.summary).toContain("Two SKUs");
  });

  it("handles empty response gracefully", () => {
    const parsed: VelocityAnalysis = JSON.parse("{}");
    expect(parsed.velocities ?? []).toEqual([]);
  });

  it("handles malformed JSON by throwing", () => {
    expect(() => JSON.parse("not json")).toThrow();
  });
});
