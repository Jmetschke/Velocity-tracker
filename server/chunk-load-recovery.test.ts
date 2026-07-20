import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { isChunkLoadError } from "../client/src/lib/lazyWithReload";

describe("lazy chunk deployment recovery", () => {
  it.each([
    "Failed to fetch dynamically imported module: /assets/page-old.js",
    "Importing a module script failed.",
    "Loading chunk 42 failed",
    "Expected a JavaScript-module script but the server responded with a MIME type of text/html",
  ])("recognizes browser chunk-load errors: %s", message => {
    expect(isChunkLoadError(new TypeError(message))).toBe(true);
  });

  it("does not reload for ordinary render errors", () => {
    expect(isChunkLoadError(new Error("Cannot read properties of undefined"))).toBe(false);
  });

  it("does not use the SPA shell as an asset fallback", () => {
    const viteSource = fs.readFileSync(
      path.resolve(__dirname, "_core/vite.ts"),
      "utf8",
    );
    const serviceWorkerSource = fs.readFileSync(
      path.resolve(__dirname, "../client/public/service-worker.js"),
      "utf8",
    );

    expect(viteSource).toContain('app.use("/assets"');
    expect(serviceWorkerSource).toContain('request.mode === "navigate"');
    expect(serviceWorkerSource).not.toContain(
      'cached => cached ?? caches.match("/")',
    );
  });
});
