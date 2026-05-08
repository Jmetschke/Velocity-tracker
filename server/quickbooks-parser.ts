/**
 * QuickBooks "Sales by Product/Service Summary" parser for the scheduler's
 * current business data format.
 *
 * File layout:
 *   Row 0: Company name
 *   Row 1: Report title
 *   Row 2: Date range
 *   Row 3: Empty
 *   Row 4: Month headers at cols 1, 8, 15, ... (stride 7), "Total" at the end
 *   Row 5: Sub-headers repeating per month: Quantity, Amount, % of Sales, Avg Price, COGS, Gross Margin, Gross Margin %
 *   Row 6+: Data — category headers (no indent), product rows (3-space indent), total rows
 *
 * Key rules:
 *   - Exclude all Pheotera products
 *   - Exclude SAMPLE rows
 *   - Exclude discontinued products (Micro Pumps, Party Pouch)
 *   - Exclude non-product rows (Promotional Discounts, Sales, Write off, etc.)
 *   - Map QB product names to app SKU names via definitive mapping table
 */

import { readSheetAsArrays } from "./excel";

// ─── Types ───────────────────────────────────────────────────────────

export interface QBMonthlyData {
  month: string;
  quantity: number;
  amount: number;
  avgPrice: number;
  cogs: number;
  grossMargin: number;
}

export interface QBParsedItem {
  qbName: string;
  skuName: string;
  monthlyData: QBMonthlyData[];
  totalQuantity: number;
  totalAmount: number;
}

export interface QBParseResult {
  items: QBParsedItem[];
  unmatchedRows: Array<{ name: string; reason: string }>;
  excludedRows: Array<{ name: string; reason: string }>;
  months: string[];
  partialMonths: string[];
  totalRows: number;
  csvForAI: string;
}

// ─── Definitive QB Name → App SKU Mapping ────────────────────────────

const QB_TO_SKU: Record<string, string> = {
  "chill chunk - 1pk": "Chill Chunk - 1pk",
  "chill chunks - 2pk": "Chill Chunk - 2pk",
  "og alpha - 1pk": "Alpha Chunk - 1pk",
  "og alpha - 2pk": "Alpha Chunk - 2pk",
  "og rex - 2pk": "Rex Chunk - 2pk",
  "og zuul - 2pk": "Zuul Chunk - 2pk",
  "sleep chunk - 1pk": "Sleep Chunk - 1pk",
  "sleep chunk - 2pk": "Sleep Chunk - 2pk",
  "space chunk minis": "MiNi's Chunks - 10pk",
  "sugar free minis": "Sugar Free MiNi's - 10pk",
  "micro dots": "Micro Dots",
  "whoopie hi": "Whoopie Hi",
  "grape crush 1g vape": "Snackbar Vape - Grape Crush 1g",
  "lemon yuzu 1g vape": "Snackbar Vape - Lemon Yuzu 1g",
  "magic mango 1g vape": "Snackbar Vape - Magic Mango 1g",
  "watermelon lychee 1g vape": "Snackbar Vape - Watermelon Lychee 1g",
};

const EXCLUDED_NAMES = new Set([
  "daytime focus micro pump",
  "good night sleep micro pump",
  "goodnight sleep micro pump",
  "main squeeze party pouch",
  "pick up and return of oil",
  "promotional discounts",
  "sales",
  "write off misc underpayment",
  "not specified",
]);

const CATEGORY_HEADERS = new Set(["hijnx edible", "vape", "pheotera topical"]);
const EXCLUDED_CATEGORIES = new Set(["pheotera topical"]);

// ─── Helpers ─────────────────────────────────────────────────────────

