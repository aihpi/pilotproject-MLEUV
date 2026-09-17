import "@testing-library/jest-dom/vitest";

/**
 * Node 26 belegt `localStorage` global vor, liefert aber `undefined`, solange die Laufzeit
 * ohne `--localstorage-file` startet. jsdom überschreibt einen bereits vorhandenen Namen
 * nicht — im Test steht damit weder das eine noch das andere zur Verfügung, und jede
 * Komponente, die den Entwurfsstand sichert, stirbt beim ersten Effekt.
 *
 * Deshalb hier ein Speicher im Arbeitsspeicher. Er lebt pro Testdatei und ist danach weg,
 * was dem gewünschten Verhalten entspricht: Tests sollen sich nichts merken.
 */
if (!globalThis.localStorage) {
  const inhalt = new Map<string, string>();
  const speicher: Storage = {
    get length() {
      return inhalt.size;
    },
    clear: () => inhalt.clear(),
    getItem: (k) => inhalt.get(k) ?? null,
    key: (i) => [...inhalt.keys()][i] ?? null,
    removeItem: (k) => void inhalt.delete(k),
    setItem: (k, v) => void inhalt.set(k, String(v)),
  };
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: speicher,
  });
}
