import { protectedProcedure, router } from "../_core/trpc";
import { z } from "zod";
import * as db from "../db";

export const notificationsRouter = router({
  getSettings: protectedProcedure.query(({ ctx }) =>
    db.getNotificationSettings(ctx.user.id)
  ),

  updateSettings: protectedProcedure
    .input(
      z.object({
        stockoutThresholdDays: z.number().min(1).max(30),
        emailEnabled: z.boolean(),
        notificationFrequency: z.enum(["immediate", "daily", "weekly"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await db.createOrUpdateNotificationSettings({
        userId: ctx.user.id,
        stockoutThresholdDays: input.stockoutThresholdDays,
        emailEnabled: input.emailEnabled,
        notificationFrequency: input.notificationFrequency,
      });
      return { success: true };
    }),

  getHistory: protectedProcedure
    .input(z.object({ limit: z.number().optional() }))
    .query(({ ctx, input }) => db.getNotificationHistory(ctx.user.id, input.limit)),

  checkAndNotify: protectedProcedure.mutation(async ({ ctx }) => {
    const { checkAndNotifyStockoutRisks } = await import("../notifications");
    await checkAndNotifyStockoutRisks(ctx.user);
    return { success: true, message: "Notification check completed" };
  }),
});
