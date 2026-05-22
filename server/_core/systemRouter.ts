import { z } from "zod";
import { notifyOwner } from "./notification";
import { adminProcedure, publicProcedure, router } from "./trpc";

export const systemRouter = router({
  health: publicProcedure
    .input(
      z.object({
        timestamp: z.number().min(0, "timestamp cannot be negative"),
      })
    )
    .query(() => ({
      ok: true,
      appVersion: "metrc-sku-matching-83b5b4f",
      renderGitCommit: process.env.RENDER_GIT_COMMIT ?? null,
      tursoDatabaseUrlConfigured: Boolean(process.env.TURSO_DATABASE_URL),
      tursoAuthTokenConfigured: Boolean(process.env.TURSO_AUTH_TOKEN),
      tursoCalendarUrlConfigured: Boolean(process.env.TURSO_CALENDAR_URL),
      tursoCalendarTokenConfigured: Boolean(process.env.TURSO_CALENDAR_TOKEN),
    })),

  notifyOwner: adminProcedure
    .input(
      z.object({
        title: z.string().min(1, "title is required"),
        content: z.string().min(1, "content is required"),
      })
    )
    .mutation(async ({ input }) => {
      const delivered = await notifyOwner(input);
      return {
        success: delivered,
      } as const;
    }),
});
