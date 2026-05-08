/**
 * Root tRPC router — thin aggregator that merges domain-specific sub-routers.
 *
 * Each domain router lives in server/routers/<domain>.ts and owns its own
 * input validation, business logic, and DB calls.  Keeping this file slim
 * makes the API surface scannable at a glance.
 */

import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";

import {
  categoriesRouter,
  skusRouter,
  inventoryRouter,
  salesRouter,
  committedRouter,
  productionRouter,
  notificationsRouter,
} from "./routers/index";

export const appRouter = router({
  system: systemRouter,

  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  categories: categoriesRouter,
  skus: skusRouter,
  inventory: inventoryRouter,
  sales: salesRouter,
  committed: committedRouter,
  production: productionRouter,
  notifications: notificationsRouter,
});

export type AppRouter = typeof appRouter;
