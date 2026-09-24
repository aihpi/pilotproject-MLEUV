import { describe, expect, it } from "vitest";
import {
  emptySections,
  fieldVisible,
  pruefeBaustein6,
  pruefeBaustein7,
  sections,
  validateDraft,
  type FieldValue,
  type RichtlinieDraft,
} from "./index";

function entwurf(
  felder7: Record<string, unknown>,
  felder4: Record<string, unknown> = {},
): RichtlinieDraft {
  const wert = (v: unknown): FieldValue => ({
    value: v as FieldValue["value"],
    status: "confirmed",
    source: "user-form",
    confirmedByUser: true,
  });
  const alle = emptySections();
  alle["7"] = {
    fields: Object.fromEntries(Object.entries(felder7).map(([k, v]) => [k, wert(v)])),
  };
  alle["4"] = {
    fields: Object.fromEntries(Object.entries(felder4).map(([k, v]) => [k, wert(v)])),
  };
  return {
    id: "1", ownerId: "u", title: "T",
    profile: { jurisdiction: "land", gak: false, stateAid: false, fundingType: "project" },
    sections: alle,
    validation: { valid: false, issues: [] },
    status: "draft", version: 1, createdAt: "", updatedAt: "",
  };
}

const regeln = (d: RichtlinieDraft) => pruefeBaustein7(d).map((e) => e.befund.regel);
const feld = (id: string) => sections.find((s) => s.id === "7")!.fields.find((f) => f.id === id)!;
const profil = { jurisdiction: "land", gak: false, stateAid: false, fundingType: "project" } as const;

describe("Baustein 7, digitale Antragstellung", () => {
  it("digital mit Vorschussprinzip: Fehler", () => {
    const [e] = pruefeBaustein7(
      entwurf({ applicationProcedure: "digital", payment: "advance" }),
    );
    expect(e!.befund.regel).toBe("digital_nur_erstattung");
    // Fehler, nicht Warnung: das Verfahren gibt es nicht, also ist es auch nicht begründbar.
    expect(e!.befund.severity).toBe("error");
    expect(e!.befund.fieldId).toBe("payment");
  });

  it("digital mit Frist verhält sich wie digital ohne Frist", () => {
    expect(
      regeln(entwurf({ applicationProcedure: "digital-deadline", payment: "advance" })),
    ).toContain("digital_nur_erstattung");
  });

  it("digital mit Erstattung: kein Befund", () => {
    expect(
      regeln(entwurf({ applicationProcedure: "digital", payment: "refund" })),
    ).toHaveLength(0);
  });

  it("schriftlich mit Vorschussprinzip: kein Befund", () => {
    expect(
      regeln(entwurf({ applicationProcedure: "analog", payment: "advance" })),
    ).toHaveLength(0);
  });

  it("ohne Angabe zum Antragsverfahren: kein Befund", () => {
    // Das fehlende Pflichtfeld meldet die Feldprüfung; die Regel schweigt, statt zu raten.
    expect(regeln(entwurf({ payment: "advance" }))).toHaveLength(0);
  });

  it("hängt in validateDraft", () => {
    const d = entwurf({ applicationProcedure: "digital", payment: "advance" });
    expect(validateDraft(d).issues.map((i) => i.regel)).toContain("digital_nur_erstattung");
  });
});

describe("Baustein 7, Auswahlkriterien", () => {
  it("kriteriengebundene Auswahl ohne Kriterien in Baustein 4: Warnung", () => {
    const [e] = pruefeBaustein7(entwurf({ selection: "criteria" }));
    expect(e!.befund.regel).toBe("auswahlkriterien_fehlen");
    // Warnung: das Prozessmodell führt die Kriterien an dieser Stelle als optional.
    expect(e!.befund.severity).toBe("warning");
  });

  it("mit Kriterien in Baustein 4: kein Befund", () => {
    expect(
      regeln(entwurf({ selection: "criteria" }, { selectionCriteria: "Klimawirkung, Reife" })),
    ).toHaveLength(0);
  });

  it("nur Leerzeichen zählen nicht als Kriterien", () => {
    expect(
      regeln(entwurf({ selection: "criteria" }, { selectionCriteria: "   " })),
    ).toContain("auswahlkriterien_fehlen");
  });

  it("Windhundprinzip verlangt keine Kriterien", () => {
    expect(regeln(entwurf({ selection: "first" }))).toHaveLength(0);
  });
});

