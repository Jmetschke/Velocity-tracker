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
  "blue razz shooter": "Hijnx Shooter - Sour Blue Razz 2oz",
  "triple citrus shooter": "Hijnx Shooter - Triple Citrus 2oz",
  "watermelon shooter": "Hijnx Shooter - Watermelon 2oz",
  "grape crush 1g vape": "Snackbar Vape - Grape Crush 1g",
  "lemon yuzu 1g vape": "Snackbar Vape - Lemon Yuzu 1g",
  "magic mango 1g vape": "Snackbar Vape - Mango Magic 1g",
  "watermelon lychee 1g vape": "Snackbar Vape - Watermelon Lychee 1g",
  "cherry pomegranate lemon 2g vape": "Snackbar Vape - Cherry Pomegranate Lemon 2g",
  "peach passionfruit 2g vape": "Snackbar Vape - Peach Passion Fruit 2g",
  "peach passion fruit 2g vape": "Snackbar Vape - Peach Passion Fruit 2g",
  "strawberry dragonfruit 2g vape": "Snackbar Vape - Strawberry Dragonfruit 2g",
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
  "1l distillate for 1g vapes",
  "1l of distillate for 2g vapes",
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

function isDetailHeaderRow(row: any[]): boolean {
  const headers = row.map((v) => String(v ?? "").toLowerCase().trim());
  return (
    headers.includes("transaction date") &&
    headers.includes("description") &&
    headers.includes("quantity")
  );
}

function parseDate(value: any): Date | null {
  if (value instanceof Date && !isNaN(value.getTime())) return value;
  const text = String(value ?? "").trim();
  const match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return null;
  const date = new Date(Number(match[3]), Number(match[1]) - 1, Number(match[2]));
  return isNaN(date.getTime()) ? null : date;
}

function parseReportDateRange(value: any): { start: Date; end: Date } | null {
  const text = String(value ?? "").trim();
  const match = text.match(/^([A-Za-z]+)\s+(\d{1,2})-([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})$/);
  if (!match) return null;
  const startMonth = new Date(`${match[1]} 1, ${match[5]}`).getMonth();
  const endMonth = new Date(`${match[3]} 1, ${match[5]}`).getMonth();
  if (isNaN(startMonth) || isNaN(endMonth)) return null;
  return {
    start: new Date(Number(match[5]), startMonth, Number(match[2])),
    end: new Date(Number(match[5]), endMonth, Number(match[4])),
  };
}

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatDetailMonth(date: Date, minDate: Date, maxDate: Date) {
  const month = MONTH_NAMES[date.getMonth()];
  const year = date.getFullYear();
  const lastDay = new Date(year, date.getMonth() + 1, 0).getDate();
  const startsPartial =
    date.getFullYear() === minDate.getFullYear() &&
    date.getMonth() === minDate.getMonth() &&
    minDate.getDate() > 1;
  const endsPartial =
    date.getFullYear() === maxDate.getFullYear() &&
    date.getMonth() === maxDate.getMonth() &&
    maxDate.getDate() < lastDay;

  if (startsPartial || endsPartial) {
    const startDay = startsPartial ? minDate.getDate() : 1;
    const endDay = endsPartial ? maxDate.getDate() : lastDay;
    return `${month} ${startDay}-${endDay} ${year}`;
  }

  return `${month} ${year}`;
}

function monthSortKey(name: string) {
  const match = name.match(/^([A-Z][a-z]{2})(?:\s+\d{1,2}-\d{1,2})?\s+(\d{4})$/);
  if (!match) return name;
  const month = MONTH_NAMES.indexOf(match[1]);
  return `${match[2]}-${String(month + 1).padStart(2, "0")}`;
}

function buildCsvForAI(items: QBParsedItem[], monthNames: string[], partialMonths: string[]) {
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

  return csvLines.join("\n");
}

