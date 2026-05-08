/**
 * Shared ExcelJS helpers.
 *
 * Replaces the vulnerable `xlsx` package with `exceljs`.
 * Provides two read modes that mirror the old xlsx patterns:
 *   - readSheetAsArrays()  → rows as any[][] (like XLSX.utils.sheet_to_json(sheet, { header: 1 }))
 *   - readSheetAsObjects() → rows as Record<string, any>[] (like XLSX.utils.sheet_to_json(sheet))
 *
 * Merged cells: ExcelJS fills every cell in a merged range with the same
 * value. The old `xlsx` package only put the value in the top-left cell.
 * We replicate the old behavior by building a set of "non-origin" merged
 * cells and nulling them out in readSheetAsArrays.
 */

import ExcelJS from "exceljs";

// ─── Merge Helpers ──────────────────────────────────────────────────────

/**
 * Build a set of cell keys ("row,col") for every cell that is part of a
 * merged range BUT is NOT the top-left origin cell. These cells should
 * be treated as null to match the old xlsx behavior.
 */
function buildMergedNonOriginSet(sheet: ExcelJS.Worksheet): Set<string> {
  const nonOrigin = new Set<string>();
  const merges: string[] = (sheet.model?.merges as string[]) ?? [];

  for (const ref of merges) {
    // ref looks like "B5:H5" — decode to row/col ranges
    const match = ref.match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/);
    if (!match) continue;

    const startCol = colLetterToNumber(match[1]);
    const startRow = parseInt(match[2], 10);
    const endCol = colLetterToNumber(match[3]);
    const endRow = parseInt(match[4], 10);

    for (let r = startRow; r <= endRow; r++) {
      for (let c = startCol; c <= endCol; c++) {
        if (r === startRow && c === startCol) continue; // keep origin
        nonOrigin.add(`${r},${c}`);
      }
    }
  }

  return nonOrigin;
}

/** Convert column letter(s) to 1-based column number (A=1, Z=26, AA=27). */
function colLetterToNumber(letters: string): number {
  let n = 0;
  for (let i = 0; i < letters.length; i++) {
    n = n * 26 + (letters.charCodeAt(i) - 64);
  }
  return n;
}

// ─── Public API ─────────────────────────────────────────────────────────

/** Read the first worksheet as a 2D array of raw values. */
export async function readSheetAsArrays(buffer: Buffer | Uint8Array): Promise<(ExcelJS.CellValue | null)[][]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as import("exceljs").Buffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) return [];

  const nonOrigin = buildMergedNonOriginSet(sheet);

  const rows: (ExcelJS.CellValue | null)[][] = [];
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    // ExcelJS rows are 1-indexed; row.values[0] is always undefined
    const values = row.values as ExcelJS.CellValue[];
    const cleaned = values.slice(1).map((val, idx) => {
      const col = idx + 1; // 1-based column
      return nonOrigin.has(`${rowNumber},${col}`) ? null : val;
    });
    rows[rowNumber - 1] = cleaned;
  });

  return rows;
}

/** Read the first worksheet as an array of keyed objects (header row = keys). */
export async function readSheetAsObjects(buffer: Buffer | Uint8Array): Promise<Record<string, ExcelJS.CellValue>[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as import("exceljs").Buffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) return [];

  const headerRow = sheet.getRow(1);
  const headers: string[] = [];
  headerRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    headers[colNumber - 1] = String(cell.value ?? "").trim();
  });

  const results: Record<string, ExcelJS.CellValue>[] = [];
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    const obj: Record<string, ExcelJS.CellValue> = {};
    let hasData = false;
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      const key = headers[colNumber - 1];
      if (key) {
        obj[key] = cell.value;
        if (cell.value !== null && cell.value !== undefined) hasData = true;
      }
    });
    if (hasData) results.push(obj);
  });

  return results;
}

/**
 * Get a cell value from a worksheet by row/col (both 1-indexed).
 * Useful for detecting month headers in specific rows.
 */
export function getCellValue(sheet: ExcelJS.Worksheet, row: number, col: number): ExcelJS.CellValue {
  return sheet.getCell(row, col).value;
}

/**
 * Get the column count of the first worksheet.
 */
export function getColumnCount(sheet: ExcelJS.Worksheet): number {
  return sheet.columnCount;
}

/** Re-export ExcelJS for cases that need direct worksheet access. */
export { ExcelJS };
