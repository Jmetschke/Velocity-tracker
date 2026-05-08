import { protectedProcedure, router } from "../_core/trpc";
import { z } from "zod";
import * as db from "../db";
import type { InsertSkuCategory } from "../../drizzle/schema";

export const categoriesRouter = router({
  list: protectedProcedure.query(() => db.getAllCategories()),

  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1),
        theoreticalBatchSize: z.number().positive(),
        lossPercent: z.number().min(0).max(100).default(5),
      })
    )
    .mutation(async ({ input }) => {
      const netBatchSize = Math.floor(
        input.theoreticalBatchSize * (1 - input.lossPercent / 100)
      );
      const id = await db.createCategory({
        name: input.name,
        theoreticalBatchSize: input.theoreticalBatchSize,
        lossPercent: String(input.lossPercent),
        netBatchSize,
      });
      return { id };
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        name: z.string().min(1).optional(),
        theoreticalBatchSize: z.number().positive().optional(),
        lossPercent: z.number().min(0).max(100).optional(),
      })
    )
    .mutation(async ({ input }) => {
      const updateData: Record<string, unknown> = {};
      if (input.name) updateData.name = input.name;
      if (input.theoreticalBatchSize !== undefined)
        updateData.theoreticalBatchSize = input.theoreticalBatchSize;
      if (input.lossPercent !== undefined)
        updateData.lossPercent = String(input.lossPercent);

      if (input.theoreticalBatchSize !== undefined || input.lossPercent !== undefined) {
        const current = await db.getCategoryById(input.id);
        const batchSize = input.theoreticalBatchSize ?? current?.theoreticalBatchSize ?? 1000;
        const loss = input.lossPercent ?? parseFloat(String(current?.lossPercent ?? "5"));
        updateData.netBatchSize = Math.floor(batchSize * (1 - loss / 100));
      }

      await db.updateCategory(input.id, updateData as Partial<InsertSkuCategory>);
      return { success: true };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await db.deleteCategory(input.id);
      return { success: true };
    }),
});
