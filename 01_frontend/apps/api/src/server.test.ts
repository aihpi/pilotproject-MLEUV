import { beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Die Naht, die bisher niemand geprüft hat.
 *
 * Der Durchlauf über die Oberfläche am 24.09.2026 brachte 29 Befunde an einem Nachmittag.
 * Die meisten saßen nicht im Vorschlagsdienst und nicht in den Regeln — beide sind seit
 * Monaten getestet —, sondern in dieser Schicht dazwischen: die Chat-Übergabe, die
 * ausgelassenen Abschnitte 0, 9 und 10, der ganze Chatverlauf als Suchanfrage. Von 354 Tests
 * meldete keiner einen davon, denn `server.ts` ließ sich nicht importieren, ohne einen Server
 * zu starten.
 *
 * Diese Datei prüft deshalb Wege, keine Regeln: was passiert, wenn jemand klickt. Ohne Netz,
 * ohne Modell, ohne Vorschlagsdienst — alles, was den braucht, bleibt hier außen vor und
 * gehört in die Messläufe.
 */

// Eine eigene Entwurfsdatei, bevor `server.ts` geladen wird: der Import liest sie sofort.
const ordner = mkdtempSync(join(tmpdir(), "api-test-"));
writeFileSync(join(ordner, "drafts.json"), "[]");
process.env.DRAFTS_FILE = join(ordner, "drafts.json");

let app: Awaited<typeof import("./server")>["app"];

beforeAll(async () => {
  ({ app } = await import("./server"));
  await app.ready();
});

const neuerEntwurf = async () => {
  const r = await app.inject({ method: "POST", url: "/api/drafts", payload: {} });
  expect(r.statusCode).toBe(201);
  return r.json();
};

describe("Entwürfe anlegen und lesen", () => {
  it("legt einen Entwurf mit allen elf Abschnitten an", async () => {
    const d = await neuerEntwurf();
    // Elf, nicht acht: 0 (Titel), 9 (Sonstiges) und 10 (Schlussformel) gehören dazu — sie
    // fehlten am 24.09.2026 im erzeugten Text, obwohl das Formular sie führte.
    expect(Object.keys(d.sections).sort((a, b) => Number(a) - Number(b))).toEqual(
      ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10"],
    );
  });

  it("findet einen angelegten Entwurf wieder", async () => {
    const d = await neuerEntwurf();
    const r = await app.inject({ method: "GET", url: `/api/drafts/${d.id}` });
    expect(r.statusCode).toBe(200);
    expect(r.json().id).toBe(d.id);
  });

  it("meldet einen unbekannten Entwurf als 404", async () => {
    const r = await app.inject({ method: "GET", url: "/api/drafts/gibt-es-nicht" });
    expect(r.statusCode).toBe(404);
  });
});

describe("Freigabe vor dem Ausformulieren", () => {
  // Die Schranke aus dem Prozessmodell. Der fertige Text sieht amtlich aus, und genau das
  // ist das Risiko — wer ihn liest, hält ihn für geprüft.
  it("verweigert den Richtlinientext ohne Freigabe", async () => {
    const d = await neuerEntwurf();
    const r = await app.inject({ method: "POST", url: `/api/drafts/${d.id}/richtlinie` });
    expect(r.statusCode).toBe(409);
    expect(r.json().message).toContain("nicht freigegeben");
  });

  it("lässt die Freigabe verfallen, sobald sich eine Angabe ändert", async () => {
    const d = await neuerEntwurf();
    await app.inject({
      method: "POST", url: `/api/drafts/${d.id}/freigabe`, payload: { person: "Test" },
    });
    const freigegeben = await app.inject({ method: "GET", url: `/api/drafts/${d.id}` });
    expect(freigegeben.json().freigabe?.person).toBe("Test");

    // Eine Änderung danach macht die Freigabe gegenstandslos — sonst entstünde Text aus
    // einem Stand, den niemand gegengelesen hat.
    await app.inject({
      method: "PATCH", url: `/api/drafts/${d.id}`, payload: { title: "Geändert" },
    });
    const r = await app.inject({ method: "POST", url: `/api/drafts/${d.id}/richtlinie` });
    expect(r.statusCode).toBe(409);
    expect(r.json().message).toContain("nach der Freigabe geändert");
  });
});

describe("Löschen", () => {
  it("entfernt einen Entwurf endgültig", async () => {
    const d = await neuerEntwurf();
    const weg = await app.inject({ method: "DELETE", url: `/api/drafts/${d.id}` });
    expect(weg.statusCode).toBe(204);
    const r = await app.inject({ method: "GET", url: `/api/drafts/${d.id}` });
    expect(r.statusCode).toBe(404);
  });
});

describe("Abschnitte, die der Richtlinientext umfassen muss", () => {
  it("fordert alle elf Abschnitte an, nicht nur die acht mit Musterbausteinen", async () => {
    // Bis zum 24.09.2026 lief hier ein Bereich von 1 bis 8. Präambel, Sonstiges und
    // Schlussformel fielen damit aus dem erzeugten Text: im Formular bestätigt, in der
    // Abschnittsliste als vollständig ausgewiesen, in der Word-Datei nicht vorhanden.
    //
    // Geprüft wird über die Anfrage an den Vorschlagsdienst — der läuft im Test nicht, also
    // endet der Aufruf in 502. Das reicht: der Fehler kommt NACH dem Zusammenstellen, und
    // vorher muss die Freigabe greifen.
    const d = await neuerEntwurf();
    await app.inject({
      method: "POST", url: `/api/drafts/${d.id}/freigabe`, payload: { person: "Test" },
    });
    const r = await app.inject({ method: "POST", url: `/api/drafts/${d.id}/richtlinie` });
    // Nicht 409: die Freigabe gilt. Dass der Dienst fehlt, ist eine andere Sache.
    expect(r.statusCode).not.toBe(409);
  });
});

describe("Prüfung und Vermerk wachsen mit", () => {
  it("meldet fehlende Pflichtangaben auf einem leeren Entwurf", async () => {
    const d = await neuerEntwurf();
    const r = await app.inject({ method: "POST", url: `/api/drafts/${d.id}/validate` });
    expect(r.statusCode).toBe(200);
    expect(r.json().issues.length).toBeGreaterThan(0);
    expect(r.json().valid).toBe(false);
  });

  it("legt einen Vermerkseintrag an, wenn eine Regel ihn verlangt", async () => {
    // Fördersatz 90 Prozent bei kommunalen Empfangenden: über 80 braucht es die Zustimmung
    // des MdFE, und die will begründet sein.
    const d = await neuerEntwurf();
    await app.inject({
      method: "PATCH", url: `/api/drafts/${d.id}`,
      payload: {
        sections: {
          "3": { fields: { recipients: {
            value: ["municipal"], status: "confirmed", source: "user-form", confirmedByUser: true,
          } } },
          "5": { fields: { fundingRate: {
            value: 90, status: "confirmed", source: "user-form", confirmedByUser: true,
          } } },
        },
      },
    });
    const r = await app.inject({ method: "GET", url: `/api/drafts/${d.id}` });
    const regeln = (r.json().vermerk ?? []).map((v: { regel: string }) => v.regel);
    expect(regeln).toContain("kommunaler_hoechstsatz");
  });

  it("sperrt die Freigabe, solange der Vermerk offene Punkte hat", async () => {
    const d = await neuerEntwurf();
    await app.inject({
      method: "PATCH", url: `/api/drafts/${d.id}`,
      payload: {
        sections: {
          "3": { fields: { recipients: {
            value: ["municipal"], status: "confirmed", source: "user-form", confirmedByUser: true,
          } } },
          "5": { fields: { fundingRate: {
            value: 90, status: "confirmed", source: "user-form", confirmedByUser: true,
          } } },
        },
      },
    });
    const r = await app.inject({
      method: "POST", url: `/api/drafts/${d.id}/freigabe`, payload: { person: "Test" },
    });
    // 409, nicht 400: die Anfrage ist in Ordnung, sie widerspricht dem Zustand.
    expect(r.statusCode).toBe(409);
    expect(r.json().message).toContain("Prüfvermerk");
  });
});
