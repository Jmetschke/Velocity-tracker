import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import { parseQuickBooksExport, isPartialMonth } from "./quickbooks-parser";
import type { QBParseResult } from "./quickbooks-parser";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

// ─── Helpers to build synthetic QB workbooks ─────────────────────────

async function buildQBWorkbook(opts: {
  months?: string[];
  products?: Array<{ name: string; qtyPerMonth?: number[] }>;
  categories?: Array<{
    name: string;
    products: Array<{ name: string; qtyPerMonth?: number[] }>;
  }>;
  extraRows?: Array<{ name: string; qtyPerMonth?: number[] }>;
}): Promise<Buffer> {
  const months = opts.months ?? ["Jan 2025", "Feb 2025", "Mar 2025"];
  const stride = 7;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Sheet1");

  ws.getCell(1, 1).value = "Elevated Organics, LLC";
  ws.getCell(2, 1).value = "Sales by Product/Service Summary";
  ws.getCell(3, 1).value = "All Dates";

  // Row 5 (1-indexed): month headers — maps to 0-indexed row 4
  months.forEach((m, i) => {
    ws.getCell(5, 2 + i * stride).value = m;
  });
  const totalCol = 2 + months.length * stride;
  ws.getCell(5, totalCol).value = "Total";

  // Row 6: sub-headers
  const subH = [
    "Quantity",
    "Amount",
    "% of Sales",
    "Avg Price",
    "COGS",
    "Gross Margin",
    "Gross Margin %",
  ];
  months.forEach((_, i) => {
    subH.forEach((h, j) => {
      ws.getCell(6, 2 + i * stride + j).value = h;
    });
  });
  subH.forEach((h, j) => {
    ws.getCell(6, totalCol + j).value = h;
  });

  let row = 7;
  function writeProduct(name: string, qtyPerMonth: number[], indent = false) {
    ws.getCell(row, 1).value = indent ? `   ${name}` : name;
    let tq = 0,
      ta = 0;
    qtyPerMonth.forEach((qty, i) => {
      const c = 2 + i * stride;
      ws.getCell(row, c).value = qty;
      const amt = qty * 10;
      ws.getCell(row, c + 1).value = amt;
      tq += qty;
      ta += amt;
    });
    ws.getCell(row, totalCol).value = tq;
    ws.getCell(row, totalCol + 1).value = ta;
    row++;
  }

  for (const cat of opts.categories ?? []) {
    ws.getCell(row, 1).value = cat.name;
    row++;
    for (const p of cat.products)
      writeProduct(p.name, p.qtyPerMonth ?? months.map(() => 100), true);
    ws.getCell(row, 1).value = `Total ${cat.name}`;
    row++;
  }
  for (const p of opts.products ?? [])
    writeProduct(p.name, p.qtyPerMonth ?? months.map(() => 100));
  for (const p of opts.extraRows ?? [])
    writeProduct(p.name, p.qtyPerMonth ?? months.map(() => 50));

  return Buffer.from(await wb.xlsx.writeBuffer());
}

async function buildCustomQBWorkbook(opts: {
  months: string[];
  totalHeader?: string;
  dataRows: Array<{ name: string; qty: number; amt: number }>;
}): Promise<Buffer> {
  const stride = 7;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Sheet1");
  ws.getCell(1, 1).value = "Company";
  ws.getCell(2, 1).value = "Report";
  ws.getCell(3, 1).value = "Dates";
  opts.months.forEach((m, i) => {
    ws.getCell(5, 2 + i * stride).value = m;
  });
  const tc = 2 + opts.months.length * stride;
  ws.getCell(5, tc).value = opts.totalHeader ?? "Total";
  const subH = [
    "Quantity",
    "Amount",
    "% of Sales",
    "Avg Price",
    "COGS",
    "Gross Margin",
    "Gross Margin %",
  ];
  opts.months.forEach((_, i) => {
    subH.forEach((h, j) => {
      ws.getCell(6, 2 + i * stride + j).value = h;
    });
  });
  opts.dataRows.forEach((d, idx) => {
    const r = 7 + idx;
    ws.getCell(r, 1).value = d.name;
    ws.getCell(r, 2).value = d.qty;
    ws.getCell(r, 3).value = d.amt;
    ws.getCell(r, tc).value = d.qty;
    ws.getCell(r, tc + 1).value = d.amt;
  });
  return Buffer.from(await wb.xlsx.writeBuffer());
}

