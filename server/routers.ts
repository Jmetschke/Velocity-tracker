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
    logout: publicProcedure.mutation(() => {
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
