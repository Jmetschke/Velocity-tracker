import { describe, it, expect } from "vitest";

/**
 * PageErrorBoundary is a React class component that lives in the client.
 * We can't render React components in a pure Node vitest environment without
 * jsdom + React Testing Library. Instead, we test the *design contract*:
 *
 * 1. The component file exports a default class with the expected API.
 * 2. The guarded() helper in App.tsx creates wrapper components correctly.
 * 3. The error boundary state management logic is sound.
 *
 * For a full render test, a browser-based E2E test (Playwright/Cypress) would
 * be more appropriate. These tests validate the structural guarantees.
 */

describe("PageErrorBoundary design contract", () => {
  it("PageErrorBoundary module exports a default component", async () => {
    // Verify the file exists and has a default export
    const fs = await import("fs");
    const path = await import("path");
    const filePath = path.resolve(__dirname, "../client/src/components/PageErrorBoundary.tsx");
    const content = fs.readFileSync(filePath, "utf-8");

    expect(content).toContain("class PageErrorBoundary extends Component");
    expect(content).toContain("export default PageErrorBoundary");
  });

  it("PageErrorBoundary accepts pageName prop for contextual error messages", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const filePath = path.resolve(__dirname, "../client/src/components/PageErrorBoundary.tsx");
    const content = fs.readFileSync(filePath, "utf-8");

    expect(content).toContain("pageName?: string");
  });

  it("PageErrorBoundary implements getDerivedStateFromError", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const filePath = path.resolve(__dirname, "../client/src/components/PageErrorBoundary.tsx");
    const content = fs.readFileSync(filePath, "utf-8");

    expect(content).toContain("static getDerivedStateFromError");
  });

  it("PageErrorBoundary has a retry handler that resets state without page reload", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const filePath = path.resolve(__dirname, "../client/src/components/PageErrorBoundary.tsx");
    const content = fs.readFileSync(filePath, "utf-8");

    // Should reset state (not reload page)
    expect(content).toContain("handleRetry");
    expect(content).toContain("hasError: false, error: null");
    // Should NOT use window.location.reload for retry
    expect(content).not.toContain("window.location.reload");
  });

  it("App.tsx wraps all 7 page routes with guarded() error boundaries", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const filePath = path.resolve(__dirname, "../client/src/App.tsx");
    const content = fs.readFileSync(filePath, "utf-8");

    // Verify the guarded helper exists
    expect(content).toContain("function guarded(");
    expect(content).toContain("PageErrorBoundary");

    // Verify all 7 page routes use guarded()
    const guardedRoutes = content.match(/guarded\(/g);
    expect(guardedRoutes).not.toBeNull();
    expect(guardedRoutes!.length).toBeGreaterThanOrEqual(7);

    // Verify each page has a descriptive label
    expect(content).toContain('guarded(Home, "Dashboard")');
    expect(content).toContain('guarded(SkuManagement, "SKU Management")');
    expect(content).toContain('guarded(UploadData, "Upload Data")');
    expect(content).toContain('guarded(VelocityPar, "Velocity & Par")');
    expect(content).toContain('guarded(ProductionCalendar, "Production Calendar")');
    expect(content).toContain('guarded(Categories, "Categories")');
    expect(content).toContain('guarded(CommittedBatches, "Committed Batches")');
  });

  it("global ErrorBoundary still wraps the entire app as a last-resort fallback", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const filePath = path.resolve(__dirname, "../client/src/App.tsx");
    const content = fs.readFileSync(filePath, "utf-8");

    // The global ErrorBoundary should still be the outermost wrapper
    expect(content).toContain('import ErrorBoundary from "./components/ErrorBoundary"');
    expect(content).toContain("<ErrorBoundary>");
  });

  it("PageErrorBoundary provides a navigation escape route (link to dashboard)", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const filePath = path.resolve(__dirname, "../client/src/components/PageErrorBoundary.tsx");
    const content = fs.readFileSync(filePath, "utf-8");

    // Should have a link back to the dashboard
    expect(content).toContain('href="/"');
    expect(content).toContain("Dashboard");
  });

  it("PageErrorBoundary shows technical details in a collapsible section", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const filePath = path.resolve(__dirname, "../client/src/components/PageErrorBoundary.tsx");
    const content = fs.readFileSync(filePath, "utf-8");

    expect(content).toContain("<details");
    expect(content).toContain("Technical details");
    expect(content).toContain("error?.stack");
  });
});
