/**
 * Hook for managing the shared site password gate.
 *
 * On mount, checks /api/site-gate/status to see if a gate is active
 * and whether the visitor has already authenticated.
 * Provides a `verify` function to submit the password.
 *
 * After a successful verify the page is hard-reloaded so the browser
 * starts a brand-new navigation with the Set-Cookie already committed
 * to the cookie jar. This is the only reliable way to guarantee that
 * tRPC queries fired on the first render see the cookie — any in-place
 * React re-render races the browser's async cookie-storage step.
 */
import { useState, useEffect, useCallback } from "react";

type GateState = {
  /** True while checking gate status */
  loading: boolean;
  /** True if the site has a password gate enabled */
  gated: boolean;
  /** True if the visitor has passed the gate */
  authenticated: boolean;
  /** Error message from the last verify attempt */
  error: string | null;
  /** Submit a password to unlock the gate */
  verify: (password: string) => Promise<boolean>;
};

async function fetchGateStatus(): Promise<{ gated: boolean; authenticated: boolean }> {
  const r = await fetch("/api/site-gate/status", { credentials: "include" });
  return r.json();
}

export function useSiteGate(): GateState {
  const [loading, setLoading] = useState(true);
  const [gated, setGated] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchGateStatus()
      .then((data) => {
        setGated(data.gated ?? false);
        setAuthenticated(data.authenticated ?? false);
      })
      .catch(() => {
        // If the endpoint doesn't exist, gate is not enabled
        setGated(false);
        setAuthenticated(true);
      })
      .finally(() => setLoading(false));
  }, []);

  const verify = useCallback(async (password: string): Promise<boolean> => {
    setError(null);
    try {
      const res = await fetch("/api/site-gate/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error || "Incorrect password");
        return false;
      }
      // Hard-reload the page so the browser starts a fresh navigation with
      // the Set-Cookie already committed to the cookie jar. Any in-place
      // React re-render races the browser's async cookie-storage step,
      // causing tRPC queries to fire before the cookie is available.
      window.location.reload();
      return true;
    } catch {
      setError("Network error. Please try again.");
      return false;
    }
  }, []);

  return { loading, gated, authenticated, error, verify };
}
