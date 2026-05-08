/**
 * Shared password gate for the site.
 *
 * Visitors without a Manus OAuth session can enter a shared password
 * to get full access. The password is stored in env (SITE_PASSWORD).
 *
 * Flow:
 *   1. Express middleware checks for `site_access` cookie on every request.
 *   2. If missing/invalid AND no OAuth session, HTML requests get a password form;
 *      API requests get 401.
 *   3. POST /api/site-gate/verify compares the password and sets the cookie.
 *   4. POST /api/site-gate/status returns whether the gate cookie is valid.
 */

import { parse as parseCookieHeader } from "cookie";
import crypto from "crypto";
import type { Request, Response, NextFunction, Express } from "express";
import { ENV } from "./_core/env";

const GATE_COOKIE = "site_access";

// ─── Helpers ────────────────────────────────────────────────────────

/** HMAC token: HMAC(password, secret). Changing either invalidates cookies. */
function makeGateToken(password: string): string {
  return crypto
    .createHmac("sha256", ENV.cookieSecret)
    .update(password)
    .digest("hex");
}

/**
 * Constant-time string comparison that never throws on length mismatch.
 * Hashes both sides to fixed-length buffers before comparing.
 */
function safeEqual(a: string, b: string): boolean {
  const ha = crypto.createHash("sha256").update(a).digest();
  const hb = crypto.createHash("sha256").update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function isValidGateToken(token: string): boolean {
  if (!ENV.sitePassword) return false;
  return safeEqual(token, makeGateToken(ENV.sitePassword));
}

// ─── Public API ─────────────────────────────────────────────────────

/** Check if the request carries a valid gate cookie. */
export function hasValidGateCookie(req: Request): boolean {
  const raw = req.headers.cookie;
  if (!raw) return false;
  const cookies = parseCookieHeader(raw);
  const token = cookies[GATE_COOKIE];
  if (!token || token.length !== 64) return false;
  try {
    return isValidGateToken(token);
  } catch {
    return false;
  }
}

/** Register the gate routes and middleware on the Express app. */
export function registerSiteGate(app: Express) {
  if (!ENV.sitePassword) return;

  // ─── Verification endpoint ──────────────────────────────────────
  app.post("/api/site-gate/verify", (req: Request, res: Response) => {
    const { password } = req.body ?? {};
    if (!password || typeof password !== "string") {
      return res.status(400).json({ ok: false, error: "Password required" });
    }

    if (!safeEqual(password, ENV.sitePassword)) {
      return res.status(401).json({ ok: false, error: "Incorrect password" });
    }

    const token = makeGateToken(password);
    res.cookie(GATE_COOKIE, token, {
      httpOnly: true,
      path: "/",
      sameSite: "lax",
      secure: req.protocol === "https" || req.headers["x-forwarded-proto"] === "https",
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    });

    return res.json({ ok: true });
  });

  // ─── Status endpoint ────────────────────────────────────────────
  app.get("/api/site-gate/status", (req: Request, res: Response) => {
    return res.json({ gated: true, authenticated: hasValidGateCookie(req) });
  });

  // ─── Gate middleware ────────────────────────────────────────────
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith("/api/site-gate/")) return next();
    if (req.path.startsWith("/api/oauth/")) return next();

    if (hasValidGateCookie(req)) return next();

    if (req.path.startsWith("/api/trpc/")) {
      // tRPC batch link expects a JSON array where each item is a tRPC error
      // envelope. Returning a plain { error: string } causes tRPC to throw
      // "Unable to transform response from server" on the client.
      const trpcError = {
        error: {
          message: "Site password required",
          code: -32001, // UNAUTHORIZED in tRPC's JSON-RPC code space
          data: { code: "UNAUTHORIZED", httpStatus: 401 },
        },
      };
      // Batch requests expect an array; single requests expect a plain object.
      // The batch link always sends ?batch=1 so we always return an array.
      const body = req.query.batch ? [trpcError] : trpcError;
      return res.status(401).json(body);
    }

    if (req.path.startsWith("/api/")) {
      return res.status(401).json({ error: "Site password required" });
    }

    return next();
  });
}