async function buildQBDetailWorkbook(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Sheet1");
  ws.getCell(1, 1).value = "Elevated Organics, LLC";
  ws.getCell(2, 1).value = "Sales by Product/Service Detail";
  ws.getCell(3, 1).value = "January 1-May 10, 2026";
  const headers = [
    "",
    "Transaction date",
    "Transaction type",
    "Num",
    "Customer full name",
    "Description",
    "Quantity",
    "Sales price",
    "Amount",
    "Balance",
  ];
  headers.forEach((h, i) => {
    ws.getCell(5, i + 1).value = h;
  });

  let row = 6;
  function product(name: string) {
    ws.getCell(row++, 1).value = name;
  }
  function sale(date: string, qty: number, amount = qty * 5) {
    ws.getCell(row, 2).value = date;
    ws.getCell(row, 3).value = "Invoice";
    ws.getCell(row, 5).value = "Dispensary";
    ws.getCell(row, 6).value = "Product sale";
    ws.getCell(row, 7).value = qty;
    ws.getCell(row, 8).value = amount / qty;
    ws.getCell(row, 9).value = amount;
    row++;
  }
  function total(name: string) {
    ws.getCell(row++, 1).value = `Total for ${name}`;
  }

  product("OG alpha - 2pk");
  sale("01/06/2026", 20);
  sale("02/10/2026", 30);
  sale("05/08/2026", 40);
  total("OG alpha - 2pk");

  product("Blue Razz Shooter");
  sale("04/10/2026", 15);
  total("Blue Razz Shooter");

  product("Magic Mango 1g Vape");
  sale("03/05/2026", 12);
  total("Magic Mango 1g Vape");

  product("1L Distillate for 1g Vapes");
  sale("03/19/2026", 11, 66000);
  total("1L Distillate for 1g Vapes");

  product("OG alpha 1pk (SAMPLE)");
  sale("03/20/2026", 99, 0.99);
  total("OG alpha 1pk (SAMPLE)");

  return Buffer.from(await wb.xlsx.writeBuffer());
}

// ─── Tests ───────────────────────────────────────────────────────────

