import { format } from "date-fns";
import jsPDF, { type jsPDF as jsPDFType } from "jspdf";
import autoTable from "jspdf-autotable";
import type { UserOptions } from "jspdf-autotable";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ProductionSuggestion {
  skuId: number;
  skuName: string;
  urgency: string;
  currentStock: number;
  wipStock: number;
  projectedStock: number;
  parLevel: number;
  dailyVelocity: number;
  daysUntilStockout: number;
  committedQuantity: number;
  batchesNeeded: number;
  suggestedStartDate: Date | string | number;
  calendarWeek: number;
}

export interface SummaryStats {
  critical: number;
  warning: number;
  ok: number;
  activeBatches: number;
}

export interface DataFreshness {
  inventoryDate: Date | null;
  salesDate: Date | null;
}

// ─── Color palette (RGB tuples) ───────────────────────────────────────────────

type RGB = [number, number, number];

const C = {
  primary:          [39, 120, 84]   as RGB,
  primaryLight:     [235, 248, 241] as RGB,
  critical:         [220, 38, 38]   as RGB,
  criticalLight:    [254, 242, 242] as RGB,
  warning:          [161, 98, 7]    as RGB,
  warningLight:     [254, 249, 195] as RGB,
  okLight:          [235, 248, 241] as RGB,
  stockoutWarning:  [161, 98, 7]    as RGB,
  stockoutCaution:  [37, 99, 235]   as RGB,
  white:            [255, 255, 255] as RGB,
  black:            [17, 24, 39]    as RGB,
  gray:             [107, 114, 128] as RGB,
  grayLight:        [243, 244, 246] as RGB,
  border:           [229, 231, 235] as RGB,
  blue:             [37, 99, 235]   as RGB,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const urgencyLabel  = (u: string) => u === "critical" ? "Critical" : u === "warning" ? "Below Par" : "OK";
const urgencyFill   = (u: string): RGB => u === "critical" ? C.criticalLight : u === "warning" ? C.warningLight : C.white;
const urgencyColor  = (u: string): RGB => u === "critical" ? C.critical : u === "warning" ? C.warning : C.primary;
const stockoutColor = (d: number): RGB => d <= 5 ? C.critical : d <= 14 ? C.stockoutWarning : d <= 21 ? C.stockoutCaution : C.primary;
const fmtNum        = (n: number) => n.toLocaleString("en-US");

// ─── Stat box renderer ────────────────────────────────────────────────────────

function drawStatBox(
  doc: jsPDFType,
  x: number, y: number, w: number, h: number,
  label: string, value: number,
  fill: RGB, valueColor: RGB,
): void {
  doc.setFillColor(...fill);
  doc.roundedRect(x, y, w, h, 2, 2, "F");
  doc.setFontSize(7);
  doc.setTextColor(...C.gray);
  doc.setFont("helvetica", "normal");
  doc.text(label.toUpperCase(), x + w / 2, y + 6, { align: "center" });
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...valueColor);
  doc.text(String(value), x + w / 2, y + 17, { align: "center" });
}

// ─── Main export (async — loads jsPDF on demand) ──────────────────────────────

