/**
 * METRC export parser for the scheduler's current business data format.
 *
 * Parses "Packages - Active" exports from Illinois METRC (seed-to-sale tracking).
 *
 * Key rules:
 *   - Include locations: "Product Ready For Sale", "EO Curing Room", "EO Vault"
 *   - Exclude locations: "EO Concentrate Cabinet"
 *   - Exclude categories: Concentrate (Bulk), Topical, Tincture
 *   - Exclude brands: Pheotera
 *   - Items in "EO Curing Room" or with Lab Test Status != "TestPassed" → WIP
 *   - Sum quantities across multiple packages of the same SKU
 */

import { readSheetAsObjects } from "./excel";

// ─── Types ───────────────────────────────────────────────────────────

export interface MetrcParsedItem {
  skuName: string;
  available: number;
  wip: number;
  tags: string[];
}

export interface MetrcParseResult {
  items: MetrcParsedItem[];
  unmatchedRows: Array<{ item: string; qty: number; reason: string }>;
  totalRows: number;
  includedRows: number;
  excludedRows: number;
}

// ─── Definitive METRC Item → SKU Mapping ─────────────────────────────

const METRC_TO_SKU: Record<string, string> = {
  "hijnx gummy rso 100mg / 100mg space chunks": "Chill Chunk - 2pk",
  "hijnx gummy rso 50mg/50mg space chunk gummy": "Chill Chunk - 1pk",
  "hijnx gummy rso cbn 100mg/100mg sleep space chunk gummies": "Sleep Chunk - 2pk",
  "hijnx gummy rso cbn 50mg/50mg sleep space chunk gummy": "Sleep Chunk - 1pk",
  "hijnx gummy rso 100mg space chunks": "Alpha Chunk - 2pk",
  "hijnx gummy rso 50mg space chunk gummy": "Alpha Chunk - 1pk",
  "hijnx gummy rso rex og 100mg rex space chunk gummies": "Rex Chunk - 2pk",
  "hijnx gummy rso zuul og 100mg zuul space chunk gummies": "Zuul Chunk - 2pk",
  "hijnx gummy rso 100mg mini space chunk gummies": "MiNi's Chunks - 10pk",
  "hijnx gummy rso sugar free 100mg mini sugar free space chunk gummies": "Sugar Free MiNi's - 10pk",
  "hijnx whoopie rso 100mg whoopie hi cookie": "Whoopie Hi",
  "hijnx micro dots 50mg purple raz - edible": "Micro Dots",
  "hijnx beverage: triple citrus rso shooter - 2oz": "Hijnx Shooter - Triple Citrus 2oz",
  "hijnx beverage: watermelon rso shooter - 2oz": "Hijnx Shooter - Watermelon 2oz",
  "hijnx beverage: blue razz rso shooter - 2oz": "Hijnx Shooter - Sour Blue Razz 2oz",
  "hijnx edible: sampler medley bag": "Hijnx Sampler Medley Bag",
  "snackbar vape pen 2g - strawberry dragonfruit": "Snackbar Vape - Strawberry Dragonfruit 2g",
  "snackbar vape pen 2g - peach passion fruit": "Snackbar Vape - Peach Passion Fruit 2g",
  "snackbar vape pen 2g - cherry pomegranate lemon": "Snackbar Vape - Cherry Pomegranate Lemon 2g",
};

const BATCH_KEYWORD_MAP: Record<string, string> = {
  "cbd 2pk": "Chill Chunk - 2pk",
  "cbd 1pk": "Chill Chunk - 1pk",
  "cbn 2pk": "Sleep Chunk - 2pk",
  "cbn 1pk": "Sleep Chunk - 1pk",
  "alpha og 2pk": "Alpha Chunk - 2pk",
  "alpha og 1pk": "Alpha Chunk - 1pk",
  "og alpha 2pk": "Alpha Chunk - 2pk",
  "og alpha 1pk": "Alpha Chunk - 1pk",
  "rex og 2pk": "Rex Chunk - 2pk",
  "og rex 2pk": "Rex Chunk - 2pk",
  "zuul og 2pk": "Zuul Chunk - 2pk",
  "og zuul 2pk": "Zuul Chunk - 2pk",
  "mini og": "MiNi's Chunks - 10pk",
  "mini 10pk": "MiNi's Chunks - 10pk",
  "sf mini": "Sugar Free MiNi's - 10pk",
  "sugar free mini": "Sugar Free MiNi's - 10pk",
  "triple citrus": "Hijnx Shooter - Triple Citrus 2oz",
  "watermelon": "Hijnx Shooter - Watermelon 2oz",
  "blue razz": "Hijnx Shooter - Sour Blue Razz 2oz",
};

