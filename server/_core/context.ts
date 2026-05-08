import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { sdk } from "./sdk";
import { hasValidGateCookie } from "../site-gate";
import { ENV } from "./env";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
};

/** Synthetic guest user for password-gated visitors (no Manus account). */
const GUEST_USER: User = {
  id: 0,
  openId: "guest",
  name: "Guest",
  email: null,
  role: "user",
  loginMethod: null,
  lastSignedIn: new Date(),
  createdAt: new Date(),
  updatedAt: new Date(),
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;

  try {
    user = await sdk.authenticateRequest(opts.req);
  } catch (error) {
    // Authentication is optional for public procedures.
    user = null;
  }

  // If no OAuth user but the visitor passed the site password gate,
  // treat them as a guest with full access.
  if (!user && ENV.sitePassword && hasValidGateCookie(opts.req)) {
    user = { ...GUEST_USER, lastSignedIn: new Date() };
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
  };
}