function parseQuickBooksDetailRows(rows: any[]): QBParseResult {
  const itemsBySku = new Map<string, {
    qbName: string;
    skuName: string;
    months: Map<string, { quantity: number; amount: number }>;
  }>();
  const unmatchedRows: QBParseResult["unmatchedRows"] = [];
  const excludedRows: QBParseResult["excludedRows"] = [];
  const datedRows: Array<{ qbName: string; skuName: string; date: Date; qty: number; amount: number }> = [];
  const dates: Date[] = [];
  let dataRowCount = 0;
  let currentCategory = "";
  let currentProduct = "";

  for (let i = 5; i < rows.length; i++) {
    const row = rows[i] ?? [];
    const groupName = String(row[0] ?? "").trim();
    const date = parseDate(row[1]);

    if (groupName) {
      const lower = groupName.toLowerCase();
      if (lower.startsWith("total for ")) {
        currentProduct = "";
        continue;
      }

      const classification = classifyRow(groupName);
      if (classification.type === "category") {
        currentCategory = classification.name;
        currentProduct = "";
        excludedRows.push({ name: groupName, reason: "Category header" });
        continue;
      }
      if (classification.type === "total") {
        currentCategory = "";
        currentProduct = "";
        excludedRows.push({ name: groupName, reason: "Total row" });
        continue;
      }
      if (classification.type === "excluded") {
        currentProduct = "";
        excludedRows.push({ name: groupName, reason: classification.reason });
        continue;
      }

      currentProduct = groupName;
      continue;
    }

    if (!date || !currentProduct) continue;
    dataRowCount++;

    if (EXCLUDED_CATEGORIES.has(currentCategory)) {
      excludedRows.push({ name: currentProduct, reason: "Pheotera brand (child product)" });
      continue;
    }

    const productClassification = classifyRow(currentProduct);
    if (productClassification.type === "excluded") {
      excludedRows.push({ name: currentProduct, reason: productClassification.reason });
      continue;
    }

    const skuName = matchToSku(currentProduct);
    if (!skuName) {
      unmatchedRows.push({ name: currentProduct, reason: "No SKU mapping found" });
      continue;
    }

    const qty = parseNum(row[6]);
    const amount = parseNum(row[8]);
    if (qty === 0 && amount === 0) continue;

    dates.push(date);
    datedRows.push({ qbName: currentProduct, skuName, date, qty, amount });
  }

  const reportRange = parseReportDateRange(rows[2]?.[0]);
  const minDate = reportRange?.start ?? (dates.length ? new Date(Math.min(...dates.map((d) => d.getTime()))) : new Date());
  const maxDate = reportRange?.end ?? (dates.length ? new Date(Math.max(...dates.map((d) => d.getTime()))) : new Date());

  for (const row of datedRows) {
    const month = formatDetailMonth(row.date, minDate, maxDate);
    const item = itemsBySku.get(row.skuName) ?? {
      qbName: row.qbName,
      skuName: row.skuName,
      months: new Map<string, { quantity: number; amount: number }>(),
    };
    const monthly = item.months.get(month) ?? { quantity: 0, amount: 0 };
    monthly.quantity += row.qty;
    monthly.amount += row.amount;
    item.months.set(month, monthly);
    itemsBySku.set(row.skuName, item);
  }

  const monthNames = Array.from(new Set(datedRows.map((row) => formatDetailMonth(row.date, minDate, maxDate))))
    .sort((a, b) => monthSortKey(a).localeCompare(monthSortKey(b)));
  const partialMonths = monthNames.filter(isPartialMonth);

  const items: QBParsedItem[] = Array.from(itemsBySku.values()).map((item) => {
    const monthlyData = monthNames
      .map((month) => {
        const monthly = item.months.get(month);
        return {
          month,
          quantity: monthly?.quantity ?? 0,
          amount: monthly?.amount ?? 0,
          avgPrice: monthly && monthly.quantity !== 0 ? monthly.amount / monthly.quantity : 0,
          cogs: 0,
          grossMargin: 0,
        };
      })
      .filter((month) => month.quantity !== 0 || month.amount !== 0);
    return {
      qbName: item.qbName,
      skuName: item.skuName,
      monthlyData,
      totalQuantity: monthlyData.reduce((sum, month) => sum + month.quantity, 0),
      totalAmount: monthlyData.reduce((sum, month) => sum + month.amount, 0),
    };
  });

  return {
    items,
    unmatchedRows: Array.from(new Map(unmatchedRows.map((row) => [row.name, row])).values()),
    excludedRows,
    months: monthNames,
    partialMonths,
    totalRows: dataRowCount,
    csvForAI: buildCsvForAI(items, monthNames, partialMonths),
  };
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

  if (rows.some(isDetailHeaderRow)) {
    return parseQuickBooksDetailRows(rows);
  }

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

  return {
    items,
    unmatchedRows,
    excludedRows,
    months: monthNames,
    partialMonths,
    totalRows: dataRowCount,
    csvForAI: buildCsvForAI(items, monthNames, partialMonths),
  };
}
