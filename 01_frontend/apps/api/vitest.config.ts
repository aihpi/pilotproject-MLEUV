import { defineConfig } from "vitest/config";

/**
 * Tests gegen die Routen, ohne Server und ohne Netz.
 *
 * `server.ts` startet seit dem 06.10.2026 nur noch, wenn es direkt aufgerufen wird, und
 * exportiert sonst `app`. Damit greift `app.inject()`, Fastifys Weg, eine Route aufzurufen,
 * ohne zu lauschen.
 *
 * Die Entwürfe liegen in einer Datei, und `server.ts` liest sie beim Import. Die Tests
 * zeigen deshalb über `DRAFTS_FILE` auf eine eigene — sonst arbeiten sie auf dem echten
 * Bestand der Bearbeiterin.
 */
export default defineConfig({
  test: { environment: "node", include: ["src/**/*.test.ts"] },
});
