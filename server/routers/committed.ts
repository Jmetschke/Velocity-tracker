import { protectedProcedure, router } from "../_core/trpc";
import { z } from "zod";
import * as db from "../db";
import { getWeekStartDate, getWeekEndDate } from "../scheduling";
import type { InsertCommittedBatch } from "../../drizzle/schema";

export const committedRouter = router({
  list: protectedProcedure.query(() => db.getAllCommittedBatches()),

  create: protectedProcedure
    .input(
      z.object({
        skuId: z.number(),
        quantity: z.number().positive(),
        calendarWeek: z.number().min(1).max(53),
        calendarYear: z.number().min(2024),
        notes: z.string().max(1000).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const startDate = getWeekStartDate(input.calendarWeek, input.calendarYear);
      const endDate = getWeekEndDate(input.calendarWeek, input.calendarYear);
      const id = await db.createCommittedBatch({
        skuId: input.skuId,
        quantity: input.quantity,
        calendarWeek: input.calendarWeek,
        calendarYear: input.calendarYear,
        startDate,
        endDate,
        notes: input.notes ?? null,
        createdBy: ctx.user?.id ?? null,
      });
      return { id };
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        status: z.enum(["planned", "in_progress", "completed", "cancelled"]).optional(),
        quantity: z.number().positive().optional(),
        calendarWeek: z.number().min(1).max(53).optional(),
        calendarYear: z.number().min(2024).optional(),
        notes: z.string().max(1000).optional(),
      })
    )
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      const updateData: Record<string, unknown> = { ...data };
      if (data.calendarWeek && data.calendarYear) {
        updateData.startDate = getWeekStartDate(data.calendarWeek, data.calendarYear);
        updateData.endDate = getWeekEndDate(data.calendarWeek, data.calendarYear);
      }
      await db.updateCommittedBatch(id, updateData as Partial<InsertCommittedBatch>);
      return { success: true };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await db.deleteCommittedBatch(input.id);
      return { success: true };
    }),
});