describe("QuickBooks Parser", () => {
  describe("Sales by Product/Service Detail", () => {
    it("aggregates transaction rows by SKU and month", async () => {
      const result = await parseQuickBooksExport(await buildQBDetailWorkbook());
      const alpha = result.items.find(i => i.skuName === "Alpha Chunk - 2pk");
      const shooter = result.items.find(
        i => i.skuName === "Hijnx Shooter - Sour Blue Razz 2oz"
      );
      const vape = result.items.find(
        i => i.skuName === "Snackbar Vape - Mango Magic 1g"
      );

      expect(result.months).toEqual([
        "Jan 2026",
        "Feb 2026",
        "Mar 2026",
        "Apr 2026",
        "May 1-10 2026",
      ]);
      expect(result.partialMonths).toEqual(["May 1-10 2026"]);
      expect(result.unmatchedRows).toHaveLength(0);
      expect(alpha?.totalQuantity).toBe(90);
      expect(alpha?.monthlyData.map(m => [m.month, m.quantity])).toEqual([
        ["Jan 2026", 20],
        ["Feb 2026", 30],
        ["May 1-10 2026", 40],
      ]);
      expect(shooter?.totalQuantity).toBe(15);
      expect(vape?.totalQuantity).toBe(12);
    });

    it("excludes samples and non-finished-goods rows from detail reports", async () => {
      const result = await parseQuickBooksExport(await buildQBDetailWorkbook());
      const names = [
        ...result.items.map(i => i.qbName.toLowerCase()),
        ...result.unmatchedRows.map(row => row.name.toLowerCase()),
      ];

      expect(names.some(name => name.includes("sample"))).toBe(false);
      expect(names.some(name => name.includes("distillate"))).toBe(false);
    });

    it("includes manually tracked excluded detail products", async () => {
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet("Sheet1");
      ws.getCell(1, 1).value = "Elevated Organics, LLC";
      ws.getCell(2, 1).value = "Sales by Product/Service Detail";
      ws.getCell(3, 1).value = "April 1-May 31, 2026";
      [
        "",
        "Transaction date",
        "Transaction type",
        "Num",
        "Customer full name",
        "Description",
        "Quantity",
        "Sales price",
        "Amount",
        "Balance",
      ].forEach((h, i) => {
        ws.getCell(5, i + 1).value = h;
      });

      let row = 6;
      const product = (name: string) => {
        ws.getCell(row++, 1).value = name;
      };
      const sale = (date: string, qty: number, amount = qty * 10) => {
        ws.getCell(row, 2).value = date;
        ws.getCell(row, 3).value = "Invoice";
        ws.getCell(row, 5).value = "Dispensary";
        ws.getCell(row, 6).value = "Product sale";
        ws.getCell(row, 7).value = qty;
        ws.getCell(row, 9).value = amount;
        row++;
      };
      const total = (name: string) => {
        ws.getCell(row++, 1).value = `Total for ${name}`;
      };

      product("Daytime Focus Micro Pump");
      sale("04/15/2026", 10);
      total("Daytime Focus Micro Pump");

      product("Pheotera Topical");
      product("The Pain Stick 2oz");
      sale("05/10/2026", 7);
      total("The Pain Stick 2oz");

      const result = await parseQuickBooksExport(
        Buffer.from(await wb.xlsx.writeBuffer()),
        {
          includeManualSkuNames: [
            "Hijnx Micro Pump 100mg/100mg Daytime Focus",
            "Pheotera Stick 2oz 100mg/100mg The Pain Stick",
          ],
        }
      );

      const focus = result.items.find(i => i.skuName.includes("Daytime Focus"));
      const stick = result.items.find(i => i.skuName.includes("Pain Stick"));

      expect(focus?.totalQuantity).toBe(10);
      expect(focus?.skuName).toBe("Hijnx Micro Pump 100mg/100mg Daytime Focus");
      expect(stick?.totalQuantity).toBe(7);
      expect(stick?.skuName).toBe(
        "Pheotera Stick 2oz 100mg/100mg The Pain Stick"
      );
    });
  });

  describe("SKU Mapping", () => {
    it("maps all Hijnx Edible products to correct SKUs", async () => {
      const buf = await buildQBWorkbook({
        categories: [
          {
            name: "Hijnx Edible",
            products: [
              { name: "Chill Chunk - 1pk" },
              { name: "Chill Chunks - 2pk" },
              { name: "OG alpha - 1pk" },
              { name: "OG alpha - 2pk" },
              { name: "OG rex - 2pk" },
              { name: "OG zuul - 2pk" },
              { name: "Sleep Chunk - 1pk" },
              { name: "Sleep Chunk - 2pk" },
              { name: "Space Chunk Minis" },
              { name: "Sugar Free Minis" },
              { name: "Micro Dots" },
              { name: "Whoopie Hi" },
            ],
          },
        ],
      });
      const result = await parseQuickBooksExport(buf);
      expect(result.items.map(i => i.skuName).sort()).toEqual([
        "Alpha Chunk - 1pk",
        "Alpha Chunk - 2pk",
        "Chill Chunk - 1pk",
        "Chill Chunk - 2pk",
        "MiNi's Chunks - 10pk",
        "Micro Dots",
        "Rex Chunk - 2pk",
        "Sleep Chunk - 1pk",
        "Sleep Chunk - 2pk",
        "Sugar Free MiNi's - 10pk",
        "Whoopie Hi",
        "Zuul Chunk - 2pk",
      ]);
    });

    it("maps all VAPE products to correct SKUs", async () => {
      const buf = await buildQBWorkbook({
        categories: [
          {
            name: "VAPE",
            products: [
              { name: "Grape Crush 1g Vape" },
              { name: "Lemon Yuzu 1g Vape" },
              { name: "Magic Mango 1g Vape" },
              { name: "Watermelon Lychee 1g Vape" },
            ],
          },
        ],
      });
      const result = await parseQuickBooksExport(buf);
      expect(result.items.map(i => i.skuName).sort()).toEqual([
        "Snackbar Vape - Grape Crush 1g",
        "Snackbar Vape - Lemon Yuzu 1g",
        "Snackbar Vape - Mango Magic 1g",
        "Snackbar Vape - Watermelon Lychee 1g",
      ]);
    });

    it("preserves original QB name in qbName field", async () => {
      const buf = await buildQBWorkbook({
        categories: [
          { name: "Hijnx Edible", products: [{ name: "OG alpha - 2pk" }] },
        ],
      });
      const result = await parseQuickBooksExport(buf);
      expect(result.items[0].qbName).toBe("OG alpha - 2pk");
      expect(result.items[0].skuName).toBe("Alpha Chunk - 2pk");
    });
  });

  describe("Exclusion Rules", () => {
    it("excludes all SAMPLE rows", async () => {
      const buf = await buildQBWorkbook({
        categories: [
          {
            name: "Hijnx Edible",
            products: [
              { name: "Chill Chunk - 1pk" },
              { name: "Chill Chunk - 1pk (SAMPLE)" },
              { name: "OG alpha - 2pk" },
              { name: "OG alpha 1pk (SAMPLE)" },
            ],
          },
        ],
      });
      const result = await parseQuickBooksExport(buf);
      expect(result.items).toHaveLength(2);
      expect(result.excludedRows.some(r => r.reason === "SAMPLE row")).toBe(
        true
      );
    });

    it("excludes all Pheotera products", async () => {
      const buf = await buildQBWorkbook({
        categories: [
          { name: "Hijnx Edible", products: [{ name: "Chill Chunk - 1pk" }] },
          {
            name: "Pheotera Topical",
            products: [
              { name: "Kick The Itch Lotion" },
              { name: "Romance Oil" },
              { name: "The Pain Stick 2oz" },
            ],
          },
        ],
      });
      const result = await parseQuickBooksExport(buf);
      expect(result.items).toHaveLength(1);
      expect(result.items[0].skuName).toBe("Chill Chunk - 1pk");
      expect(
        result.excludedRows.some(r => r.reason === "Category header")
      ).toBe(true);
      expect(
        result.excludedRows.some(
          r => r.reason === "Pheotera brand (child product)"
        )
      ).toBe(true);
    });

    it("excludes discontinued products", async () => {
      const buf = await buildQBWorkbook({
        categories: [
          {
            name: "Hijnx Edible",
            products: [
              { name: "Chill Chunk - 1pk" },
              { name: "Daytime Focus Micro Pump" },
              { name: "Good Night Sleep Micro Pump" },
              { name: "Goodnight Sleep Micro Pump" },
              { name: "Main Squeeze Party Pouch" },
            ],
          },
        ],
      });
      const result = await parseQuickBooksExport(buf);
      expect(result.items).toHaveLength(1);
      const excluded = result.excludedRows.map(r => r.name.trim());
      expect(excluded).toContain("Daytime Focus Micro Pump");
      expect(excluded).toContain("Good Night Sleep Micro Pump");
      expect(excluded).toContain("Main Squeeze Party Pouch");
    });

    it("includes manually tracked excluded summary products", async () => {
      const buf = await buildQBWorkbook({
        categories: [
          {
            name: "Hijnx Edible",
            products: [
              { name: "Good Night Sleep Micro Pump", qtyPerMonth: [12] },
            ],
          },
          {
            name: "Pheotera Topical",
            products: [{ name: "The Pain Stick 2oz", qtyPerMonth: [8] }],
          },
        ],
        months: ["Apr 2026"],
      });
      const result = await parseQuickBooksExport(buf, {
        includeManualSkuNames: [
          "Hijnx Micro Pump 100mg/200mg/200mg/200mg Good Night Sleep",
          "Pheotera Stick 2oz 100mg/100mg The Pain Stick",
        ],
      });

      expect(result.items.map(i => [i.skuName, i.totalQuantity])).toEqual([
        ["Hijnx Micro Pump 100mg/200mg/200mg/200mg Good Night Sleep", 12],
        ["Pheotera Stick 2oz 100mg/100mg The Pain Stick", 8],
      ]);
    });

    it("excludes non-product rows", async () => {
      const buf = await buildQBWorkbook({
        categories: [
          { name: "Hijnx Edible", products: [{ name: "Micro Dots" }] },
        ],
        extraRows: [
          { name: "Promotional Discounts" },
          { name: "Sales" },
          { name: "Write off misc underpayment" },
          { name: "Not Specified" },
          { name: "Pick up and Return of Oil" },
        ],
      });
      const result = await parseQuickBooksExport(buf);
      expect(result.items).toHaveLength(1);
      expect(result.items[0].skuName).toBe("Micro Dots");
    });

    it("excludes category headers and total rows", async () => {
      const buf = await buildQBWorkbook({
        categories: [
          { name: "Hijnx Edible", products: [{ name: "Whoopie Hi" }] },
        ],
      });
      const result = await parseQuickBooksExport(buf);
      expect(result.items).toHaveLength(1);
      expect(
        result.excludedRows.some(
          r => r.name === "Hijnx Edible" && r.reason === "Category header"
        )
      ).toBe(true);
      expect(
        result.excludedRows.some(
          r => r.name === "Total Hijnx Edible" && r.reason === "Total row"
        )
      ).toBe(true);
    });
  });

  describe("Month Detection", () => {
    it("detects standard month headers", async () => {
      const buf = await buildQBWorkbook({
        months: ["Jan 2024", "Feb 2024", "Mar 2024"],
        categories: [
          {
            name: "Hijnx Edible",
            products: [{ name: "Micro Dots", qtyPerMonth: [10, 20, 30] }],
          },
        ],
      });
      const result = await parseQuickBooksExport(buf);
      expect(result.months).toEqual(["Jan 2024", "Feb 2024", "Mar 2024"]);
    });

    it("detects partial month headers", async () => {
      const buf = await buildQBWorkbook({
        months: ["Jan 2026", "Feb 2026", "Mar 1-10, 2026"],
        categories: [
          {
            name: "Hijnx Edible",
            products: [{ name: "Micro Dots", qtyPerMonth: [10, 20, 5] }],
          },
        ],
      });
      const result = await parseQuickBooksExport(buf);
      expect(result.months).toContain("Mar 1-10, 2026");
    });

    it("correctly extracts monthly quantities with 7-column stride", async () => {
      const buf = await buildQBWorkbook({
        months: ["Jan 2025", "Feb 2025"],
        categories: [
          {
            name: "Hijnx Edible",
            products: [{ name: "Chill Chunk - 1pk", qtyPerMonth: [150, 200] }],
          },
        ],
      });
      const result = await parseQuickBooksExport(buf);
      const item = result.items[0];
      expect(item.monthlyData).toHaveLength(2);
      expect(item.monthlyData[0].month).toBe("Jan 2025");
      expect(item.monthlyData[0].quantity).toBe(150);
      expect(item.monthlyData[1].month).toBe("Feb 2025");
      expect(item.monthlyData[1].quantity).toBe(200);
    });

    it("extracts amount data alongside quantity", async () => {
      const buf = await buildQBWorkbook({
        months: ["Jan 2025"],
        categories: [
          {
            name: "Hijnx Edible",
            products: [{ name: "Micro Dots", qtyPerMonth: [50] }],
          },
        ],
      });
      const result = await parseQuickBooksExport(buf);
      expect(result.items[0].monthlyData[0].amount).toBe(500);
    });

    it("computes correct total quantity", async () => {
      const buf = await buildQBWorkbook({
        months: ["Jan 2025", "Feb 2025", "Mar 2025"],
        categories: [
          {
            name: "Hijnx Edible",
            products: [{ name: "Whoopie Hi", qtyPerMonth: [100, 200, 300] }],
          },
        ],
      });
      const result = await parseQuickBooksExport(buf);
      expect(result.items[0].totalQuantity).toBe(600);
    });
  });

  describe("CSV for AI", () => {
    it("generates CSV with app SKU names (not QB names)", async () => {
      const buf = await buildQBWorkbook({
        months: ["Jan 2025", "Feb 2025"],
        categories: [
          {
            name: "Hijnx Edible",
            products: [
              { name: "OG alpha - 1pk", qtyPerMonth: [10, 20] },
              { name: "Chill Chunks - 2pk", qtyPerMonth: [30, 40] },
            ],
          },
        ],
      });
      const result = await parseQuickBooksExport(buf);
      const lines = result.csvForAI.split("\n");
      expect(lines[0]).toContain("SKU Name");
      expect(lines.some(l => l.startsWith("Alpha Chunk - 1pk"))).toBe(true);
      expect(lines.some(l => l.includes("OG alpha"))).toBe(false);
    });
  });

  describe("Unmatched Rows", () => {
    it("reports unknown product names as unmatched", async () => {
      const buf = await buildQBWorkbook({
        products: [{ name: "Totally Unknown Product" }],
      });
      const result = await parseQuickBooksExport(buf);
      expect(result.items).toHaveLength(0);
      expect(result.unmatchedRows).toHaveLength(1);
      expect(result.unmatchedRows[0].reason).toBe("No SKU mapping found");
    });
  });

  describe("Partial Month Detection", () => {
    it("detects partial months like 'Mar 1-10, 2026'", () => {
      expect(isPartialMonth("Mar 1-10, 2026")).toBe(true);
    });
    it("detects partial months like 'Jan 15-31, 2025'", () => {
      expect(isPartialMonth("Jan 15-31, 2025")).toBe(true);
    });
    it("does not flag full months", () => {
      expect(isPartialMonth("Jan 2025")).toBe(false);
      expect(isPartialMonth("Feb 2024")).toBe(false);
    });

    it("populates partialMonths array in parse result", async () => {
      const buf = await buildQBWorkbook({
        months: ["Jan 2026", "Feb 2026", "Mar 1-10, 2026"],
        categories: [
          {
            name: "Hijnx Edible",
            products: [{ name: "Micro Dots", qtyPerMonth: [10, 20, 5] }],
          },
        ],
      });
      const result = await parseQuickBooksExport(buf);
      expect(result.partialMonths).toEqual(["Mar 1-10, 2026"]);
    });

    it("returns empty partialMonths when all months are full", async () => {
      const buf = await buildQBWorkbook({
        months: ["Jan 2025", "Feb 2025", "Mar 2025"],
        categories: [
          {
            name: "Hijnx Edible",
            products: [{ name: "Micro Dots", qtyPerMonth: [10, 20, 30] }],
          },
        ],
      });
      const result = await parseQuickBooksExport(buf);
      expect(result.partialMonths).toEqual([]);
    });

    it("adds partial month warning to CSV for AI", async () => {
      const buf = await buildQBWorkbook({
        months: ["Jan 2026", "Feb 2026", "Mar 1-10, 2026"],
        categories: [
          {
            name: "Hijnx Edible",
            products: [{ name: "Micro Dots", qtyPerMonth: [10, 20, 5] }],
          },
        ],
      });
      const result = await parseQuickBooksExport(buf);
      const lines = result.csvForAI.split("\n");
      expect(lines[0]).toContain("# NOTE");
      expect(lines[0]).toContain("PARTIAL");
    });

    it("does not add partial month warning when all months are full", async () => {
      const buf = await buildQBWorkbook({
        months: ["Jan 2025", "Feb 2025"],
        categories: [
          {
            name: "Hijnx Edible",
            products: [{ name: "Micro Dots", qtyPerMonth: [10, 20] }],
          },
        ],
      });
      const result = await parseQuickBooksExport(buf);
      const lines = result.csvForAI.split("\n");
      expect(lines[0]).not.toContain("# NOTE");
      expect(lines[0]).toContain("SKU Name");
    });
  });

  describe("Resilient Total Column", () => {
    it("matches 'Totals' (plural) as total column", async () => {
      const buf = await buildCustomQBWorkbook({
        months: ["Jan 2025"],
        totalHeader: "Totals",
        dataRows: [{ name: "Micro Dots", qty: 50, amt: 500 }],
      });
      const result = await parseQuickBooksExport(buf);
      expect(result.items[0].totalQuantity).toBe(50);
    });

    it("matches 'Grand Total' as total column", async () => {
      const buf = await buildCustomQBWorkbook({
        months: ["Jan 2025"],
        totalHeader: "Grand Total",
        dataRows: [{ name: "Whoopie Hi", qty: 75, amt: 750 }],
      });
      const result = await parseQuickBooksExport(buf);
      expect(result.items[0].totalQuantity).toBe(75);
    });
  });

  describe("Edge Cases", () => {
    it("handles empty workbook gracefully", async () => {
      const buf = await buildQBWorkbook({
        months: ["Jan 2025"],
        categories: [],
        products: [],
      });
      const result = await parseQuickBooksExport(buf);
      expect(result.items).toHaveLength(0);
      expect(result.totalRows).toBe(0);
    });

    it("skips products with zero sales across all months", async () => {
      const buf = await buildQBWorkbook({
        months: ["Jan 2025", "Feb 2025"],
        categories: [
          {
            name: "Hijnx Edible",
            products: [
              { name: "Micro Dots", qtyPerMonth: [0, 0] },
              { name: "Whoopie Hi", qtyPerMonth: [50, 0] },
            ],
          },
        ],
      });
      const result = await parseQuickBooksExport(buf);
      expect(result.items).toHaveLength(1);
      expect(result.items[0].skuName).toBe("Whoopie Hi");
    });

    it("handles many months (36+ columns)", async () => {
      const months: string[] = [];
      for (let y = 2023; y <= 2025; y++)
        for (const m of [
          "Jan",
          "Feb",
          "Mar",
          "Apr",
          "May",
          "Jun",
          "Jul",
          "Aug",
          "Sep",
          "Oct",
          "Nov",
          "Dec",
        ])
          months.push(`${m} ${y}`);
      const buf = await buildQBWorkbook({
        months,
        categories: [
          {
            name: "Hijnx Edible",
            products: [
              { name: "Micro Dots", qtyPerMonth: months.map((_, i) => i + 1) },
            ],
          },
        ],
      });
      const result = await parseQuickBooksExport(buf);
      expect(result.months).toHaveLength(36);
      expect(result.items[0].monthlyData).toHaveLength(36);
    });
  });

  // ─── Integration test with real file (if available) ────────────────

  const realFilePath = resolve(__dirname, "../test-fixtures/qb-sales.xlsx");
  const hasRealFile = existsSync(realFilePath);

  describe.skipIf(!hasRealFile)("Real QuickBooks File", () => {
    it("parses without errors", async () => {
      const buf = readFileSync(realFilePath);
      const result = await parseQuickBooksExport(buf);
      expect(result).toBeDefined();
      expect(result.items.length).toBeGreaterThan(0);
    });

    it("detects 39 month columns from the real file", async () => {
      const buf = readFileSync(realFilePath);
      const result = await parseQuickBooksExport(buf);
      expect(result.months.length).toBe(39);
      expect(result.months[0]).toBe("Jan 2023");
    });

    it("maps all expected edible SKUs", async () => {
      const buf = readFileSync(realFilePath);
      const result = await parseQuickBooksExport(buf);
      const skuNames = result.items.map(i => i.skuName);
      for (const s of [
        "Alpha Chunk - 1pk",
        "Alpha Chunk - 2pk",
        "Chill Chunk - 1pk",
        "Chill Chunk - 2pk",
        "Sleep Chunk - 1pk",
        "Sleep Chunk - 2pk",
        "Rex Chunk - 2pk",
        "Zuul Chunk - 2pk",
        "MiNi's Chunks - 10pk",
        "Sugar Free MiNi's - 10pk",
        "Micro Dots",
        "Whoopie Hi",
      ])
        expect(skuNames).toContain(s);
    });

    it("maps all expected vape SKUs", async () => {
      const buf = readFileSync(realFilePath);
      const result = await parseQuickBooksExport(buf);
      const skuNames = result.items.map(i => i.skuName);
      for (const s of [
        "Snackbar Vape - Grape Crush 1g",
        "Snackbar Vape - Lemon Yuzu 1g",
        "Snackbar Vape - Mango Magic 1g",
        "Snackbar Vape - Watermelon Lychee 1g",
      ])
        expect(skuNames).toContain(s);
    });

    it("excludes all Pheotera and SAMPLE rows", async () => {
      const buf = readFileSync(realFilePath);
      const result = await parseQuickBooksExport(buf);
      const allNames = [
        ...result.items.map(i => i.skuName),
        ...result.items.map(i => i.qbName),
      ];
      expect(allNames.some(n => n.toLowerCase().includes("pheotera"))).toBe(
        false
      );
      expect(
        result.items.some(i => i.qbName.toLowerCase().includes("sample"))
      ).toBe(false);
    });

    it("has no unmatched rows for known products", async () => {
      const buf = readFileSync(realFilePath);
      const result = await parseQuickBooksExport(buf);
      expect(result.unmatchedRows).toHaveLength(0);
    });

    it("generates valid CSV for AI with partial month warning", async () => {
      const buf = readFileSync(realFilePath);
      const result = await parseQuickBooksExport(buf);
      const lines = result.csvForAI.split("\n");
      expect(lines.length).toBeGreaterThanOrEqual(18);
      expect(lines[0]).toContain("# NOTE");
      expect(lines[1]).toContain("SKU Name");
    });

    it("detects the partial month in the real file", async () => {
      const buf = readFileSync(realFilePath);
      const result = await parseQuickBooksExport(buf);
      expect(result.partialMonths.length).toBeGreaterThan(0);
      expect(result.partialMonths[0]).toContain("Mar");
    });
  });
});
