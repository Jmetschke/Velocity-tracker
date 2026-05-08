/**
 * Shared test helpers for building Excel buffers using ExcelJS.
 * Replaces the old xlsx-based buffer builders across all test files.
 */
import ExcelJS from "exceljs";

/** Build an Excel buffer from a sheet name + 2D array of rows (first row = headers). */
export async function buildExcelBuffer(
  sheetName: string,
  rows: (string | number | null | undefined)[][]
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(sheetName);
  for (const row of rows) {
    ws.addRow(row);
  }
  const arrayBuf = await wb.xlsx.writeBuffer();
  return Buffer.from(arrayBuf);
}

/** Build a multi-sheet Excel buffer. */
export async function buildMultiSheetBuffer(
  sheets: { name: string; rows: (string | number | null | undefined)[][] }[]
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  for (const sheet of sheets) {
    const ws = wb.addWorksheet(sheet.name);
    for (const row of sheet.rows) {
      ws.addRow(row);
    }
  }
  const arrayBuf = await wb.xlsx.writeBuffer();
  return Buffer.from(arrayBuf);
}

/** Build an empty Excel buffer (no sheets). */
export async function buildEmptyBuffer(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.addWorksheet("Sheet1");
  const arrayBuf = await wb.xlsx.writeBuffer();
  return Buffer.from(arrayBuf);
}
