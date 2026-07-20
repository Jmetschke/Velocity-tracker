import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("lazy chunk deployment recovery", () => {
  it("keeps application pages in the main bundle", () => {
    const appSource = fs.readFileSync(
      path.resolve(__dirname, "../client/src/App.tsx"),
      "utf8",
    );

    expect(appSource).not.toContain("lazy(");
    expect(appSource).not.toContain("lazyWithReload(");
    expect(appSource).not.toContain('import("./pages/');
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
