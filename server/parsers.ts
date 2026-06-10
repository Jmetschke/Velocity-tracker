/**
 * Spreadsheet parsers for the scheduler's supported file formats.
 *
 * Inventory Status Report format:
 *   Row 1: Headers [blank, "Qty in Inventory", "Qty on Hold for COA", "Total", "Trigger Point"]
 *   Rows: Hierarchical - brand headers ("Hijnx", "Snackbar"), product headers ("Alpha Chunk"),
 *         and sub-items ("2-pack", "1-pack") with qty data.
 *   Need to track parent context to build full SKU names.
 *
 * Sales by Product/Service Summary format:
 *   Row 1-4: Report metadata
 *   Row 5: Month headers at cols 1,5,9,13,... (4 cols per month: Qty, Amount, %, AvgPrice)
 *   Row 6: Sub-headers repeating
 *   Row 7+: Product data with leading spaces, SAMPLE rows to exclude
 */

import { readSheetAsArrays } from "./excel";

// ─── Inventory Parser ─────────────────────────────────────────────────

export interface ParsedInventoryItem {
  rawName: string;
  fullName: string;
  qtyInInventory: number;
  qtyOnHold: number;
  totalQty: number;
  triggerPoint: number;
}

export async function parseInventoryReport(buffer: Buffer): Promise<ParsedInventoryItem[]> {
  const rows = await readSheetAsArrays(buffer);
  const items: ParsedInventoryItem[] = [];

  const brandHeaders = ["hijnx", "snackbar"];
  const productHeaders = ["alpha chunk", "chill chunk", "sleep chunk"];
  let currentProductContext = "";

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || !row[0] || typeof row[0] !== "string") continue;

    const rawName = String(row[0]).trim();
    const lowerName = rawName.toLowerCase();

    if (brandHeaders.includes(lowerName)) { currentProductContext = ""; continue; }

    const hasQtyData = row[1] !== null && row[1] !== undefined;

    if (!hasQtyData && productHeaders.includes(lowerName)) {
      currentProductContext = rawName;
      continue;
    }
    if (!hasQtyData) { currentProductContext = ""; continue; }

    let fullName = rawName;
    const standalonePackMatch = rawName.match(/^(.+?)\s+(\d+)-?pack$/i);
    const isSimplePackItem = /^\d+-?pack$/i.test(rawName);

    if (currentProductContext && isSimplePackItem) {
      const packMatch = rawName.match(/(\d+)-?pack/i);
      if (packMatch) fullName = `${currentProductContext} - ${packMatch[1]}pk`;
    } else if (standalonePackMatch) {
      fullName = `${standalonePackMatch[1]} - ${standalonePackMatch[2]}pk`;
      currentProductContext = "";
    } else {
      if (lowerName === "whoopie his") fullName = "Whoopie Hi";
      currentProductContext = "";
    }

    const qtyInv = parseFloat(String(row[1] || 0)) || 0;
    const qtyHold = parseFloat(String(row[2] || 0)) || 0;
    const total = parseFloat(String(row[3] || 0)) || qtyInv + qtyHold;
    const trigger = parseFloat(String(row[4] || 0)) || 0;

    items.push({
      rawName, fullName,
      qtyInInventory: Math.round(qtyInv),
      qtyOnHold: Math.round(qtyHold),
      totalQty: Math.round(total),
      triggerPoint: Math.round(trigger),
    });
  }

  return items;
}

// ─── Sales Parser ─────────────────────────────────────────────────────

export interface MonthlyQuantity {
  month: string;
  quantity: number;
  amount: number;
}

export interface ParsedSalesItem {
  skuName: string;
  monthlyData: MonthlyQuantity[];
  totalQuantity: number;
  totalAmount: number;
}

