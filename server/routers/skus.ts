import { protectedProcedure, router } from "../_core/trpc";
import { z } from "zod";
import * as db from "../db";
import { calculateParLevel } from "../scheduling";
import type { InsertSku } from "../../drizzle/schema";
import { findBestSkuMatch } from "../parsers";
import { parseProductionItemKey } from "../production-item-key-parser";
import { ensureCategoryForSkuName } from "../default-catalog";

function normalizeMetrcItemNames(value: string | null | undefined) {
  if (value == null) return value;
  const names = value
    .split(/[\n,]+/)
    .map(name => name.trim())
    .filter(Boolean);
  return names.length > 0 ? Array.from(new Set(names)).join("\n") : null;
}

function decodeWorkbook(fileBase64: string) {
  const data = fileBase64.includes(",")
    ? fileBase64.slice(fileBase64.indexOf(",") + 1)
    : fileBase64;
  const buffer = Buffer.from(data, "base64");
  if (buffer.length === 0) throw new Error("The uploaded workbook is empty.");
  return buffer;
}

async function previewProductionItemKey(fileBase64: string) {
  const parsedRows = await parseProductionItemKey(decodeWorkbook(fileBase64));
  const existingSkus = await db.getAllSkus();
  return parsedRows.map(row => {
    const match = findBestSkuMatch(row.commonName, existingSkus);
    return {
      ...row,
      status: match ? ("matched" as const) : ("new" as const),
      matchedSkuId: match?.id ?? null,
      matchedSkuName: match?.name ?? null,
    };
  });
}

export const skusRouter = router({
  list: protectedProcedure.query(() => db.getAllSkus()),

  previewProductionItemKey: protectedProcedure
    .input(
      z.object({
        fileBase64: z.string().min(1).max(15_000_000),
        fileName: z.string().min(1),
      }),
    )
    .mutation(async ({ input }) => ({
      rows: await previewProductionItemKey(input.fileBase64),
    })),

  importProductionItemKey: protectedProcedure
    .input(
      z.object({
        fileBase64: z.string().min(1).max(15_000_000),
        fileName: z.string().min(1),
      }),
    )
    .mutation(async ({ input }) => {
      const rows = await previewProductionItemKey(input.fileBase64);
      let created = 0;
      let updated = 0;

      for (const row of rows) {
        const metrcItemNames = normalizeMetrcItemNames(
          row.metrcItemNames.join("\n"),
        );

        if (row.matchedSkuId) {
          const existing = await db.getSkuById(row.matchedSkuId);
          if (!existing) continue;
          const mergedNames = normalizeMetrcItemNames(
            [existing.metrcItemNames, metrcItemNames].filter(Boolean).join("\n"),
          );
          await db.updateSku(existing.id, {
            metrcItemNames: mergedNames,
            isActive: true,
          });
          updated++;
          continue;
        }

        const categoryId = await ensureCategoryForSkuName(
          `${row.commonName} ${row.metrcItemNames.join(" ")}`,
        );
        if (!categoryId) {
          throw new Error(`Could not determine a category for ${row.commonName}.`);
        }
        await db.createSku({
          name: row.commonName,
          categoryId,
          dailyVelocity: 0,
          velocitySource: "manual",
          parLevel: 0,
          bufferDays: 14,
          leadTimeDays: 5,
          customBatchSize: row.batchSize,
          metrcItemNames,
          isActive: true,
        });
        created++;
      }

      return { created, updated, total: rows.length };
    }),

  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1),
        categoryId: z.number(),
        dailyVelocity: z.number().min(0).default(0),
        bufferDays: z.number().min(1).default(14),
        leadTimeDays: z.number().min(1).default(5),
        customBatchSize: z.number().positive().optional(),
        metrcItemNames: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const parLevel = calculateParLevel(input.dailyVelocity, input.bufferDays);
      const id = await db.createSku({
        name: input.name,
        categoryId: input.categoryId,
        dailyVelocity: input.dailyVelocity,
        velocitySource: "manual",
        parLevel,
        bufferDays: input.bufferDays,
        leadTimeDays: input.leadTimeDays,
        customBatchSize: input.customBatchSize ?? null,
        metrcItemNames: normalizeMetrcItemNames(input.metrcItemNames) ?? null,
      });
      return { id };
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        name: z.string().min(1).optional(),
        categoryId: z.number().optional(),
        bufferDays: z.number().min(1).optional(),
        leadTimeDays: z.number().min(1).optional(),
        customBatchSize: z.number().positive().nullable().optional(),
        metrcItemNames: z.string().nullable().optional(),
        isActive: z.boolean().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      if ("metrcItemNames" in data) {
        data.metrcItemNames = normalizeMetrcItemNames(data.metrcItemNames);
      }
      await db.updateSku(id, data as Partial<InsertSku>);
      return { success: true };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await db.deleteSku(input.id);
      return { success: true };
    }),

  updateVelocity: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        velocity: z.number().min(0),
        source: z.enum(["manual", "ai", "calculated"]).default("manual"),
      })
    )
    .mutation(async ({ input }) => {
      await db.updateSkuVelocity(input.id, input.velocity, input.source);
      return { success: true };
    }),

  bulkUpdateVelocity: protectedProcedure
    .input(
      z.object({
        updates: z.array(
          z.object({ skuId: z.number(), velocity: z.number().min(0) })
        ).min(1),
      })
    )
    .mutation(async ({ input }) => {
      for (const u of input.updates) {
        await db.updateSkuVelocity(u.skuId, u.velocity, "manual");
      }
      return { success: true, count: input.updates.length };
    }),
});