export async function exportProductionNeedsPdf(
  suggestions: ProductionSuggestion[],
  stats: SummaryStats,
  freshness?: DataFreshness,
): Promise<void> {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "letter" });
  const PAGE_W = 279.4;
  const MARGIN = 14;
  const CONTENT_W = PAGE_W - MARGIN * 2;
  const now = new Date();

  // ── Header bar ──────────────────────────────────────────────────────────────
  doc.setFillColor(...C.primary);
  doc.rect(0, 0, PAGE_W, 18, "F");
  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...C.white);
  doc.text("Elevated Organics", MARGIN, 11);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(200, 230, 215);
  doc.text("Production Needs Report", MARGIN + 54, 11);
  doc.setFontSize(8);
  doc.text(`Generated ${format(now, "MMM d, yyyy h:mm a")}`, PAGE_W - MARGIN, 11, { align: "right" });

  // ── Data freshness ───────────────────────────────────────────────────────────
  let cursorY = 23;
  if (freshness) {
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...C.gray);
    const inv   = freshness.inventoryDate ? `Inventory: ${format(freshness.inventoryDate, "MMM d, yyyy")}` : "Inventory: No data";
    const sales = freshness.salesDate     ? `Sales Velocity: ${format(freshness.salesDate, "MMM d, yyyy")}` : "Sales Velocity: No data";
    doc.text(`Data Freshness — ${inv}   |   ${sales}`, MARGIN, cursorY);
    cursorY += 6;
  }

  // ── Summary stat boxes ───────────────────────────────────────────────────────
  const BOX_W = (CONTENT_W - 9) / 4;
  const BOX_H = 22;
  const boxes = [
    { label: "Critical",       value: stats.critical,      fill: C.criticalLight, color: C.critical },
    { label: "Below Par",      value: stats.warning,       fill: C.warningLight,  color: C.warning },
    { label: "On Track",       value: stats.ok,            fill: C.okLight,       color: C.primary },
    { label: "Active Batches", value: stats.activeBatches, fill: C.grayLight,     color: C.black },
  ];
  boxes.forEach((b, i) => drawStatBox(doc, MARGIN + i * (BOX_W + 3), cursorY, BOX_W, BOX_H, b.label, b.value, b.fill, b.color));
  cursorY += BOX_H + 6;

  // ── Section title ────────────────────────────────────────────────────────────
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...C.black);
  doc.text("Production Needs", MARGIN, cursorY);
  doc.setFontSize(7.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...C.gray);
  doc.text(`${suggestions.length} SKU${suggestions.length !== 1 ? "s" : ""} — sorted by stockout days`, MARGIN + 32, cursorY);
  cursorY += 4;

  // ── Table ────────────────────────────────────────────────────────────────────
  const headers = ["Status","SKU","Available","In Testing","Projected","Par Level","Vel/Day","Days to Stockout","Committed","Batches Needed","Suggested Start"];

  const rows = suggestions.map((s) => [
    urgencyLabel(s.urgency),
    s.skuName,
    fmtNum(s.currentStock),
    s.wipStock > 0 ? fmtNum(s.wipStock) : "—",
    fmtNum(s.projectedStock),
    fmtNum(s.parLevel),
    s.dailyVelocity.toFixed(1),
    s.daysUntilStockout === Infinity ? "—" : `${s.daysUntilStockout}d`,
    s.committedQuantity > 0 ? fmtNum(s.committedQuantity) : "—",
    s.batchesNeeded > 0 ? String(s.batchesNeeded) : "—",
    s.committedQuantity > 0 || s.batchesNeeded > 0 ? `${format(new Date(s.suggestedStartDate), "MMM d")} (W${s.calendarWeek})` : "—",
  ]);

  const tableOptions: UserOptions = {
    startY: cursorY,
    head: [headers],
    body: rows,
    margin: { left: MARGIN, right: MARGIN },
    tableWidth: CONTENT_W,
    styles: {
      fontSize: 7.5,
      cellPadding: { top: 2.5, bottom: 2.5, left: 3, right: 3 },
      font: "helvetica",
      textColor: C.black,
      lineColor: C.border,
      lineWidth: 0.2,
      overflow: "linebreak",
    },
    headStyles: {
      fillColor: C.primary,
      textColor: C.white,
      fontStyle: "bold",
      fontSize: 7,
      halign: "center",
    },
    columnStyles: {
      0:  { cellWidth: 17, halign: "center" },
      1:  { cellWidth: 44 },
      2:  { cellWidth: 20, halign: "right" },
      3:  { cellWidth: 20, halign: "right" },
      4:  { cellWidth: 20, halign: "right" },
      5:  { cellWidth: 20, halign: "right" },
      6:  { cellWidth: 16, halign: "right" },
      7:  { cellWidth: 25, halign: "center" },
      8:  { cellWidth: 20, halign: "right" },
      9:  { cellWidth: 22, halign: "center" },
      10: { cellWidth: 27, halign: "center" },
    },
    didParseCell(data) {
      if (data.section !== "body") return;
      const s = suggestions[data.row.index];
      if (!s) return;
      data.cell.styles.fillColor = urgencyFill(s.urgency);
      if (data.column.index === 0) {
        data.cell.styles.fontStyle = "bold";
        data.cell.styles.textColor = urgencyColor(s.urgency);
      }
      if (data.column.index === 1) data.cell.styles.fontStyle = "bold";
      if (data.column.index === 7 && s.daysUntilStockout !== Infinity) {
        data.cell.styles.textColor = stockoutColor(s.daysUntilStockout);
        data.cell.styles.fontStyle = "bold";
      }
      if (data.column.index === 8 && s.committedQuantity > 0) {
        data.cell.styles.textColor = C.blue;
        data.cell.styles.fontStyle = "bold";
      }
    },
    didDrawCell(data) {
      if (data.section !== "body") return;
      const s = suggestions[data.row.index];
      if (!s || s.urgency !== "critical" || data.column.index !== 0) return;
      // Red left accent bar on critical rows
      doc.setFillColor(...C.critical);
      doc.rect(data.cell.x, data.cell.y, 1.5, data.cell.height, "F");
    },
  };

  autoTable(doc, tableOptions);

  // ── Footer on every page ─────────────────────────────────────────────────────
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    const pageH = doc.internal.pageSize.getHeight();
    doc.setFillColor(...C.grayLight);
    doc.rect(0, pageH - 8, PAGE_W, 8, "F");
    doc.setFontSize(6.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...C.gray);
    doc.text("Elevated Organics — Confidential", MARGIN, pageH - 2.5);
    doc.text(`Page ${i} of ${pageCount}`, PAGE_W - MARGIN, pageH - 2.5, { align: "right" });
  }

  doc.save(`production-needs-${format(now, "yyyy-MM-dd")}.pdf`);
}
