/**
 * Die Prüfregeln des Prozessmodells, die bis zum 09.10.2026 nur dort standen.
 *
 * Welche Modellregel jede Prüfung trägt, steht in `02_backend/regeln.yaml`; ein Test dort
 * hält die Zuordnung gegen diesen Code. Hier wird geprüft, dass die Regeln greifen — und,
 * ebenso wichtig, dass sie bei zulässigen Entwürfen schweigen.
 */
import { describe, expect, it } from "vitest";
import {
  emptySections,
  pruefeBeihilfegrenzen,
  pruefeBeihilfepruefung,
  pruefeBemessungsgrundlage,
  pruefeVeroeffentlichung,
  pruefeVorhabenbeginn,
  pruefeWeiterleitung,
  pruefeZuwendungsart,
  type FieldValue,
  type RichtlinieDraft,
} from "./index";

const wert = (v: unknown) => ({
  value: v as FieldValue["value"],
  status: "confirmed" as const,
  source: "user-form" as const,
  confirmedByUser: true,
});

function entwurf(felder: Record<string, Record<string, unknown>>): RichtlinieDraft {
  const sections = emptySections();
  for (const [nr, f] of Object.entries(felder))
    sections[nr as keyof typeof sections] = {
      fields: Object.fromEntries(Object.entries(f).map(([k, v]) => [k, wert(v)])),
    };
  return {
    id: "t", ownerId: "t", title: "Test",
    profile: { jurisdiction: "land", gak: false, stateAid: true, fundingType: "project" },
    sections, validation: { valid: true, issues: [] }, status: "draft", version: 1,
    createdAt: "", updatedAt: "",
  } as RichtlinieDraft;
}

const regeln = (e: ReturnType<typeof pruefeBeihilfegrenzen>) => e.map((x) => x.befund.regel);

describe("Beihilferechtliche Obergrenzen", () => {
  it("De-minimis über 300 000 Euro ist ein Fehler", () => {
    const d = entwurf({ "4": { aidRegime: ["de-minimis"] }, "5": { maximum: 1_500_000 } });
    const befunde = pruefeBeihilfegrenzen(d);
    expect(regeln(befunde)).toContain("de_minimis_hoechstbetrag");
    expect(befunde[0]?.befund.severity).toBe("error");
  });

  it("zwischen 50 000 und 300 000 wird nach der Agrarverordnung gefragt", () => {
    const d = entwurf({ "4": { aidRegime: ["de-minimis"] }, "5": { maximum: 200_000 } });
    expect(regeln(pruefeBeihilfegrenzen(d))).toContain("de_minimis_agrar_pruefen");
  });

  it("unterhalb beider Grenzen ist nichts zu melden", () => {
    const d = entwurf({ "4": { aidRegime: ["de-minimis"] }, "5": { maximum: 15_000 } });
    expect(pruefeBeihilfegrenzen(d)).toEqual([]);
  });

  it("Freistellung ohne jede Obergrenze wird gemeldet", () => {
    const d = entwurf({ "4": { aidRegime: ["agvo"] }, "5": {} });
    expect(regeln(pruefeBeihilfegrenzen(d))).toContain("freistellung_ohne_obergrenze");
  });

  it("Freistellung mit Fördersatz genügt", () => {
    const d = entwurf({ "4": { aidRegime: ["agvo"] }, "5": { fundingRate: 60 } });
    expect(pruefeBeihilfegrenzen(d)).toEqual([]);
  });

  it("ohne Beihilferegime greift die Prüfung nicht", () => {
    expect(pruefeBeihilfegrenzen(entwurf({ "5": { maximum: 9_000_000 } }))).toEqual([]);
  });
});

describe("Beihilfeprüfung ist immer erforderlich", () => {
  it("beihilferelevant, aber nichts angegeben", () => {
    expect(regeln(pruefeBeihilfepruefung(entwurf({})))).toContain("beihilfepruefung_fehlt");
  });

  it("eine Einordnung genügt", () => {
    const d = entwurf({ "4": { aidRegime: ["de-minimis"] } });
    expect(pruefeBeihilfepruefung(d)).toEqual([]);
  });

  it("wer keinen Beihilfebezug hat, wird nicht gefragt", () => {
    const d = entwurf({});
    d.profile = { ...d.profile, stateAid: false };
    expect(pruefeBeihilfepruefung(d)).toEqual([]);
  });
});