function parseNumericString(val: any): number {
  if (val === null || val === undefined || val === "") return 0;
  if (typeof val === "number") return val;
  const cleaned = String(val).replace(/[$,%]/g, "").replace(/,/g, "").trim();
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

export async function parseSalesReport(buffer: Buffer): Promise<{
  items: ParsedSalesItem[];
  csvForAI: string;
}> {
  const rows = await readSheetAsArrays(buffer);

  const monthRow = rows[4] || [];
  const months: { name: string; qtyCol: number; amtCol: number }[] = [];
  let totalQtyCol = -1;
  let totalAmtCol = -1;

  for (let col = 0; col < monthRow.length; col++) {
    const val = monthRow[col];
    if (!val || typeof val !== "string") continue;
    if (val === "Total") {
      totalQtyCol = col;
      totalAmtCol = col + 1;
      break; // All month headers precede the Total column
    }
    months.push({ name: val, qtyCol: col, amtCol: col + 1 });
  }

  const items: ParsedSalesItem[] = [];
  const categoryHeaders = ["hijnx edibles", "snackbar vapes"];

  for (let i = 6; i < rows.length; i++) {
    const row = rows[i];
    if (!row || !row[0] || typeof row[0] !== "string") continue;

    const rawName = String(row[0]).trim();
    const lowerName = rawName.toLowerCase();

    if (categoryHeaders.includes(lowerName)) continue;
    if (lowerName.includes("(sample)")) continue;
    if (!rawName) continue;

    const monthlyData: MonthlyQuantity[] = [];
    for (const month of months) {
      const qty = parseNumericString(row[month.qtyCol]);
      const amt = parseNumericString(row[month.amtCol]);
      if (qty > 0) monthlyData.push({ month: month.name, quantity: qty, amount: amt });
    }

    if (monthlyData.length === 0) continue;

    const totalQty = totalQtyCol >= 0 ? parseNumericString(row[totalQtyCol]) : 0;
    const totalAmt = totalAmtCol >= 0 ? parseNumericString(row[totalAmtCol]) : 0;

    items.push({ skuName: rawName, monthlyData, totalQuantity: totalQty, totalAmount: totalAmt });
  }

  const csvLines: string[] = [];
  csvLines.push("SKU Name," + months.map((m) => m.name + " Qty").join(",") + ",Total Qty");
  for (const item of items) {
    const qtyByMonth: Record<string, number> = {};
    for (const md of item.monthlyData) qtyByMonth[md.month] = md.quantity;
    const monthQtys = months.map((m) => qtyByMonth[m.name] || 0);
    csvLines.push(`${item.skuName},${monthQtys.join(",")},${item.totalQuantity}`);
  }

  return { items, csvForAI: csvLines.join("\n") };
}

// ─── SKU Name Matching ────────────────────────────────────────────────

function normalizeName(name: string): string {
  return name.trim().toLowerCase()
    .replace(/\s*-\s*/g, " - ")
    .replace(/(\d+)\s*-?\s*pack/g, "$1pk")
    .replace(/\s+/g, " ");
}

export function findBestSkuMatch(
  parsedName: string,
  dbSkus: Array<{ id: number; name: string }>
): { id: number; name: string } | null {
  const normalized = normalizeName(parsedName);

  for (const sku of dbSkus) {
    if (normalizeName(sku.name) === normalized) return sku;
  }

  for (const sku of dbSkus) {
    const dbNorm = normalizeName(sku.name);
    if (normalized.includes(dbNorm) || dbNorm.includes(normalized)) return sku;
  }

  const parsedWords = normalized.split(/[\s-]+/).filter((w) => w.length > 1);
  let bestMatch: { id: number; name: string } | null = null;
  let bestScore = 0;

  for (const sku of dbSkus) {
    const dbWords = normalizeName(sku.name).split(/[\s-]+/).filter((w) => w.length > 1);
    const overlap = parsedWords.filter((w) => dbWords.includes(w)).length;
    const score = overlap / Math.max(parsedWords.length, dbWords.length);
    if (score > bestScore && score >= 0.5) { bestScore = score; bestMatch = sku; }
  }

  return bestMatch;
}
