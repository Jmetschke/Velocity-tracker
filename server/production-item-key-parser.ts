import { readSheetAsArrays } from "./excel";

const REQUIRED_HEADERS = [
  "Item Common Name",
  "Item Metrc Name",
  "Alternate or old metrc names",
] as const;

function cellText(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "object" && "text" in value) {
    return String((value as { text?: unknown }).text ?? "").trim();
  }
  if (typeof value === "object" && "result" in value) {
    return String((value as { result?: unknown }).result ?? "").trim();
  }
  return String(value).trim();
}

function splitNames(value: unknown): string[] {
  return cellText(value)
    .split(/\r?\n|;/)
    .map(name => name.trim())
    .filter(Boolean);
}

export type ProductionItemKeyRow = {
  commonName: string;
  metrcItemNames: string[];
  batchSize: number | null;
  sourceRow: number;
};

export async function parseProductionItemKey(
  buffer: Buffer | Uint8Array,
): Promise<ProductionItemKeyRow[]> {
  const rows = await readSheetAsArrays(buffer);
  const headerIndex = rows.findIndex(row => {
    const headers = new Set((row ?? []).map(cellText));
    return REQUIRED_HEADERS.every(header => headers.has(header));
  });

  if (headerIndex < 0) {
    throw new Error(
      `Could not find the required columns: ${REQUIRED_HEADERS.join(", ")}`,
    );
  }

  const headers = rows[headerIndex].map(cellText);
  const commonNameIndex = headers.indexOf("Item Common Name");
  const metrcNameIndex = headers.indexOf("Item Metrc Name");
  const alternateNamesIndex = headers.indexOf("Alternate or old metrc names");
  const batchSizeIndex = headers.indexOf("Batch Size");
  const parsedRows: ProductionItemKeyRow[] = [];
  const seenCommonNames = new Set<string>();

  for (let index = headerIndex + 1; index < rows.length; index++) {
    const row = rows[index] ?? [];
    const commonName = cellText(row[commonNameIndex]);
    if (!commonName) continue;

    const commonNameKey = commonName.toLowerCase().replace(/\s+/g, " ");
    if (seenCommonNames.has(commonNameKey)) continue;
    seenCommonNames.add(commonNameKey);

    const metrcItemNames = Array.from(
      new Map(
        [
          ...splitNames(row[metrcNameIndex]),
          ...splitNames(row[alternateNamesIndex]),
        ].map(name => [name.toLowerCase(), name]),
      ).values(),
    );
    const rawBatchSize = batchSizeIndex >= 0 ? row[batchSizeIndex] : null;
    const batchSize = Number(rawBatchSize);

    parsedRows.push({
      commonName,
      metrcItemNames,
      batchSize:
        Number.isFinite(batchSize) && batchSize > 0 ? Math.round(batchSize) : null,
      sourceRow: index + 1,
    });
  }

  if (parsedRows.length === 0) {
    throw new Error("The production item key does not contain any item rows.");
  }

  return parsedRows;
}
