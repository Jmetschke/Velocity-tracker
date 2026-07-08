import { protectedProcedure, router } from "../_core/trpc";
import { z } from "zod";
import * as db from "../db";
import { calculateParLevel } from "../scheduling";
import type { InsertSku } from "../../drizzle/schema";

function normalizeMetrcItemNames(value: string | null | undefined) {
  if (value == null) return value;
  const names = value
    .split(/[\n,]+/)
    .map(name => name.trim())
    .filter(Boolean);
  return names.length > 0 ? Array.from(new Set(names)).join("\n") : null;
}

export const skusRouter = router({
  list: protectedProcedure.query(() => db.getAllSkus()),

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
