import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
};

/** Local single-user context. This app does not require login or OAuth. */
const LOCAL_USER: User = {
  id: 1,
  openId: "local-user",
  name: "Workspace",
  email: null,
  role: "admin",
  loginMethod: "none",
  lastSignedIn: new Date(),
  createdAt: new Date(),
  updatedAt: new Date(),
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  return {
    req: opts.req,
    res: opts.res,
    user: { ...LOCAL_USER, lastSignedIn: new Date() },
  };
}