describe("Bemessungsgrundlage und Finanzierungsart", () => {
  it("Festbetrag verträgt keine Spitzabrechnung", () => {
    const d = entwurf({ "5": { financingType: "fixed", eligibleBasis: "actual" } });
    expect(regeln(pruefeBemessungsgrundlage(d)))
      .toContain("bemessung_passt_nicht_zur_finanzierungsart");
  });

  it("Anteilfinanzierung verträgt keine festen Beträge", () => {
    const d = entwurf({ "5": { financingType: "share", eligibleBasis: "fixed" } });
    expect(regeln(pruefeBemessungsgrundlage(d)))
      .toContain("bemessung_passt_nicht_zur_finanzierungsart");
  });

  it("passende Paare bleiben still", () => {
    expect(pruefeBemessungsgrundlage(
      entwurf({ "5": { financingType: "share", eligibleBasis: "actual" } }))).toEqual([]);
    expect(pruefeBemessungsgrundlage(
      entwurf({ "5": { financingType: "fixed", eligibleBasis: "fixed-rest" } }))).toEqual([]);
  });
});

describe("Nur Projektförderung im Pilotumfang", () => {
  it("die institutionelle Förderung wird gemeldet", () => {
    const d = entwurf({});
    d.profile = { ...d.profile, fundingType: "institutional" as never };
    expect(regeln(pruefeZuwendungsart(d))).toContain("nur_projektfoerderung");
  });

  it("Projektförderung ist unauffällig", () => {
    expect(pruefeZuwendungsart(entwurf({}))).toEqual([]);
  });
});

describe("Weiterleitung an Dritte", () => {
  it("zugelassen ohne Regeln ist ein Fehler", () => {
    const d = entwurf({ "3": { forwarding: "yes", forwardingRules: "" } });
    const befunde = pruefeWeiterleitung(d);
    expect(regeln(befunde)).toContain("weiterleitung_ohne_regeln");
    expect(befunde[0]?.befund.severity).toBe("error");
  });

  it("mit Regeln ist es in Ordnung", () => {
    const d = entwurf({ "3": { forwarding: "yes", forwardingRules: "Letztempfangende sind …" } });
    expect(pruefeWeiterleitung(d)).toEqual([]);
  });

  it("nicht zugelassen braucht keine Regeln", () => {
    expect(pruefeWeiterleitung(entwurf({ "3": { forwarding: "no" } }))).toEqual([]);
  });
});

describe("Vorzeitiger Vorhabenbeginn", () => {
  it("Variante 2 ist zu begründen", () => {
    const d = entwurf({ "7": { earlyStart: "variant-2" } });
    const befunde = pruefeVorhabenbeginn(d);
    expect(regeln(befunde)).toContain("vorzeitiger_beginn_ohne_genehmigung");
    expect(befunde[0]?.vermerk?.adressat).toBe("pruefvermerk");
  });

  it("Variante 1 ist der Grundsatz", () => {
    expect(pruefeVorhabenbeginn(entwurf({ "7": { earlyStart: "variant-1" } }))).toEqual([]);
  });
});

describe("Europarechtliche Veröffentlichungspflichten", () => {
  it("Freistellung über 100 000 Euro ohne Hinweis", () => {
    const d = entwurf({ "4": { aidRegime: ["agvo"] }, "5": { maximum: 500_000 }, "6": {} });
    expect(regeln(pruefeVeroeffentlichung(d))).toContain("veroeffentlichungspflicht_fehlt");
  });

  it("mit Hinweis in den Zuwendungsbestimmungen schweigt die Regel", () => {
    const d = entwurf({
      "4": { aidRegime: ["agvo"] }, "5": { maximum: 500_000 },
      "6": { otherConditions: "Beihilfen werden in der Transparenzdatenbank veröffentlicht." },
    });
    expect(pruefeVeroeffentlichung(d)).toEqual([]);
  });

  it("unterhalb der Schwelle keine Pflicht", () => {
    const d = entwurf({ "4": { aidRegime: ["agvo"] }, "5": { maximum: 50_000 }, "6": {} });
    expect(pruefeVeroeffentlichung(d)).toEqual([]);
  });
});
