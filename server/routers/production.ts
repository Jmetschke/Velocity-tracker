import { protectedProcedure, router } from "../_core/trpc";
import { z } from "zod";
import * as db from "../db";
import { generateScheduleSuggestions, addBusinessDays } from "../scheduling";
import type { InsertProductionBatch } from "../../drizzle/schema";

export const productionRouter = router({
  suggestions: protectedProcedure.query(async () => {
    const snapshot = await db.getLatestSnapshot();
    if (!snapshot) return { suggestions: [], snapshotDate: null };

    const items = await db.getSnapshotItems(snapshot.id);
    const allSkus = await db.getAllSkus();

    const committedBatches = await db.getActiveCommittedBatchesBySku();
    const committedBySkuId = new Map<number, number>();
    for (const cb of committedBatches) {
      const current = committedBySkuId.get(cb.skuId) ?? 0;
      committedBySkuId.set(cb.skuId, current + cb.quantity);
    }

    const skuInputs = allSkus
      .filter((s) => s.isActive)
      .map((sku) => {
        const invItem = items.find((i) => i.skuId === sku.id);
        return {
          skuId: sku.id,
          skuName: sku.name,
          currentStock: invItem?.qtyInInventory ?? 0,
          wipStock: invItem?.qtyOnHold ?? 0,
          dailyVelocity: parseFloat(String(sku.dailyVelocity ?? "0")),
          parLevel: sku.parLevel ?? 0,
          netBatchSize: sku.customBatchSize ?? sku.netBatchSize ?? 950,
          leadTimeDays: sku.leadTimeDays ?? 5,
          committedQuantity: committedBySkuId.get(sku.id) ?? 0,
          bufferDays: sku.bufferDays ?? 14,
        };
      });

    const suggestions = generateScheduleSuggestions(skuInputs);
    return { suggestions, skuInputs, snapshotDate: snapshot.snapshotDate };
  }),

  batches: protectedProcedure.query(async () => {
    const [prodBatches, committedBatches] = await Promise.all([
      db.getProductionBatches(),
      db.getAllCommittedBatches(),
    ]);
    const fromCommitted = committedBatches.map((cb) => ({
      id: cb.id,
      skuId: cb.skuId,
      skuName: cb.skuName ?? "Unknown",
      batchSize: cb.quantity,
      startDate: cb.startDate,
      endDate: cb.endDate,
      status: cb.status === "planned" ? "scheduled" : cb.status === "in_progress" ? "in_progress" : cb.status === "completed" ? "completed" : "cancelled",
      notes: cb.notes ? `[W${cb.calendarWeek}] ${cb.notes}` : `[W${cb.calendarWeek}] Committed`,
      source: "committed" as const,
    }));
    const fromProd = prodBatches.map((pb) => ({ ...pb, source: "scheduled" as const }));
    return [...fromProd, ...fromCommitted];
  }),

  scheduleBatch: protectedProcedure
    .input(
      z.object({
        skuId: z.number(),
        batchSize: z.number().positive(),
        startDate: z.string(),
        notes: z.string().max(1000).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const start = new Date(input.startDate);
      const allSkus = await db.getAllSkus();
      const sku = allSkus.find((s) => s.id === input.skuId);
      const leadDays = sku?.leadTimeDays ?? 5;
      const end = addBusinessDays(start, leadDays);
      const id = await db.createProductionBatch({
        skuId: input.skuId,
        batchSize: input.batchSize,
        startDate: start,
        endDate: end,
        status: "scheduled",
        notes: input.notes ?? null,
        createdBy: ctx.user?.id ?? null,
      });
      return { id };
    }),

  updateBatch: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        status: z.enum(["suggested", "scheduled", "in_progress", "completed", "cancelled"]).optional(),
        notes: z.string().max(1000).optional(),
      })
    )
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      await db.updateProductionBatch(id, data as Partial<InsertProductionBatch>);
      return { success: true };
    }),

  deleteBatch: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await db.deleteProductionBatch(input.id);
      return { success: true };
    }),
});
