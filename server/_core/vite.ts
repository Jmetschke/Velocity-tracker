import express, { type Express } from "express";
import fs from "fs";
import { type Server } from "http";
import { nanoid } from "nanoid";
import path from "path";
import { createServer as createViteServer } from "vite";
import viteConfig from "../../vite.config";

export async function setupVite(app: Express, server: Server) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true as const,
  };

  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    server: serverOptions,
    appType: "custom",
  });

  app.use(vite.middlewares);
  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;

    try {
      const clientTemplate = path.resolve(
        import.meta.dirname,
        "../..",
        "client",
        "index.html"
      );

      // always reload the index.html file from disk incase it changes
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}

export function serveStatic(app: Express) {
  const distPath =
    process.env.NODE_ENV === "development"
      ? path.resolve(import.meta.dirname, "../..", "dist", "public")
      : path.resolve(import.meta.dirname, "public");
  if (!fs.existsSync(distPath)) {
    console.error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`
    );
  }

  app.use(express.static(distPath));

  // Older installed PWAs may launch cached HTML that still points at a
  // previous Vite entry hash. Redirect only legacy entry-shaped filenames to
  // the stable entry; other missing chunks must remain real 404 responses.
  app.get(/^\/assets\/index-[A-Za-z0-9_-]+\.js$/, (_req, res) => {
    res.redirect(307, "/assets/app.js");
  });

  // Hashed build assets must return a real 404 when they no longer exist.
  // The SPA fallback below is only valid for application routes.
  app.use("/assets", (_req, res) => {
    res.status(404).type("text/plain").send("Asset not found");
  });

  // fall through to index.html if the file doesn't exist
  app.use("*", (req, res) => {
    if (req.path.startsWith("/api/")) {
      res.status(404).json({ error: "API route not found", path: req.path });
      return;
    }
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
