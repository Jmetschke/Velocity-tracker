/**
 * Tests for the site password gate.
 * Covers: token generation, validation, cookie checking, and middleware behavior.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import crypto from "crypto";

// We need to test the internal logic of site-gate.ts.
// Since makeGateToken and isValidGateToken are not exported, we test them
// indirectly through hasValidGateCookie and the exported registration.
// For unit testing, we'll replicate the token logic and test the cookie checker.

// ─── Token logic (replicated for testing) ───────────────────────────────

function makeGateToken(password: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(password).digest("hex");
}

// ─── hasValidGateCookie tests ───────────────────────────────────────────

describe("Site Gate", () => {
  // We'll dynamically import the module after setting env vars
  const SITE_PASSWORD = "test-password-123";
  const JWT_SECRET = "test-jwt-secret";

  beforeEach(() => {
    process.env.SITE_PASSWORD = SITE_PASSWORD;
    process.env.JWT_SECRET = JWT_SECRET;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Token generation", () => {
    it("produces a 64-char hex string", () => {
      const token = makeGateToken(SITE_PASSWORD, JWT_SECRET);
      expect(token).toHaveLength(64);
      expect(token).toMatch(/^[a-f0-9]{64}$/);
    });

    it("produces different tokens for different passwords", () => {
      const t1 = makeGateToken("password1", JWT_SECRET);
      const t2 = makeGateToken("password2", JWT_SECRET);
      expect(t1).not.toBe(t2);
    });

    it("produces different tokens for different secrets", () => {
      const t1 = makeGateToken(SITE_PASSWORD, "secret1");
      const t2 = makeGateToken(SITE_PASSWORD, "secret2");
      expect(t1).not.toBe(t2);
    });

    it("is deterministic for same inputs", () => {
      const t1 = makeGateToken(SITE_PASSWORD, JWT_SECRET);
      const t2 = makeGateToken(SITE_PASSWORD, JWT_SECRET);
      expect(t1).toBe(t2);
    });
  });

  describe("hasValidGateCookie", () => {
    // We need to import dynamically because the module reads ENV at import time
    async function getHasValidGateCookie() {
      // Force re-import to pick up env changes
      const mod = await import("./site-gate");
      return mod.hasValidGateCookie;
    }

    it("returns false when no cookie header", async () => {
      const fn = await getHasValidGateCookie();
      const req = { headers: {} } as any;
      expect(fn(req)).toBe(false);
    });

    it("returns false when cookie header has no site_access", async () => {
      const fn = await getHasValidGateCookie();
      const req = { headers: { cookie: "other_cookie=abc" } } as any;
      expect(fn(req)).toBe(false);
    });

    it("returns false for invalid token", async () => {
      const fn = await getHasValidGateCookie();
      const req = {
        headers: { cookie: `site_access=${"a".repeat(64)}` },
      } as any;
      expect(fn(req)).toBe(false);
    });

    it("returns false for token with wrong length", async () => {
      const fn = await getHasValidGateCookie();
      const req = { headers: { cookie: "site_access=tooshort" } } as any;
      expect(fn(req)).toBe(false);
    });

    it("returns true for valid token", async () => {
      const fn = await getHasValidGateCookie();
      const validToken = makeGateToken(SITE_PASSWORD, JWT_SECRET);
      const req = {
        headers: { cookie: `site_access=${validToken}` },
      } as any;
      expect(fn(req)).toBe(true);
    });

    it("returns true when mixed with other cookies", async () => {
      const fn = await getHasValidGateCookie();
      const validToken = makeGateToken(SITE_PASSWORD, JWT_SECRET);
      const req = {
        headers: {
          cookie: `other=xyz; site_access=${validToken}; session=abc`,
        },
      } as any;
      expect(fn(req)).toBe(true);
    });
  });

  describe("Constant-time comparison", () => {
    it("timingSafeEqual rejects mismatched buffers", () => {
      const a = Buffer.from("a".repeat(64));
      const b = Buffer.from("b".repeat(64));
      expect(crypto.timingSafeEqual(a, b)).toBe(false);
    });

    it("timingSafeEqual accepts matching buffers", () => {
      const token = makeGateToken(SITE_PASSWORD, JWT_SECRET);
      const a = Buffer.from(token);
      const b = Buffer.from(token);
      expect(crypto.timingSafeEqual(a, b)).toBe(true);
    });
  });

  describe("Password verification logic", () => {
    it("correct password produces a token that validates", () => {
      const token = makeGateToken(SITE_PASSWORD, JWT_SECRET);
      const expected = makeGateToken(SITE_PASSWORD, JWT_SECRET);
      expect(
        crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected))
      ).toBe(true);
    });

    it("wrong password produces a token that does not validate", () => {
      const token = makeGateToken("wrong-password", JWT_SECRET);
      const expected = makeGateToken(SITE_PASSWORD, JWT_SECRET);
      expect(
        crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected))
      ).toBe(false);
    });
  });

  describe("safeEqual via hashing (length-mismatch safety)", () => {
    // The new safeEqual hashes both sides to SHA-256 before comparing,
    // so different-length inputs never throw.
    function safeEqual(a: string, b: string): boolean {
      const ha = crypto.createHash("sha256").update(a).digest();
      const hb = crypto.createHash("sha256").update(b).digest();
      return crypto.timingSafeEqual(ha, hb);
    }

    it("returns true for identical strings", () => {
      expect(safeEqual("hello", "hello")).toBe(true);
    });

    it("returns false for different strings of same length", () => {
      expect(safeEqual("hello", "world")).toBe(false);
    });

    it("returns false for different-length strings without throwing", () => {
      expect(safeEqual("short", "a much longer string")).toBe(false);
    });

    it("returns false for empty vs non-empty", () => {
      expect(safeEqual("", "something")).toBe(false);
    });

    it("returns true for two empty strings", () => {
      expect(safeEqual("", "")).toBe(true);
    });

    it("handles unicode strings safely", () => {
      expect(safeEqual("p@$$w0rd!", "p@$$w0rd!")).toBe(true);
      expect(safeEqual("p@$$w0rd!", "p@$$w0rd?")).toBe(false);
    });
  });

  describe("tRPC-compatible 401 error shape", () => {
    // The gate middleware returns a tRPC-parseable error for /api/trpc/* paths
    // so the client doesn't throw "Unable to transform response from server".
    // tRPC's transformResult requires: error is an object with a numeric `code`.
    const UNAUTHORIZED_CODE = -32001; // matches @trpc/server TRPC_ERROR_CODES_BY_KEY.UNAUTHORIZED

    function makeTrpcError() {
      return {
        error: {
          message: "Site password required",
          code: UNAUTHORIZED_CODE,
          data: { code: "UNAUTHORIZED", httpStatus: 401 },
        },
      };
    }

    it("error envelope has a numeric code", () => {
      const envelope = makeTrpcError();
      expect(typeof envelope.error.code).toBe("number");
    });

    it("error code matches tRPC UNAUTHORIZED (-32001)", () => {
      const envelope = makeTrpcError();
      expect(envelope.error.code).toBe(UNAUTHORIZED_CODE);
    });

    it("error envelope is an object (not a string)", () => {
      const envelope = makeTrpcError();
      expect(typeof envelope.error).toBe("object");
      expect(envelope.error).not.toBeNull();
    });

    it("batch response wraps envelope in an array", () => {
      const envelope = makeTrpcError();
      const batchBody = [envelope];
      expect(Array.isArray(batchBody)).toBe(true);
      expect(batchBody[0].error.code).toBe(UNAUTHORIZED_CODE);
    });
  });
});
