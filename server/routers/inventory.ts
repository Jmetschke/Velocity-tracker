import { protectedProcedure, router } from "../_core/trpc";
import { z } from "zod";
import * as db from "../db";
import { parseInventoryReport, findBestSkuMatch } from "../parsers";
import { parseMetrcExport, type MetrcParsedItem } from "../metrc-parser";
import { validateInventory, validateMetrc } from "../data-validation";
import { ensureDefaultSkus, seedDefaultCatalog } from "../default-catalog";

const MAX_FILE = 10_000_000;
const FILE_TOO_LARGE = "File too large (max ~7.5 MB)";

function normalizeSkuName(name: string) {
  return name
    .trim()
    .toLowerCase()
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/\u00a0/g, " ")
    .replace(/\s*-\s*/g, " - ")
    .replace(/(\d+)\s*-?\s*pack/g, "$1pk")
    .replace(/\s+/g, " ");
}

function findExactSkuMatch(
  parsedName: string,
  dbSkus: Array<{ id: number; name: string }>
) {
  const normalized = normalizeSkuName(parsedName);
  return dbSkus.find(sku => normalizeSkuName(sku.name) === normalized) ?? null;
}

function findMetrcSkuMatch(
  parsed: MetrcParsedItem,
  dbSkus: Array<{ id: number; name: string }>
) {
  for (const itemName of parsed.itemNames) {
    const exactItemNameMatch = findExactSkuMatch(itemName, dbSkus);
    if (exactItemNameMatch) return exactItemNameMatch;
  }

  const exactSkuNameMatch = findExactSkuMatch(parsed.skuName, dbSkus);
  if (exactSkuNameMatch) return exactSkuNameMatch;

  return (
    findBestSkuMatch(parsed.skuName, dbSkus) ??
    parsed.itemNames
      .map(itemName => findBestSkuMatch(itemName, dbSkus))
      .find((match): match is { id: number; name: string } => Boolean(match)) ??
    null
  );
}

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
    .input(
      z.object({
        fileBase64: z.string().max(MAX_FILE, FILE_TOO_LARGE),
        fileName: z.string(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const buffer = Buffer.from(input.fileBase64, "base64");

      const parsedItems = await parseInventoryReport(buffer);
      await seedDefaultCatalog();
      const allSkus = await db.getAllSkus();

      const validation = validateInventory(parsedItems, allSkus);
      if (!validation.valid) {
        return {
          validation,
          snapshotId: null,
          matchedItems: 0,
          totalParsed: parsedItems.length,
          unmatchedNames: [],
        };
      }

      const snapshotId = await db.createInventorySnapshot({
        uploadedBy: ctx.user?.id ?? null,
        fileName: input.fileName,
        snapshotDate: new Date(),
      });

      const items: Array<{
        skuId: number;
        qtyInInventory: number;
        qtyOnHold: number;
        totalQty: number;
      }> = [];
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
        await db.createInventoryItems(
          items.map(item => ({ snapshotId, ...item }))
        );
      }

      return {
        snapshotId,
        matchedItems: items.length,
        totalParsed: parsedItems.length,
        unmatchedNames,
        validation,
      };
    }),

  uploadMetrc: protectedProcedure
    .input(
      z.object({
        fileBase64: z.string().max(MAX_FILE, FILE_TOO_LARGE),
        fileName: z.string(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const buffer = Buffer.from(input.fileBase64, "base64");

      const result = await parseMetrcExport(buffer);
      const validation = validateMetrc(result);
      if (!validation.valid) {
        return {
          validation,
          snapshotId: null,
          matchedItems: 0,
          totalRows: result.totalRows,
          includedRows: result.includedRows,
          excludedRows: result.excludedRows,
          unmatchedNames: [],
          unmatchedRows: result.unmatchedRows,
          parsedItems: [],
        };
      }

      await ensureDefaultSkus(result.items.map(item => item.skuName));
      const allSkus = await db.getAllSkus();
      const snapshotId = await db.createInventorySnapshot({
        uploadedBy: ctx.user?.id ?? null,
        fileName: `[METRC] ${input.fileName}`,
        snapshotDate: new Date(),
      });

      const items: Array<{
        skuId: number;
        qtyInInventory: number;
        qtyOnHold: number;
        totalQty: number;
      }> = [];
      const unmatchedNames: string[] = [];

      for (const parsed of result.items) {
        const match = findMetrcSkuMatch(parsed, allSkus);
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
        await db.createInventoryItems(
          items.map(item => ({ snapshotId, ...item }))
        );
      }

      return {
        status: "completed" as const,
        snapshotId,
        matchedItems: items.length,
        totalRows: result.totalRows,
        includedRows: result.includedRows,
        excludedRows: result.excludedRows,
        unmatchedNames,
        unmatchedRows: result.unmatchedRows,
        parsedItems: result.items.map(i => ({
          skuName: i.skuName,
          available: i.available,
          wip: i.wip,
        })),
        validation,
      };
    }),
});