const INCLUDED_LOCATIONS = new Set(["product ready for sale", "eo curing room", "eo vault"]);
const WIP_LOCATIONS = new Set(["eo curing room"]);
const EXCLUDED_CATEGORIES = new Set(["concentrate (bulk)", "topical (final form)", "tincture (final form)"]);
const EXCLUDED_ITEM_KEYWORDS = ["pheotera"];

// ─── Helpers ─────────────────────────────────────────────────────────

function matchItemToSku(itemName: string, batchName: string, sourceJob: string): string | null {
  const itemLower = itemName.toLowerCase().trim();

  const directMatch = METRC_TO_SKU[itemLower];
  if (directMatch) return directMatch;

  if (itemLower.includes("sampler medley bag")) {
    return "Hijnx Sampler Medley Bag";
  }

  const vapeMatch = itemLower.match(/snackbar\s+vape\s+pen\s*(1g|2g)\s*[-–—]\s*(.+)/);
  if (vapeMatch) {
    const size = vapeMatch[1];
    const flavor = vapeMatch[2].trim();
    const formatted = flavor.replace(/\b\w/g, (c) => c.toUpperCase());
    return `Snackbar Vape - ${formatted} ${size}`;
  }

  const batchLower = `${batchName} ${sourceJob}`.toLowerCase();
  for (const [keyword, sku] of Object.entries(BATCH_KEYWORD_MAP)) {
    if (batchLower.includes(keyword)) return sku;
  }

  return null;
}

function isExcludedItem(itemName: string): boolean {
  const lower = itemName.toLowerCase();
  return EXCLUDED_ITEM_KEYWORDS.some((kw) => lower.includes(kw));
}

// ─── Main Parser ─────────────────────────────────────────────────────

export async function parseMetrcExport(buffer: Buffer): Promise<MetrcParseResult> {
  const rows = await readSheetAsObjects(buffer);

  const skuTotals = new Map<string, { available: number; wip: number; tags: string[] }>();
  const unmatchedRows: MetrcParseResult["unmatchedRows"] = [];
  let excludedRows = 0;

  for (const row of rows) {
    const item = String(row["Item"] ?? "").trim();
    const category = String(row["Category"] ?? "").trim();
    const location = String(row["Location"] ?? "").trim();
    const qty = parseFloat(String(row["Quantity"] ?? "0")) || 0;
    const uom = String(row["Unit Of Measure"] ?? "").trim();
    const labStatus = String(row["Lab Test Status"] ?? "").trim();
    const tag = String(row["Tag"] ?? "").trim();
    const batchName = String(row["Production Batch Number"] ?? "");
    const sourceJob = String(row["Source Processing Job(s)"] ?? "");

    if (EXCLUDED_CATEGORIES.has(category.toLowerCase())) { excludedRows++; continue; }
    if (isExcludedItem(item)) { excludedRows++; continue; }
    if (!INCLUDED_LOCATIONS.has(location.toLowerCase())) { excludedRows++; continue; }
    if (uom.toLowerCase() === "g") { excludedRows++; continue; }

    const skuName = matchItemToSku(item, batchName, sourceJob);
    if (!skuName) {
      unmatchedRows.push({ item, qty, reason: "No SKU mapping found" });
      continue;
    }

    const isWip = WIP_LOCATIONS.has(location.toLowerCase()) || labStatus !== "TestPassed";
    const existing = skuTotals.get(skuName) ?? { available: 0, wip: 0, tags: [] };
    if (isWip) existing.wip += qty;
    else existing.available += qty;
    existing.tags.push(tag);
    skuTotals.set(skuName, existing);
  }

  const items: MetrcParsedItem[] = Array.from(skuTotals.entries()).map(
    ([skuName, data]) => ({
      skuName,
      available: Math.round(data.available),
      wip: Math.round(data.wip),
      tags: data.tags,
    })
  );

  return {
    items,
    unmatchedRows,
    totalRows: rows.length,
    includedRows: items.reduce((sum, i) => sum + i.tags.length, 0),
    excludedRows,
  };
}
