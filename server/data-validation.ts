/**
 * Data Validation Layer for uploaded files.
 *
 * Validates parsed data from QuickBooks, METRC, and generic inventory uploads.
 * Issues are classified as "error" (blocks upload) or "warning" (informational).
 */

import type { QBParsedItem, QBParseResult } from "./quickbooks-parser";
import type { MetrcParsedItem, MetrcParseResult } from "./metrc-parser";
import type { ParsedInventoryItem } from "./parsers";

// ─── Types ───────────────────────────────────────────────────────────

export type IssueSeverity = "error" | "warning" | "info";

export interface ValidationIssue {
  severity: IssueSeverity;
  code: string;
  message: string;
  /** The item/row that triggered the issue, if applicable. */
  context?: string;
}

export interface ValidationResult {
  valid: boolean; // false if any errors exist
  issues: ValidationIssue[];
  errorCount: number;
  warningCount: number;
  infoCount: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────

function buildResult(issues: ValidationIssue[]): ValidationResult {
  const errorCount = issues.filter((i) => i.severity === "error").length;
  const warningCount = issues.filter((i) => i.severity === "warning").length;
  return {
    valid: errorCount === 0,
    issues,
    errorCount,
    warningCount,
    infoCount: issues.length - errorCount - warningCount,
  };
}

// Known edible SKU prefixes (vapes are expected to have fractional quantities)
const EDIBLE_SKU_PREFIXES = [
  "Alpha Chunk", "Chill Chunk", "Sleep Chunk", "Rex Chunk", "Zuul Chunk",
  "MiNi's Chunks", "Sugar Free MiNi's", "Micro Dots", "Whoopie Hi", "Hijnx Shooter",
];

function isEdibleSku(skuName: string): boolean {
  return EDIBLE_SKU_PREFIXES.some((p) => skuName.startsWith(p));
}

// ─── QuickBooks Validators ──────────────────────────────────────────

export function validateQuickBooks(result: QBParseResult): ValidationResult {
  const issues: ValidationIssue[] = [];

  // 1. Total column mismatch (ERROR if > 5%, WARNING if 1-5%)
  for (const item of result.items) {
    const sumQty = item.monthlyData.reduce((s, m) => s + m.quantity, 0);
    if (item.totalQuantity === 0 && sumQty === 0) continue;

    const diff = Math.abs(sumQty - item.totalQuantity);
    const pct = item.totalQuantity !== 0 ? (diff / Math.abs(item.totalQuantity)) * 100 : diff > 0 ? 100 : 0;

    if (pct > 5) {
      issues.push({
        severity: "error",
        code: "QB_TOTAL_MISMATCH",
        message: `Total column (${item.totalQuantity}) differs from sum of months (${Math.round(sumQty)}) by ${pct.toFixed(1)}%`,
        context: item.skuName,
      });
    } else if (pct > 1) {
      issues.push({
        severity: "warning",
        code: "QB_TOTAL_DRIFT",
        message: `Total column (${item.totalQuantity}) differs from sum of months (${Math.round(sumQty)}) by ${pct.toFixed(1)}% — likely rounding`,
        context: item.skuName,
      });
    }
  }

  // 2. Negative quantities (ERROR — indicates data corruption or unhandled returns)
  for (const item of result.items) {
    const negMonths = item.monthlyData.filter((m) => m.quantity < 0);
    if (negMonths.length > 0) {
      issues.push({
        severity: "error",
        code: "QB_NEGATIVE_QTY",
        message: `Negative quantities in: ${negMonths.map((m) => `${m.month} (${m.quantity})`).join(", ")}`,
        context: item.skuName,
      });
    }
  }

  // 3. Fractional quantities on edibles (WARNING — vapes are expected to be fractional)
  for (const item of result.items) {
    if (!isEdibleSku(item.skuName)) continue;
    const fractional = item.monthlyData.filter((m) => m.quantity !== Math.floor(m.quantity));
    if (fractional.length > 0) {
      issues.push({
        severity: "warning",
        code: "QB_FRACTIONAL_EDIBLE",
        message: `Fractional quantities on edible product: ${fractional.map((m) => `${m.month} (${m.quantity})`).join(", ")}`,
        context: item.skuName,
      });
    }
  }

  // 4. Duplicate SKU rows (ERROR — same SKU mapped from multiple QB names)
  const skuCounts = new Map<string, string[]>();
  for (const item of result.items) {
    const existing = skuCounts.get(item.skuName) ?? [];
    existing.push(item.qbName);
    skuCounts.set(item.skuName, existing);
  }
  for (const [sku, qbNames] of Array.from(skuCounts)) {
    if (qbNames.length > 1) {
      issues.push({
        severity: "error",
        code: "QB_DUPLICATE_SKU",
        message: `Multiple QB rows map to the same SKU: ${qbNames.map((n: string) => `"${n}"`).join(", ")}`,
        context: sku,
      });
    }
  }

  // 5. Partial month with anomalous volume (WARNING)
  if (result.partialMonths.length > 0) {
    for (const item of result.items) {
      for (const pm of result.partialMonths) {
        const partialData = item.monthlyData.find((m) => m.month === pm);
        if (!partialData || partialData.quantity === 0) continue;

        // Compare to average of full months
        const fullMonthData = item.monthlyData.filter((m) => !result.partialMonths.includes(m.month) && m.quantity > 0);
        if (fullMonthData.length < 2) continue;

        const avgFull = fullMonthData.reduce((s, m) => s + m.quantity, 0) / fullMonthData.length;
        if (avgFull > 0 && partialData.quantity > avgFull * 1.5) {
          issues.push({
            severity: "warning",
            code: "QB_PARTIAL_MONTH_HIGH",
            message: `Partial month "${pm}" has ${partialData.quantity} units, which exceeds the full-month average of ${Math.round(avgFull)} — verify this isn't a full month mislabeled`,
            context: item.skuName,
          });
        }
      }
    }
  }

  return buildResult(issues);
}

// ─── METRC Validators ───────────────────────────────────────────────

export function validateMetrc(result: MetrcParseResult): ValidationResult {
  const issues: ValidationIssue[] = [];

  // 1. Duplicate package tags (ERROR — same tag appearing in multiple rows)
  const allTags = new Map<string, string[]>();
  for (const item of result.items) {
    for (const tag of item.tags) {
      if (!tag) continue;
      const existing = allTags.get(tag) ?? [];
      existing.push(item.skuName);
      allTags.set(tag, existing);
    }
  }
  for (const [tag, skus] of Array.from(allTags)) {
    if (skus.length > 1) {
      const uniqueSkus = Array.from(new Set(skus));
      issues.push({
        severity: "error",
        code: "METRC_DUPLICATE_TAG",
        message: `Package tag "${tag}" appears under multiple SKUs: ${uniqueSkus.join(", ")}`,
        context: tag,
      });
    }
  }

  // 2. Negative or zero quantities (ERROR for negative, WARNING for zero)
  for (const item of result.items) {
    const total = item.available + item.wip;
    if (total < 0) {
      issues.push({
        severity: "error",
        code: "METRC_NEGATIVE_QTY",
        message: `Negative total quantity: available=${item.available}, wip=${item.wip}`,
        context: item.skuName,
      });
    } else if (total === 0) {
      issues.push({
        severity: "warning",
        code: "METRC_ZERO_QTY",
        message: `Zero total quantity (available=${item.available}, wip=${item.wip}) — may be fully depleted`,
        context: item.skuName,
      });
    }
  }

  // 3. WIP quantity anomaly (INFO — WIP > 10x available is normal during production/testing cycles)
  for (const item of result.items) {
    if (item.available > 0 && item.wip > item.available * 10) {
      issues.push({
        severity: "info",
        code: "METRC_WIP_ANOMALY",
        message: `WIP quantity (${item.wip}) is ${Math.round(item.wip / item.available)}x the available quantity (${item.available}) — likely in lab testing`,
        context: item.skuName,
      });
    }
  }

  // 4. High unmatched row count (WARNING if > 20% of included rows are unmatched)
  const matchedCount = result.items.reduce((s, i) => s + i.tags.length, 0);
  const unmatchedCount = result.unmatchedRows.length;
  if (matchedCount + unmatchedCount > 0) {
    const unmatchedPct = (unmatchedCount / (matchedCount + unmatchedCount)) * 100;
    if (unmatchedPct > 20) {
      issues.push({
        severity: "warning",
        code: "METRC_HIGH_UNMATCHED",
        message: `${unmatchedCount} of ${matchedCount + unmatchedCount} included rows (${unmatchedPct.toFixed(0)}%) could not be mapped to a SKU — review unmatched items`,
      });
    }
  }

  return buildResult(issues);
}

// ─── Inventory Validators ───────────────────────────────────────────

export function validateInventory(
  items: ParsedInventoryItem[],
  dbSkus: Array<{ id: number; name: string }>,
): ValidationResult {
  const issues: ValidationIssue[] = [];

  // 1. Ambiguous SKU matches (WARNING — parsed name could match multiple SKUs)
  // We check by running normalization and seeing if multiple SKUs are close
  for (const item of items) {
    const normalized = item.fullName.toLowerCase().replace(/\s+/g, " ").trim();
    const matches = dbSkus.filter((sku) => {
      const skuNorm = sku.name.toLowerCase().replace(/\s+/g, " ").trim();
      return normalized.includes(skuNorm) || skuNorm.includes(normalized);
    });
    if (matches.length > 1) {
      issues.push({
        severity: "warning",
        code: "INV_AMBIGUOUS_MATCH",
        message: `"${item.fullName}" could match multiple SKUs: ${matches.map((m) => m.name).join(", ")}`,
        context: item.fullName,
      });
    }
  }

  // 2. Quantity outliers (WARNING — qty > 10x median suggests data entry error)
  const quantities = items.map((i) => i.totalQty).filter((q) => q > 0).sort((a, b) => a - b);
  if (quantities.length >= 3) {
    const median = quantities[Math.floor(quantities.length / 2)];
    for (const item of items) {
      if (item.totalQty > median * 10 && item.totalQty > 1000) {
        issues.push({
          severity: "warning",
          code: "INV_QTY_OUTLIER",
          message: `Quantity ${item.totalQty} is ${Math.round(item.totalQty / median)}x the median (${median}) — verify this isn't a data entry error`,
          context: item.fullName,
        });
      }
    }
  }

  // 3. Negative quantities (ERROR)
  for (const item of items) {
    if (item.qtyInInventory < 0 || item.totalQty < 0) {
      issues.push({
        severity: "error",
        code: "INV_NEGATIVE_QTY",
        message: `Negative quantity: inventory=${item.qtyInInventory}, total=${item.totalQty}`,
        context: item.fullName,
      });
    }
  }

  // 4. Hold qty exceeds total (ERROR — math doesn't add up)
  for (const item of items) {
    if (item.qtyOnHold > item.totalQty && item.totalQty > 0) {
      issues.push({
        severity: "error",
        code: "INV_HOLD_EXCEEDS_TOTAL",
        message: `Hold quantity (${item.qtyOnHold}) exceeds total (${item.totalQty})`,
        context: item.fullName,
      });
    }
  }

  return buildResult(issues);
}