describe("Baustein 7, Antragsfrist", () => {
  it("erscheint nur bei den Fallgruppen mit Frist", () => {
    const f = feld("applicationDeadline");
    expect(fieldVisible(f, profil, { applicationProcedure: "analog" })).toBe(false);
    expect(fieldVisible(f, profil, { applicationProcedure: "digital" })).toBe(false);
    expect(fieldVisible(f, profil, { applicationProcedure: "analog-deadline" })).toBe(true);
    expect(fieldVisible(f, profil, { applicationProcedure: "digital-deadline" })).toBe(true);
  });

  it("fehlt bei gewählter Frist: Pflichtfeld schlägt an", () => {
    const d = entwurf({
      authority: "LELF", selection: "first", earlyStart: "variant-1",
      applicationProcedure: "analog-deadline", payment: "refund", applicationType: "two",
    });
    expect(validateDraft(d).issues.map((i) => i.fieldId)).toContain("applicationDeadline");
  });

  it("ohne gewählte Frist kein Pflichtfeld", () => {
    const d = entwurf({
      authority: "LELF", selection: "first", earlyStart: "variant-1",
      applicationProcedure: "analog", payment: "refund", applicationType: "two",
    });
    expect(
      validateDraft(d).issues.filter((i) => i.sectionId === "7"),
    ).toHaveLength(0);
  });
});

describe("Baustein 6, Prüfberechtigte Stellen", () => {
  /**
   * Die Regel schaute nur in eine Richtung.
   *
   * Geprüft wurde, ob eines der beiden Landesprüforgane FEHLT. Im Durchlauf vom 23.09.2026
   * setzte ein Vorschlag zusätzlich den Bundesrechnungshof — bei reiner Landesförderung hat
   * der kein Prüfrecht, und kein Befund kam. Eine halbe Regel deckt den halben Fehlerraum ab.
   */
  const mit = (stellen: string[], gak = false): RichtlinieDraft => {
    const d = entwurf({});
    d.profile = { ...d.profile, gak };
    d.sections["6"] = {
      fields: {
        auditRights: {
          value: stellen,
          status: "confirmed",
          source: "user-form",
          confirmedByUser: true,
        },
      },
    };
    return d;
  };
  const regeln = (d: RichtlinieDraft) =>
    pruefeBaustein6(d).map((e) => e.befund.regel);

  it("beide Landesorgane sind unauffällig", () => {
    expect(regeln(mit(["lrh", "ministry"]))).toEqual([]);
  });

  it("ein fehlendes Landesorgan wird gemeldet", () => {
    expect(regeln(mit(["lrh"]))).toContain("pruefrechte_unvollstaendig");
  });

  it("der Bundesrechnungshof ohne Bundesmittel wird gemeldet", () => {
    expect(regeln(mit(["lrh", "ministry", "brh"]))).toContain(
      "pruefrechte_bund_ohne_bundesmittel",
    );
  });

  it("bei GAK ist er zu Recht dabei", () => {
    expect(regeln(mit(["lrh", "ministry", "brh"], true))).toEqual([]);
  });

  it("beide Richtungen können zugleich zutreffen", () => {
    expect(regeln(mit(["brh"]))).toEqual([
      "pruefrechte_unvollstaendig",
      "pruefrechte_bund_ohne_bundesmittel",
    ]);
  });

  it("ohne Angabe wird nichts gemeldet", () => {
    expect(regeln(mit([]))).toEqual([]);
  });
});

describe("Baustein 6, Nebenbestimmungen und Empfängerkreis", () => {
  /**
   * ANBest-P hängt an der VV, ANBest-G an der VVG — zwei verschiedene
   * Verwaltungsvorschriften. Umfasst der Empfängerkreis beide Gruppen, gelten beide.
   *
   * Der Feldvorschlag wählte bei gemischtem Kreis nur ANBest-P (Eval-Fall F-15, 0 von 3
   * Läufen). Ein Hinweis am Feld hat das behoben — aber nur dort, wo das Modell füllt. Wer
   * es von Hand einträgt, braucht diese Prüfung.
   */
  const mit = (empfaenger: string[], nebenbestimmungen: string): RichtlinieDraft => {
    const d = entwurf({});
    const wert = (v: unknown) => ({
      value: v as FieldValue["value"],
      status: "confirmed" as const,
      source: "user-form" as const,
      confirmedByUser: true,
    });
    d.sections["3"] = { fields: { recipients: wert(empfaenger) } };
    d.sections["6"] = { fields: { ancillary: wert(nebenbestimmungen) } };
    return d;
  };
  const regeln = (d: RichtlinieDraft) => pruefeBaustein6(d).map((e) => e.befund.regel);

  it("gemischter Kreis verlangt beide", () => {
    expect(regeln(mit(["municipal", "private"], "anbest-p"))).toContain(
      "nebenbestimmungen_empfaengerkreis",
    );
    expect(regeln(mit(["municipal", "private"], "anbest-p-g"))).toEqual([]);
  });

  it("nur Kommunen verlangen ANBest-G", () => {
    expect(regeln(mit(["municipal"], "anbest-p"))).toContain(
      "nebenbestimmungen_empfaengerkreis",
    );
    expect(regeln(mit(["municipal"], "anbest-g"))).toEqual([]);
  });

  it("ohne Kommunen genügt ANBest-P", () => {
    expect(regeln(mit(["private", "natural"], "anbest-p"))).toEqual([]);
    expect(regeln(mit(["private"], "anbest-p-g"))).toContain(
      "nebenbestimmungen_empfaengerkreis",
    );
  });

  it("ohne Empfängerkreis wird nichts gemeldet", () => {
    expect(regeln(mit([], "anbest-p"))).toEqual([]);
  });
});
