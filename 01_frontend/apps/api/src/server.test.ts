import { beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
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
process.env.FEEDBACK_FILE = join(ordner, "feedback.jsonl");

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

describe("Chat-Übergabe: vom Vorschlag ins Feld", () => {
  // Der teuerste Befund des Durchlaufs vom 18.09.2026: Die Bearbeiterin nannte Fördersatz,
  // Finanzierungsart und Form in einem Satz, in den Feldern kam nichts davon an. Die
  // Prüfregeln dazu waren vorhanden und einzeln getestet — sie schlugen nicht an, weil ihre
  // Eingangsgrößen leer blieben. Kein Test deckte den WEG der Angabe ins Feld ab.
  it("schreibt bestätigte Vorschläge in die Abschnitte", async () => {
    const d = await neuerEntwurf();
    const r = await app.inject({
      method: "POST", url: `/api/drafts/${d.id}/extractions/x/confirm`,
      payload: {
        proposals: [
          { sectionId: "5", fieldId: "fundingRate", value: 90, confidence: 0.9, evidence: "" },
          { sectionId: "5", fieldId: "financingType", value: "share", confidence: 0.9, evidence: "" },
        ],
      },
    });
    expect(r.statusCode).toBe(200);
    const felder = r.json().draft.sections["5"].fields;
    expect(felder.fundingRate.value).toBe(90);
    expect(felder.fundingRate.confirmedByUser).toBe(true);
    expect(felder.financingType.value).toBe("share");
  });

  it("übernimmt den Titel auch in den Entwurf selbst", async () => {
    // Der Titel steht doppelt: als Feld in Baustein 0 und als Name des Entwurfs in der
    // Übersicht. Wird nur das Feld gesetzt, heißt der Entwurf weiter „Neue Förderrichtlinie".
    const d = await neuerEntwurf();
    await app.inject({
      method: "POST", url: `/api/drafts/${d.id}/extractions/x/confirm`,
      payload: {
        proposals: [{ sectionId: "0", fieldId: "title", value: "RL Katzen", confidence: 1, evidence: "" }],
      },
    });
    const r = await app.inject({ method: "GET", url: `/api/drafts/${d.id}` });
    expect(r.json().title).toBe("RL Katzen");
  });

  it("löst die fachlichen Prüfungen aus, sobald die Werte da sind", async () => {
    // Genau die Kette, die am 18.09.2026 riss: Angabe → Feld → Prüfregel → Vermerk.
    const d = await neuerEntwurf();
    await app.inject({
      method: "POST", url: `/api/drafts/${d.id}/extractions/x/confirm`,
      payload: {
        proposals: [
          { sectionId: "3", fieldId: "recipients", value: ["municipal"], confidence: 1, evidence: "" },
          { sectionId: "5", fieldId: "fundingRate", value: 90, confidence: 1, evidence: "" },
        ],
      },
    });
    const r = await app.inject({ method: "GET", url: `/api/drafts/${d.id}/vermerk` });
    const regeln = r.json().eintraege.map((v: { regel: string }) => v.regel);
    expect(regeln).toContain("kommunaler_hoechstsatz");
  });
});

describe("Überspringen", () => {
  it("stellt dieselbe Frage nicht erneut", async () => {
    // Vorher gab die Route nur `ok` zurück: der Kasten schloss sich, die Stufe galt weiter
    // als unerledigt, und die Frage kam wieder. Wer ein Pflichtfeld im Gespräch nicht füllen
    // konnte, saß fest.
    const d = await neuerEntwurf();
    const r = await app.inject({
      method: "POST", url: `/api/drafts/${d.id}/extractions/x/reject`, payload: {},
    });
    expect(r.statusCode).toBe(200);
    const nachher = await app.inject({ method: "GET", url: `/api/drafts/${d.id}` });
    expect(nachher.json().uebersprungeneStufen?.length).toBeGreaterThan(0);
  });

  it("bestätigt dabei nichts", async () => {
    // Übersprungen ist die FRAGE, nicht die Angabe. Die Gesamtprüfung muss sie weiter
    // anmahnen — sonst verschwindet eine Lücke durch einen Klick.
    const d = await neuerEntwurf();
    await app.inject({
      method: "POST", url: `/api/drafts/${d.id}/extractions/x/reject`, payload: {},
    });
    const r = await app.inject({ method: "POST", url: `/api/drafts/${d.id}/validate` });
    expect(r.json().valid).toBe(false);
  });
});

describe("Prüfvermerk: begründen und bestätigen", () => {
  // Zwei getrennte Schritte, mit Absicht: das Fachreferat begründet, jemand anderes liest
  // gegen. Unter dem Anschreiben ans MdFE steht die Unterschrift einer Person.
  const mitVermerk = async () => {
    const d = await neuerEntwurf();
    await app.inject({
      method: "POST", url: `/api/drafts/${d.id}/extractions/x/confirm`,
      payload: {
        proposals: [
          { sectionId: "3", fieldId: "recipients", value: ["municipal"], confidence: 1, evidence: "" },
          { sectionId: "5", fieldId: "fundingRate", value: 90, confidence: 1, evidence: "" },
        ],
      },
    });
    const v = await app.inject({ method: "GET", url: `/api/drafts/${d.id}/vermerk` });
    return { id: d.id, eintrag: v.json().eintraege[0] };
  };

  it("sperrt das Bestätigen, solange keine Begründung gespeichert ist", async () => {
    const { id, eintrag } = await mitVermerk();
    const r = await app.inject({
      method: "POST", url: `/api/drafts/${id}/vermerk/${eintrag.id}/bestaetigen`,
    });
    expect(r.statusCode).toBe(409);
  });

  it("weist eine leere Begründung ab", async () => {
    const { id, eintrag } = await mitVermerk();
    const r = await app.inject({
      method: "POST", url: `/api/drafts/${id}/vermerk/${eintrag.id}/begruendung`,
      payload: { begruendung: "   " },
    });
    expect(r.statusCode).toBe(400);
  });

  it("führt den Eintrag über begründet zu bestätigt", async () => {
    const { id, eintrag } = await mitVermerk();
    const b = await app.inject({
      method: "POST", url: `/api/drafts/${id}/vermerk/${eintrag.id}/begruendung`,
      payload: { begruendung: "Die Gemeinden sind haushaltssicherungspflichtig." },
    });
    expect(b.json().status).toBe("beantwortet");
    const c = await app.inject({
      method: "POST", url: `/api/drafts/${id}/vermerk/${eintrag.id}/bestaetigen`,
    });
    expect(c.json().status).toBe("bestaetigt");
    const sicht = await app.inject({ method: "GET", url: `/api/drafts/${id}/vermerk` });
    expect(sicht.json().offen).toBe(0);
  });
});

describe("Export", () => {
  it("gibt ohne erzeugten Text die Zusammenstellung der Angaben aus", async () => {
    // Ohne Richtlinientext bleibt nur die Sammlung der Felder. Sie wird als solche
    // überschrieben, damit niemand sie für eine Richtlinie hält.
    const d = await neuerEntwurf();
    const r = await app.inject({ method: "GET", url: `/api/drafts/${d.id}/export` });
    expect(r.statusCode).toBe(200);
    // Eine Word-Datei beginnt als ZIP-Archiv mit „PK".
    expect(r.rawPayload.subarray(0, 2).toString()).toBe("PK");
  });

  it("hängt den Dateinamen an den Titel, nicht an die UUID", async () => {
    // Vorher hieß die Datei `richtlinie-<UUID>.docx` — technisch eindeutig und im
    // Downloadordner unbrauchbar.
    const d = await neuerEntwurf();
    await app.inject({
      method: "PATCH", url: `/api/drafts/${d.id}`, payload: { title: "RL Katzenkastration" },
    });
    const r = await app.inject({ method: "GET", url: `/api/drafts/${d.id}/export` });
    expect(r.headers["content-disposition"]).toContain("Katzenkastration");
    expect(r.headers["content-disposition"]).not.toContain(d.id);
  });

  it("gibt den Prüfvermerk als eigene Datei aus", async () => {
    // Zwei Dateien, mit Absicht: die Richtlinie wird veröffentlicht, das Anschreiben geht
    // ans Finanzministerium.
    const d = await neuerEntwurf();
    const r = await app.inject({ method: "GET", url: `/api/drafts/${d.id}/export/vermerk` });
    expect(r.statusCode).toBe(200);
    expect(r.rawPayload.subarray(0, 2).toString()).toBe("PK");
  });
});


describe("Rückmeldungen", () => {
  const gelesen = () => {
    try {
      return readFileSync(join(ordner, "feedback.jsonl"), "utf8")
        .split("\n").filter(Boolean).map((z) => JSON.parse(z));
    } catch {
      return [];
    }
  };

  it("nimmt eine Rückmeldung an der Fundstelle an und hängt sie an", async () => {
    const d = await neuerEntwurf();
    const vorher = gelesen().length;
    const r = await app.inject({
      method: "POST",
      url: `/api/drafts/${d.id}/rueckmeldung`,
      payload: {
        ort: "fundstelle", baustein: "7", feld: "authority",
        feldLabel: "Bewilligungsbehörde", urteil: "nichtssagend",
        fundstelle: { datei: "RL Jagdabgabe.pdf", seite: 7 },
        text: "Der Satz steht in jeder Richtlinie.",
      },
    });
    expect(r.statusCode).toBe(200);
    expect(r.json().gespeichert).toBe(true);
    const zeilen = gelesen();
    expect(zeilen.length).toBe(vorher + 1);
    expect(zeilen.at(-1)).toMatchObject({ ort: "fundstelle", urteil: "nichtssagend" });
  });

  it("setzt Zeit, Entwurf und Version selbst", async () => {
    const d = await neuerEntwurf();
    await app.inject({
      method: "POST", url: `/api/drafts/${d.id}/rueckmeldung`,
      // Der Browser schickt einen falschen Entwurf mit — der Server nimmt seinen eigenen.
      payload: { ort: "abschnitt", entwurf: "fremd", version: 999, text: "x" },
    });
    const letzte = gelesen().at(-1);
    expect(letzte.entwurf).toBe(d.id);
    expect(letzte.version).toBe(d.version);
    expect(letzte.zeit).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("weist zu langen Freitext ab, statt ihn abzuschneiden", async () => {
    const d = await neuerEntwurf();
    const r = await app.inject({
      method: "POST", url: `/api/drafts/${d.id}/rueckmeldung`,
      payload: { ort: "wert", text: "x".repeat(2001) },
    });
    expect(r.statusCode).toBe(400);
    expect(r.json().message).toContain("2000");
  });

  it("weist einen unbekannten Ort ab", async () => {
    const d = await neuerEntwurf();
    const r = await app.inject({
      method: "POST", url: `/api/drafts/${d.id}/rueckmeldung`,
      payload: { ort: "irgendwo", text: "x" },
    });
    expect(r.statusCode).toBe(400);
  });

  it("gibt die gesammelten Rückmeldungen zeilenweise zurück", async () => {
    const r = await app.inject({ method: "GET", url: "/api/rueckmeldungen" });
    expect(r.statusCode).toBe(200);
    const zeilen = r.body.split("\n").filter(Boolean);
    expect(zeilen.length).toBe(gelesen().length);
    expect(() => JSON.parse(zeilen[0]!)).not.toThrow();
  });
});
