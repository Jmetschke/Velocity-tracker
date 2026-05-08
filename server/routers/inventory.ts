import { protectedProcedure, router } from "../_core/trpc";
import { z } from "zod";
import * as db from "../db";
import { storagePut } from "../storage";
import { nanoid } from "nanoid";
import { parseInventoryReport, findBestSkuMatch } from "../parsers";
import { parseMetrcExport } from "../metrc-parser";
import { validateInventory, validateMetrc } from "../data-validation";

const MAX_FILE = 10_000_000;
const FILE_TOO_LARGE = "File too large (max ~7.5 MB)";

export const inventoryRouter = router({
  latestSnapshot: protectedProcedure.query(async () => {
    const snapshot = await db.getLatestSnapshot();
    if (!snapshot) return null;
    const items = await db.getSnapshotItems(snapshot.id);
    return { snapshot, items };
  }),

  allSnapshots: protectedProcedure.query(() => db.getAllSnapshots()),

  snapshotItems: protectedProcedure
    .input(z.object({ snapshotId: z.number() }))
    .query(({ input }) => db.getSnapshotItems(input.snapshotId)),

  upload: protectedProcedure
    .input(z.object({ fileBase64: z.string().max(MAX_FILE, FILE_TOO_LARGE), fileName: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const buffer = Buffer.from(input.fileBase64, "base64");
      const fileKey = `inventory/${nanoid()}-${input.fileName}`;
      await storagePut(fileKey, buffer, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");

      const parsedItems = await parseInventoryReport(buffer);
      const allSkus = await db.getAllSkus();

      const validation = validateInventory(parsedItems, allSkus);
      if (!validation.valid) {
        return { validation, snapshotId: null, matchedItems: 0, totalParsed: parsedItems.length, unmatchedNames: [] };
      }

      const snapshotId = await db.createInventorySnapshot({
        uploadedBy: ctx.user?.id ?? null,
        fileName: input.fileName,
        snapshotDate: new Date(),
      });

      const items: Array<{ skuId: number; qtyInInventory: number; qtyOnHold: number; totalQty: number }> = [];
      const unmatchedNames: string[] = [];

      for (const parsed of parsedItems) {
        const match = findBestSkuMatch(parsed.fullName, allSkus);
        if (match) {
          items.push({
            skuId: match.id,
            qtyInInventory: parsed.qtyInInventory,
            qtyOnHold: parsed.qtyOnHold,
            totalQty: parsed.totalQty,
          });
        } else {
          unmatchedNames.push(parsed.fullName);
        }
      }

      if (items.length > 0) {
        await db.createInventoryItems(items.map((item) => ({ snapshotId, ...item })));
      }

      return { snapshotId, matchedItems: items.length, totalParsed: parsedItems.length, unmatchedNames, validation };
    }),

  uploadMetrc: protectedProcedure
    .input(z.object({ fileBase64: z.string().max(MAX_FILE, FILE_TOO_LARGE), fileName: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const buffer = Buffer.from(input.fileBase64, "base64");
      const fileKey = `inventory/metrc-${nanoid()}-${input.fileName}`;
      await storagePut(fileKey, buffer, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");

      const result = await parseMetrcExport(buffer);
      const validation = validateMetrc(result);
      if (!validation.valid) {
        return {
          validation, snapshotId: null, matchedItems: 0,
          totalRows: result.totalRows, includedRows: result.includedRows,
          excludedRows: result.excludedRows, unmatchedNames: [],
          unmatchedRows: result.unmatchedRows, parsedItems: [],
        };
      }

      const allSkus = await db.getAllSkus();
      const snapshotId = await db.createInventorySnapshot({
        uploadedBy: ctx.user?.id ?? null,
        fileName: `[METRC] ${input.fileName}`,
        snapshotDate: new Date(),
      });

      const items: Array<{ skuId: number; qtyInInventory: number; qtyOnHold: number; totalQty: number }> = [];
      const unmatchedNames: string[] = [];

      for (const parsed of result.items) {
        const match = findBestSkuMatch(parsed.skuName, allSkus);
        if (match) {
          items.push({
            skuId: match.id,
            qtyInInventory: parsed.available,
            qtyOnHold: parsed.wip,
            totalQty: parsed.available + parsed.wip,
          });
        } else {
          unmatchedNames.push(parsed.skuName);
        }
      }

      if (items.length > 0) {
        await db.createInventoryItems(items.map((item) => ({ snapshotId, ...item })));
      }

      return {
        snapshotId, matchedItems: items.length,
        totalRows: result.totalRows, includedRows: result.includedRows,
        excludedRows: result.excludedRows, unmatchedNames,
        unmatchedRows: result.unmatchedRows,
        parsedItems: result.items.map((i) => ({ skuName: i.skuName, available: i.available, wip: i.wip })),
        validation,
      };
    }),
});