function parseNum(val: any): number {
  if (val === null || val === undefined || val === "") return 0;
  if (typeof val === "number") return val;
  const cleaned = String(val).replace(/[$,%]/g, "").replace(/,/g, "").trim();
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

export function classifyRow(name: string): { type: "category"; name: string } | { type: "total" } | { type: "excluded"; reason: string } | { type: "data" } {
  const lower = name.toLowerCase();

  if (CATEGORY_HEADERS.has(lower)) return { type: "category", name: lower };
  if (lower.startsWith("total ") || lower === "total") return { type: "total" };
  if (lower.includes("(sample)")) return { type: "excluded", reason: "SAMPLE row" };
  if (EXCLUDED_NAMES.has(lower)) return { type: "excluded", reason: "Discontinued or non-product" };
  if (/^(monday|tuesday|wednesday|thursday|friday|saturday|sunday),/i.test(name))
    return { type: "excluded", reason: "Report footer" };

  return { type: "data" };
}

function matchToSku(qbName: string): string | null {
  return QB_TO_SKU[qbName.toLowerCase().trim()] ?? null;
}

// ─── Month Column Detection ──────────────────────────────────────────

interface MonthColumn {
  name: string;
  qtyCol: number;
  amtCol: number;
  avgCol: number;
  cogsCol: number;
  marginCol: number;
}

/** Detect if a month header represents a partial month. */
export function isPartialMonth(name: string): boolean {
  return /^[A-Z][a-z]{2}\s+\d{1,2}[\s-]/.test(name);
}

/**
 * Detect month columns from the header row of a worksheet.
 * Uses the readSheetAsArrays row data (0-indexed).
 */
function detectMonthsFromRow(headerRow: any[]): { months: MonthColumn[]; totalQtyCol: number } {
  const months: MonthColumn[] = [];
  let totalQtyCol = -1;

  for (let c = 0; c < headerRow.length; c++) {
    const val = headerRow[c];
    if (!val) continue;
    const str = String(val).trim();

    if (/^(grand\s+)?totals?$/i.test(str)) {
      totalQtyCol = c;
      break; // All month headers precede the Total column — stop scanning
    }

    if (/^[A-Z][a-z]{2}\s/.test(str)) {
      months.push({
        name: str,
        qtyCol: c,
        amtCol: c + 1,
        avgCol: c + 3,
        cogsCol: c + 4,
        marginCol: c + 5,
      });
    }
  }

  return { months, totalQtyCol };
}

// ─── Main Parser ─────────────────────────────────────────────────────

export async function parseQuickBooksExport(buffer: Buffer): Promise<QBParseResult> {
  const rows = await readSheetAsArrays(buffer);

  // Detect month columns from row 4 (index 4)
  const headerRow = rows[4] || [];
  const { months, totalQtyCol } = detectMonthsFromRow(headerRow);

  const items: QBParsedItem[] = [];
  const unmatchedRows: QBParseResult["unmatchedRows"] = [];
  const excludedRows: QBParseResult["excludedRows"] = [];
  let dataRowCount = 0;

  let currentCategory = "";

  for (let i = 6; i < rows.length; i++) {
    const row = rows[i];
    if (!row?.[0] || typeof row[0] !== "string") continue;

    const rawName = String(row[0]).trim();
    if (!rawName) continue;
    dataRowCount++;

    const classification = classifyRow(rawName);

    if (classification.type === "category") {
      currentCategory = classification.name;
      excludedRows.push({ name: rawName, reason: "Category header" });
      continue;
    }

    if (classification.type === "total") {
      if (rawName.toLowerCase().startsWith("total ")) currentCategory = "";
      excludedRows.push({ name: rawName, reason: "Total row" });
      continue;
    }

    if (classification.type === "excluded") {
      excludedRows.push({ name: rawName, reason: classification.reason });
      continue;
    }

    if (EXCLUDED_CATEGORIES.has(currentCategory)) {
      excludedRows.push({ name: rawName, reason: "Pheotera brand (child product)" });
      continue;
    }

    const skuName = matchToSku(rawName);
    if (!skuName) {
      unmatchedRows.push({ name: rawName, reason: "No SKU mapping found" });
      continue;
    }

    const monthlyData: QBMonthlyData[] = [];
    for (const m of months) {
      const qty = parseNum(row[m.qtyCol]);
      const amt = parseNum(row[m.amtCol]);
      const avg = parseNum(row[m.avgCol]);
      const cogs = parseNum(row[m.cogsCol]);
      const margin = parseNum(row[m.marginCol]);

      if (qty !== 0 || amt !== 0) {
        monthlyData.push({ month: m.name, quantity: qty, amount: amt, avgPrice: avg, cogs, grossMargin: margin });
      }
    }

    if (monthlyData.length === 0) continue;

    const totalQty = totalQtyCol >= 0 ? parseNum(row[totalQtyCol]) : 0;
    const totalAmt = totalQtyCol >= 0 ? parseNum(row[totalQtyCol + 1]) : 0;

    items.push({ qbName: rawName, skuName, monthlyData, totalQuantity: totalQty, totalAmount: totalAmt });
  }

  const monthNames = months.map((m) => m.name);
  const partialMonths = monthNames.filter(isPartialMonth);

  const csvLines: string[] = [];
  if (partialMonths.length > 0) {
    csvLines.push(`# NOTE: The following months are PARTIAL (not full calendar months): ${partialMonths.join(", ")}. Exclude them from velocity calculations.`);
  }
  csvLines.push("SKU Name," + monthNames.map((n) => `${n} Qty`).join(",") + ",Total Qty");

  for (const item of items) {
    const qtyByMonth: Record<string, number> = {};
    for (const md of item.monthlyData) {
      qtyByMonth[md.month] = md.quantity;
    }
    const monthQtys = monthNames.map((n) => qtyByMonth[n] || 0);
    csvLines.push(`${item.skuName},${monthQtys.join(",")},${item.totalQuantity}`);
  }

  return {
    items,
    unmatchedRows,
    excludedRows,
    months: monthNames,
    partialMonths,
    totalRows: dataRowCount,
    csvForAI: csvLines.join("\n"),
  };
}
