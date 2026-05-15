import { protectedProcedure, router } from "../_core/trpc";
import { z } from "zod";
import * as db from "../db";
import {
  PRODUCT_LAUNCH_ROADMAP,
  PRODUCT_LAUNCH_STATUSES,
} from "../../shared/product-launch-roadmap";
import type { InsertProductLaunch } from "../../drizzle/schema";

const statusSchema = z.enum(PRODUCT_LAUNCH_STATUSES);

function seededChecklistItems() {
  return PRODUCT_LAUNCH_ROADMAP.flatMap((stage) =>
    stage.tasks.map((taskText) => ({
      stageNumber: stage.stageNumber,
      stageName: stage.stageName,
      taskText,
      isComplete: false,
      notes: null,
      completedAt: null,
    }))
  );
}

export const productLaunchesRouter = router({
  list: protectedProcedure.query(() => db.getAllProductLaunches()),

  get: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const launch = await db.getProductLaunchById(input.id);
      if (!launch) return null;
      const checklistItems = await db.getProductLaunchChecklistItems(input.id);
      return { launch, checklistItems };
    }),

  create: protectedProcedure
    .input(
      z.object({
        productName: z.string().min(1).max(200),
        codename: z.string().max(200).optional(),
        status: statusSchema.default("draft"),
        notes: z.string().max(2000).optional(),
      })
    )
    .mutation(async ({ input }) => {
      const id = await db.createProductLaunch(
        {
          productName: input.productName,
          codename: input.codename?.trim() || null,
          status: input.status,
          notes: input.notes?.trim() || null,
        },
        seededChecklistItems()
      );
      return { id };
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        productName: z.string().min(1).max(200).optional(),
        codename: z.string().max(200).nullable().optional(),
        status: statusSchema.optional(),
        notes: z.string().max(2000).nullable().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      const updateData: Partial<InsertProductLaunch> = {};
      if (data.productName !== undefined) updateData.productName = data.productName;
      if (data.codename !== undefined) updateData.codename = data.codename?.trim() || null;
      if (data.status !== undefined) updateData.status = data.status;
      if (data.notes !== undefined) updateData.notes = data.notes?.trim() || null;
      await db.updateProductLaunch(id, updateData);
      return { success: true };
    }),

  updateChecklistItem: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        isComplete: z.boolean().optional(),
        notes: z.string().max(2000).nullable().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const updateData: Record<string, unknown> = {};
      if (input.isComplete !== undefined) {
        updateData.isComplete = input.isComplete;
        updateData.completedAt = input.isComplete ? new Date() : null;
      }
      if (input.notes !== undefined) updateData.notes = input.notes?.trim() || null;
      await db.updateProductLaunchChecklistItem(input.id, updateData);
      return { success: true };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await db.deleteProductLaunch(input.id);
      return { success: true };
    }),
});
