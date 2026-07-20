import { lazy, type ComponentType, type LazyExoticComponent } from "react";

const CHUNK_RELOAD_KEY = "elevated-ops:chunk-reload-attempted";

/** Detect the messages browsers use when a deployed lazy-loaded module vanished. */
export function isChunkLoadError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);

  return /(?:failed to fetch dynamically imported module|importing a module script failed|error loading dynamically imported module|loading chunk [\d-]+ failed|expected a javascript(?:-module)? script|mime type.*(?:javascript|module))/i.test(
    message,
  );
}

/**
 * Recover an already-open PWA after a deployment replaces hashed lazy chunks.
 * A single reload fetches the new app shell; the session flag prevents loops.
 */
export function lazyWithReload<T extends ComponentType<any>>(
  importer: () => Promise<{ default: T }>,
): LazyExoticComponent<T> {
  return lazy(async () => {
    try {
      const module = await importer();
      sessionStorage.removeItem(CHUNK_RELOAD_KEY);
      return module;
    } catch (error) {
      if (
        isChunkLoadError(error) &&
        sessionStorage.getItem(CHUNK_RELOAD_KEY) !== "true"
      ) {
        sessionStorage.setItem(CHUNK_RELOAD_KEY, "true");
        window.location.reload();

        // Keep Suspense active while the browser reloads the current document.
        return await new Promise<never>(() => undefined);
      }

      sessionStorage.removeItem(CHUNK_RELOAD_KEY);
      throw error;
    }
  });
}
