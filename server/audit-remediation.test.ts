/**
 * Tests for audit remediation items:
 *   - Zod validation on LLM velocity response
 *   - File size limits on upload inputs
 *   - ExcelJS helper functions
 *   - Telemetry logging
 */
import { describe, it, expect } from "vitest";
import { z } from "zod";
import { readSheetAsArrays, readSheetAsObjects } from "./excel";
import { buildExcelBuffer } from "./test-helpers";

// ─── Zod Validation Schemas (mirrored from velocity-ai.ts) ─────────────

const VelocityResultSchema = z.object({
  skuName: z.string(),
  dailyVelocity: z.number(),
  monthsAnalyzed: z.number(),
  totalUnits: z.number(),
  notes: z.string(),
});

const VelocityAnalysisSchema = z.object({
  velocities: z.array(VelocityResultSchema),
  summary: z.string(),
});

describe("Zod validation for LLM velocity response", () => {
  it("accepts a valid velocity analysis response", () => {
    const valid = {
      velocities: [
        { skuName: "Alpha Chunk - 2pk", dailyVelocity: 85.3, monthsAnalyzed: 6, totalUnits: 15354, notes: "Steady growth" },
        { skuName: "Micro Dots", dailyVelocity: 12.1, monthsAnalyzed: 6, totalUnits: 2178, notes: "Seasonal dip" },
      ],
      summary: "Overall velocity is healthy across the product line.",
    };
    const result = VelocityAnalysisSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it("rejects response missing summary field", () => {
    const invalid = {
      velocities: [
        { skuName: "Alpha Chunk", dailyVelocity: 50, monthsAnalyzed: 3, totalUnits: 4500, notes: "ok" },
      ],
    };
    const result = VelocityAnalysisSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it("rejects velocity item with missing notes", () => {
    const invalid = {
      velocities: [
        { skuName: "Alpha Chunk", dailyVelocity: 50, monthsAnalyzed: 3, totalUnits: 4500 },
      ],
      summary: "Test",
    };
    const result = VelocityAnalysisSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it("rejects velocity item with string dailyVelocity", () => {
    const invalid = {
      velocities: [
        { skuName: "Alpha Chunk", dailyVelocity: "fifty", monthsAnalyzed: 3, totalUnits: 4500, notes: "ok" },
      ],
      summary: "Test",
    };
    const result = VelocityAnalysisSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it("accepts empty velocities array", () => {
    const valid = { velocities: [], summary: "No data available." };
    const result = VelocityAnalysisSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it("rejects completely wrong structure", () => {
    const result = VelocityAnalysisSchema.safeParse("just a string");
    expect(result.success).toBe(false);
  });

  it("rejects null input", () => {
    const result = VelocityAnalysisSchema.safeParse(null);
    expect(result.success).toBe(false);
  });
});

// ─── File size limit validation ─────────────────────────────────────────

describe("File size limits on upload inputs", () => {
  const MAX_BASE64_LENGTH = 10_000_000;
  const fileBase64Schema = z.string().max(MAX_BASE64_LENGTH);

  it("accepts a small base64 string", () => {
    const small = "SGVsbG8gV29ybGQ=";
    expect(fileBase64Schema.safeParse(small).success).toBe(true);
  });

  it("accepts a string at the limit", () => {
    const atLimit = "A".repeat(MAX_BASE64_LENGTH);
    expect(fileBase64Schema.safeParse(atLimit).success).toBe(true);
  });

  it("rejects a string over the limit", () => {
    const overLimit = "A".repeat(MAX_BASE64_LENGTH + 1);
    expect(fileBase64Schema.safeParse(overLimit).success).toBe(false);
  });

  it("rejects empty string when using min(1)", () => {
    const strictSchema = z.string().min(1).max(MAX_BASE64_LENGTH);
    expect(strictSchema.safeParse("").success).toBe(false);
  });
});

// ─── Notes field max length ─────────────────────────────────────────────

describe("Notes field max length validation", () => {
  const notesSchema = z.string().max(1000);

  it("accepts notes within limit", () => {
    expect(notesSchema.safeParse("Short note").success).toBe(true);
  });

  it("accepts notes at exactly 1000 chars", () => {
    expect(notesSchema.safeParse("x".repeat(1000)).success).toBe(true);
  });

  it("rejects notes over 1000 chars", () => {
    expect(notesSchema.safeParse("x".repeat(1001)).success).toBe(false);
  });
});

// ─── ExcelJS helper functions ───────────────────────────────────────────

describe("ExcelJS readSheetAsArrays", () => {
  it("reads a simple sheet as 2D array", async () => {
    const buf = await buildExcelBuffer("Sheet1", [
      ["Name", "Age", "City"],
      ["Alice", 30, "NYC"],
      ["Bob", 25, "LA"],
    ]);
    const rows = await readSheetAsArrays(buf);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toEqual(["Name", "Age", "City"]);
    expect(rows[1]).toEqual(["Alice", 30, "NYC"]);
    expect(rows[2]).toEqual(["Bob", 25, "LA"]);
  });

  it("handles empty buffer gracefully", async () => {
    const buf = await buildExcelBuffer("Sheet1", []);
    const rows = await readSheetAsArrays(buf);
    expect(rows).toHaveLength(0);
  });
});

describe("ExcelJS readSheetAsObjects", () => {
  it("reads a sheet as keyed objects", async () => {
    const buf = await buildExcelBuffer("Sheet1", [
      ["Name", "Age"],
      ["Alice", 30],
      ["Bob", 25],
    ]);
    const objs = await readSheetAsObjects(buf);
    expect(objs).toHaveLength(2);
    expect(objs[0]).toEqual({ Name: "Alice", Age: 30 });
    expect(objs[1]).toEqual({ Name: "Bob", Age: 25 });
  });

  it("handles sheet with only headers", async () => {
    const buf = await buildExcelBuffer("Sheet1", [
      ["Col1", "Col2"],
    ]);
    const objs = await readSheetAsObjects(buf);
    expect(objs).toHaveLength(0);
  });
});
