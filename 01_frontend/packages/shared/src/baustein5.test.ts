import { describe, expect, it } from "vitest";
import {
  fieldVisible,
  sections,
  BAGATELLGRENZE_EUR,
  BAGATELLGRENZE_GEMEINDLICH_EUR,
  emptySections,
  GELTUNGSDAUER_JAHRE,
  pruefeBaustein5,
  pruefeBaustein6,
  pruefeFachlich,
  pruefeEmpfaengerkreis,
  pruefeZuwendungsform,
  pruefeBaustein8,
  pruefungenAnwenden,
  validateDraft,
  type FieldValue,
  type RichtlinieDraft,
} from "./index";

function entwurf(
  felder5: Record<string, unknown>,
  felder3: Record<string, unknown> = {},
  gak = false,
): RichtlinieDraft {
  const wert = (v: unknown): FieldValue => ({
    value: v as FieldValue["value"],
    status: "confirmed",
    source: "user-form",
    confirmedByUser: true,
  });
  const sections = emptySections();
  sections["5"] = {
    fields: Object.fromEntries(Object.entries(felder5).map(([k, v]) => [k, wert(v)])),
  };
  sections["3"] = {
    fields: Object.fromEntries(Object.entries(felder3).map(([k, v]) => [k, wert(v)])),
  };
  return {
    id: "1", ownerId: "u", title: "T",
    profile: { jurisdiction: gak ? "mixed" : "land", gak, stateAid: false, fundingType: "project" },
    sections,
    validation: { valid: false, issues: [] },
    status: "draft", version: 1, createdAt: "", updatedAt: "",
  };
}

const regeln = (d: RichtlinieDraft) => pruefeBaustein5(d).map((e) => e.befund.regel);

describe("Baustein 5, Bagatellgrenze", () => {
  it("unter 2.500 Euro: begründungspflichtig, aber zulässig", () => {
    const [e] = pruefeBaustein5(entwurf({ minimum: 1000 }));
    expect(e!.befund.regel).toBe("bagatellgrenze");
    expect(e!.befund.severity).toBe("warning"); // kein Fehler — die Abweichung ist erlaubt
    expect(e!.befund.rechtsstelle).toContain("1.5");
    expect(e!.vermerk?.adressat).toBe("mdfe");
    expect(e!.vermerk?.status).toBe("offen");
  });

  it("genau an der Grenze: kein Befund", () => {
    expect(regeln(entwurf({ minimum: BAGATELLGRENZE_EUR }))).not.toContain("bagatellgrenze");
  });

  it("darüber: kein Befund", () => {
    expect(regeln(entwurf({ minimum: 25000 }))).not.toContain("bagatellgrenze");
  });

  it("leeres Feld löst nichts aus", () => {
    // Nicht „gar keine Regel": ein Entwurf ohne jede Angabe zur Höhe löst zu Recht
    // `hoehe_unbestimmt` aus. Geprüft wird hier nur die Bagatellgrenze.
    expect(regeln(entwurf({}))).not.toContain("bagatellgrenze");
  });
});

describe("Baustein 5, Finanzierung", () => {
  it("Vollfinanzierung verlangt eine Begründung ans MdFE", () => {
    const [e] = pruefeBaustein5(entwurf({ financingType: "full" }));
    expect(e!.befund.regel).toBe("vollfinanzierung");
    expect(e!.befund.message).toContain("wirtschaftliches Interesse");
    expect(e!.vermerk?.adressat).toBe("mdfe");
  });

  it("Anteilfinanzierung nicht", () => {
    expect(regeln(entwurf({ financingType: "share" }))).not.toContain("vollfinanzierung");
  });

  it("über 80 Prozent an Kommunen braucht die Zustimmung des MdFE", () => {
    const d = entwurf({ fundingRate: 90 }, { recipients: ["municipal"] });
    expect(regeln(d)).toContain("kommunaler_hoechstsatz");
  });

  it("über 80 Prozent an Nicht-Kommunen nicht", () => {
    const d = entwurf({ fundingRate: 90 }, { recipients: ["private"] });
    expect(regeln(d)).not.toContain("kommunaler_hoechstsatz");
  });

  it("genau 80 Prozent an Kommunen nicht", () => {
    const d = entwurf({ fundingRate: 80 }, { recipients: ["municipal"] });
    expect(regeln(d)).not.toContain("kommunaler_hoechstsatz");
  });
});

describe("Baustein 5, Bemessungsgrundlage", () => {
  it("vereinfachte Kostenoptionen sind im Landesbereich ein Fehler", () => {
    // Vereinfachte Kostenoptionen setzen Art. 83 Abs. 1 GAP-SP-VO voraus und sind damit an
    // EU-Mittel gebunden. Zwei der fünf Optionen des Felds sind genau das.
    for (const b of ["fixed-rest", "fixed-overhead"]) {
      const treffer = pruefeBaustein5(entwurf({ eligibleBasis: b }))
        .find((e) => e.befund.regel === "vko_nicht_im_land");
      expect(treffer, b).toBeDefined();
      expect(treffer!.befund.severity).toBe("error");
    }
  });

  it("bei GAK-Förderung sind sie zulässig", () => {
    const d = entwurf({ eligibleBasis: "fixed-rest" }, {}, true);
    expect(regeln(d)).not.toContain("vko_nicht_im_land");
  });

  it("Spitzabrechnung löst nichts aus", () => {
    const r = regeln(entwurf({ eligibleBasis: "actual" }));
    expect(r).not.toContain("vko_nicht_im_land");
    expect(r).not.toContain("feste_betraege_folgen");
  });

  it("feste Beträge machen Baustein 7 wieder auf", () => {
    // „Auswirkungen auf spätere Verfahren" aus dem Prozessmodell: die Entscheidung in
    // Baustein 5 erzeugt Pflichten in Baustein 7.
    const treffer = pruefeBaustein5(entwurf({ eligibleBasis: "fixed" }))
      .find((e) => e.befund.regel === "feste_betraege_folgen");
    expect(treffer?.revision?.sectionId).toBe("7");
    expect(treffer?.revision?.eintrag.ausgeloestVon).toBe("5");
    expect(treffer?.revision?.eintrag.betroffeneFelder).toContain("applicationType");
    expect(treffer?.revision?.eintrag.erledigt).toBe(false);
  });
});

describe("Einbindung in validateDraft", () => {
  it("Befunde erscheinen in der Validierung", () => {
    const issues = validateDraft(entwurf({ minimum: 500 })).issues;
    expect(issues.some((i) => i.regel === "bagatellgrenze")).toBe(true);
  });

  it("eine Warnung macht den Entwurf nicht ungültig, ein Fehler schon", () => {
    const nurWarnung = validateDraft(entwurf({ financingType: "full" })).issues
      .filter((i) => i.regel === "vollfinanzierung");
    expect(nurWarnung[0]!.severity).toBe("warning");

    const fehler = validateDraft(entwurf({ eligibleBasis: "fixed-rest" }));
    expect(fehler.valid).toBe(false);
  });
});

describe("Prüfungen in den Entwurf schreiben", () => {
  it("legt Vermerkseinträge an", () => {
    const d = pruefungenAnwenden(entwurf({ minimum: 500, financingType: "full" }));
    expect(d.vermerk?.map((v) => v.regel).sort()).toEqual([
      "bagatellgrenze",
      "vollfinanzierung",
    ]);
    expect(d.vermerk?.every((v) => v.adressat === "mdfe" && v.status === "offen")).toBe(true);
  });

  it("ein zweiter Lauf ändert nichts", () => {
    const einmal = pruefungenAnwenden(entwurf({ minimum: 500 }));
    const zweimal = pruefungenAnwenden(einmal);
    expect(zweimal.vermerk).toEqual(einmal.vermerk);
  });

  it("eine eingeholte Begründung überlebt die Neubewertung", () => {
    const erst = pruefungenAnwenden(entwurf({ minimum: 500 }));
    const beantwortet = {
      ...erst,
      vermerk: erst.vermerk!.map((v) => ({
        ...v, begruendung: "Kleinstförderung im Tierschutz.", status: "beantwortet" as const,
      })),
    };
    const nochmal = pruefungenAnwenden(beantwortet);
    expect(nochmal.vermerk![0]!.begruendung).toBe("Kleinstförderung im Tierschutz.");
    expect(nochmal.vermerk![0]!.status).toBe("beantwortet");
  });

  it("entfällt die Regel, wird der Eintrag gegenstandslos statt gelöscht", () => {
    // Ein Prüfvermerk ist ein Nachweis. Was einmal festgestellt wurde, verschwindet nicht.
    const mit = pruefungenAnwenden(entwurf({ minimum: 500 }));
    const ohne = pruefungenAnwenden({ ...mit, sections: entwurf({ minimum: 25000 }).sections });
    expect(ohne.vermerk).toHaveLength(1);
    expect(ohne.vermerk![0]!.status).toBe("gegenstandslos");
  });

  it("feste Beträge tragen eine Überarbeitung in Baustein 7 ein", () => {
    const d = pruefungenAnwenden(entwurf({ eligibleBasis: "fixed" }));
    const rev = d.sections["7"]?.revisionen ?? [];
    expect(rev).toHaveLength(1);
    expect(rev[0]!.ausgeloestVon).toBe("5");
    expect(rev[0]!.erledigt).toBe(false);
  });

  it("entfällt die Regel, verschwindet die offene Überarbeitung", () => {
    // Anders als der Vermerk: eine Arbeitsanweisung ohne Gegenstand ist nur Rauschen.
    const mit = pruefungenAnwenden(entwurf({ eligibleBasis: "fixed" }));
    const ohne = pruefungenAnwenden({ ...mit, sections: {
      ...mit.sections, "5": entwurf({ eligibleBasis: "actual" }).sections["5"]!,
    } });
    expect(ohne.sections["7"]?.revisionen ?? []).toHaveLength(0);
  });

  it("eine erledigte Überarbeitung bleibt", () => {
    const mit = pruefungenAnwenden(entwurf({ eligibleBasis: "fixed" }));
    const abgehakt = { ...mit, sections: { ...mit.sections, "7": {
      ...mit.sections["7"]!,
      revisionen: mit.sections["7"]!.revisionen!.map((r) => ({ ...r, erledigt: true })),
    } } };
    const ohne = pruefungenAnwenden({ ...abgehakt, sections: {
      ...abgehakt.sections, "5": entwurf({ eligibleBasis: "actual" }).sections["5"]!,
    } });
    expect(ohne.sections["7"]!.revisionen).toHaveLength(1);
    expect(ohne.sections["7"]!.revisionen![0]!.erledigt).toBe(true);
  });
});

describe("Baustein 5, Angaben zur Höhe", () => {
  it("fehlen Fördersatz UND Höchstbetrag, kommt ein Hinweis", () => {
    // Beide sind wählbar, keiner ist Pflicht — aber gar keine Angabe zur Höhe lässt
    // Antragstellende wie Bewilligungsbehörde im Unklaren.
    expect(regeln(entwurf({ financingType: "share" }))).toContain("hoehe_unbestimmt");
  });

  it("ein Fördersatz allein genügt", () => {
    expect(regeln(entwurf({ fundingRate: 60 }))).not.toContain("hoehe_unbestimmt");
  });

  it("ein Höchstbetrag allein genügt", () => {
    expect(regeln(entwurf({ maximum: 100000 }))).not.toContain("hoehe_unbestimmt");
  });

  it("eine Null zählt nicht als Angabe", () => {
    expect(regeln(entwurf({ fundingRate: 0, maximum: 0 }))).toContain("hoehe_unbestimmt");
  });
});

describe("Baustein 5, Widersprüche", () => {
  it("Bagatellgrenze über dem Höchstbetrag ist ein Fehler", () => {
    // 25.000 Untergrenze, 10.000 Obergrenze: dazwischen bleibt nichts, kein Vorhaben
    // wäre je förderfähig.
    const treffer = pruefeBaustein5(entwurf({ minimum: 25000, maximum: 10000 }))
      .find((e) => e.befund.regel === "grenzen_widerspruch");
    expect(treffer).toBeDefined();
    expect(treffer!.befund.severity).toBe("error");
    expect(treffer!.befund.message).toContain("25000");
  });

  it("Bagatellgrenze unter dem Höchstbetrag ist in Ordnung", () => {
    const d = entwurf({ minimum: 5000, maximum: 100000 });
    expect(regeln(d)).not.toContain("grenzen_widerspruch");
  });

  it("ohne Höchstbetrag gibt es keinen Widerspruch zu prüfen", () => {
    expect(regeln(entwurf({ minimum: 25000 }))).not.toContain("grenzen_widerspruch");
  });

  it("ein Fördersatz über 100 Prozent ist ein Fehler", () => {
    const treffer = pruefeBaustein5(entwurf({ fundingRate: 120 }))
      .find((e) => e.befund.regel === "foerdersatz_ueber_hundert");
    expect(treffer!.befund.severity).toBe("error");
  });

  it("genau 100 Prozent nicht — das ist Vollfinanzierung, nicht unmöglich", () => {
    expect(regeln(entwurf({ fundingRate: 100 }))).not.toContain("foerdersatz_ueber_hundert");
  });
});

function mitDauer(von: string, bis: string): RichtlinieDraft {
  const d = entwurf({ fundingRate: 60 });
  d.sections["8"] = {
    fields: {
      validFrom: { value: von, status: "confirmed", source: "user-form", confirmedByUser: true },
      validUntil: { value: bis, status: "confirmed", source: "user-form", confirmedByUser: true },
    },
  };
  return d;
}

describe("Baustein 8, Geltungsdauer", () => {
  it("drei Jahre sind in Ordnung", () => {
    expect(pruefeBaustein8(mitDauer("2026-01-01", "2029-01-01"))).toHaveLength(0);
  });

  it("darüber kommt eine Warnung mit Rechtsstelle", () => {
    const [e] = pruefeBaustein8(mitDauer("2026-01-01", "2031-01-01"));
    expect(e!.befund.regel).toBe("geltungsdauer");
    expect(e!.befund.severity).toBe("warning"); // „soll" — zulässig mit Begründung
    expect(e!.befund.rechtsstelle).toContain("Anlage 19");
    expect(e!.vermerk?.adressat).toBe("pruefvermerk");
  });

  it("ein Schaltjahr kippt die Grenze nicht", () => {
    // Über Kalenderjahre gerechnet, nicht über 1095 Tage: sonst wäre eine Laufzeit über
    // den 29. Februar hinweg fälschlich zu lang.
    expect(pruefeBaustein8(mitDauer("2027-03-01", "2030-03-01"))).toHaveLength(0);
  });

  it("Außerkrafttreten vor Inkrafttreten ist ein Fehler", () => {
    const [e] = pruefeBaustein8(mitDauer("2029-01-01", "2026-01-01"));
    expect(e!.befund.severity).toBe("error");
    expect(e!.befund.regel).toBe("geltungsdauer_reihenfolge");
  });

  it("unvollständige Daten lösen nichts aus", () => {
    expect(pruefeBaustein8(entwurf({}))).toHaveLength(0);
  });

  it("die Grenze steht als Konstante bereit", () => {
    expect(GELTUNGSDAUER_JAHRE).toBe(3);
  });

  it("die Warnung erreicht Validierung und Prüfvermerk", () => {
    const d = pruefungenAnwenden(mitDauer("2026-01-01", "2031-01-01"));
    expect(d.vermerk?.map((v) => v.regel)).toContain("geltungsdauer");
    expect(validateDraft(d).issues.some((i) => i.regel === "geltungsdauer")).toBe(true);
  });
});

// Die Verzweigungen, die das Prozessmodell direkt hinter „Art der Finanzierung?" aufmacht.
describe("Baustein 5, Verzweigung der Finanzierungsart", () => {
  const profil = {
    jurisdiction: "land", gak: false, stateAid: false, fundingType: "project",
  } as const;
  const feld5 = (id: string) =>
    sections.find((s) => s.id === "5")!.fields.find((f) => f.id === id)!;

  it("Fehlbedarfsfinanzierung ohne Höchstbetrag ist ein Fehler", () => {
    const [e] = pruefeBaustein5(entwurf({ financingType: "deficit", fundingRate: 50 }))
      .filter((r) => r.befund.regel === "fehlbedarf_ohne_hoechstbetrag");
    expect(e!.befund.severity).toBe("error");
    expect(e!.befund.rechtsstelle).toContain("2.2.2");
  });

  it("Fehlbedarfsfinanzierung mit Höchstbetrag: kein Befund", () => {
    expect(regeln(entwurf({ financingType: "deficit", maximum: 500000 })))
      .not.toContain("fehlbedarf_ohne_hoechstbetrag");
  });

  it("andere Finanzierungsarten brauchen keinen Höchstbetrag", () => {
    expect(regeln(entwurf({ financingType: "share", fundingRate: 50 })))
      .not.toContain("fehlbedarf_ohne_hoechstbetrag");
  });

  it("Vollfinanzierung bei wirtschaftlichem Interesse ist ein Fehler", () => {
    const r = regeln(entwurf({ financingType: "full", economicInterest: "yes" }));
    expect(r).toContain("vollfinanzierung_wirtschaftliches_interesse");
  });

  it("und dann wird nicht mehr begründet, sondern umgewählt", () => {
    // Das Modell verzweigt aus der Vollfinanzierung heraus. Ein MdFE-Vermerk über eine
    // Vollfinanzierung, die es nicht geben darf, wäre eine falsche Aufforderung.
    const ergebnisse = pruefeBaustein5(
      entwurf({ financingType: "full", economicInterest: "yes" }),
    );
    expect(regeln(entwurf({ financingType: "full", economicInterest: "yes" })))
      .not.toContain("vollfinanzierung");
    expect(ergebnisse.some((e) => e.vermerk?.regel === "vollfinanzierung")).toBe(false);
  });

  it("ohne wirtschaftliches Interesse bleibt die Begründungspflicht", () => {
    const ergebnisse = pruefeBaustein5(
      entwurf({ financingType: "full", economicInterest: "no" }),
    );
    expect(ergebnisse.some((e) => e.vermerk?.regel === "vollfinanzierung")).toBe(true);
  });

  it("die bedingten Felder erscheinen nur in ihrem Zweig", () => {
    expect(fieldVisible(feld5("economicInterest"), profil, { financingType: "full" }))
      .toBe(true);
    expect(fieldVisible(feld5("economicInterest"), profil, { financingType: "share" }))
      .toBe(false);
    expect(fieldVisible(feld5("fixedAmount"), profil, { financingType: "fixed" }))
      .toBe(true);
    expect(fieldVisible(feld5("fixedAmount"), profil, { financingType: "deficit" }))
      .toBe(false);
  });

  it("Festbetragsfinanzierung ohne Betrag: Pflichtfeld schlägt an", () => {
    const d = entwurf({
      financingType: "fixed", financingForm: "grant", eligibleBasis: "actual",
      eligibleCosts: "Bau", cumulation: "no", maximum: 1000,
    });
    expect(validateDraft(d).issues.map((i) => i.fieldId)).toContain("fixedAmount");
  });
});

// Im Prozessmodell hängt die gesamte Prüflogik unter „Prüfung nach § 44 LHO".
describe("Bindung der Prüfungen an die Rechtsgrundlage", () => {
  const mitRgl = (rgl: string) => {
    const d = entwurf({ minimum: 100, financingType: "full" });
    d.sections["1"] = {
      fields: {
        legalBasis: {
          value: rgl, status: "confirmed", source: "user-form", confirmedByUser: true,
        },
      },
    };
    return d;
  };

  it("§ 44 LHO: die Prüfungen laufen", () => {
    expect(pruefeFachlich(mitRgl("lho44")).map((e) => e.befund.regel))
      .toContain("bagatellgrenze");
  });

  it("§ 53 LHO: sie laufen nicht, und das wird gesagt", () => {
    const r = pruefeFachlich(mitRgl("lho53"));
    expect(r.map((e) => e.befund.regel)).toEqual(["pruefung_nicht_einschlaegig"]);
  });

  it("Verwaltungsvorschrift: ebenso", () => {
    expect(pruefeFachlich(mitRgl("administrative")).map((e) => e.befund.regel))
      .toEqual(["pruefung_nicht_einschlaegig"]);
  });

  it("ohne Angabe wird geprüft — ein leeres Feld darf keine Prüfung abschalten", () => {
    expect(pruefeFachlich(entwurf({ minimum: 100 })).map((e) => e.befund.regel))
      .toContain("bagatellgrenze");
  });
});

// Modell: „Zuschuss — Herkunft § 44/53 LHO. Zuweisung — Herkunft eine Verwaltungsvorschrift."
describe("Form der Zuwendung gegen die Rechtsgrundlage", () => {
  const paar = (form: string, rgl: string) => {
    const d = entwurf({ financingForm: form });
    d.sections["1"] = {
      fields: {
        legalBasis: {
          value: rgl, status: "confirmed", source: "user-form", confirmedByUser: true,
        },
      },
    };
    return d;
  };
  const regel = (d: RichtlinieDraft) =>
    pruefeFachlich(d).map((e) => e.befund.regel);

  it("Zuschuss mit § 44 LHO passt", () => {
    expect(regel(paar("grant", "lho44"))).not.toContain("form_passt_nicht_zur_rechtsgrundlage");
  });

  it("Zuschuss mit § 53 LHO passt ebenfalls", () => {
    expect(regel(paar("grant", "lho53"))).not.toContain("form_passt_nicht_zur_rechtsgrundlage");
  });

  it("Zuweisung mit Verwaltungsvorschrift passt", () => {
    expect(regel(paar("allocation", "administrative")))
      .not.toContain("form_passt_nicht_zur_rechtsgrundlage");
  });

  it("Zuweisung mit § 44 LHO ist ein Fehler", () => {
    const [e] = pruefeZuwendungsform(paar("allocation", "lho44"));
    expect(e!.befund.severity).toBe("error");
    expect(e!.befund.message).toContain("Verwaltungsvorschrift");
  });

  it("Zuschuss mit Verwaltungsvorschrift ist ein Fehler", () => {
    // Läuft, obwohl die § 44-Prüfungen für diese Rechtsgrundlage abgeschaltet sind —
    // sonst bliebe genau dieser Widerspruch unsichtbar.
    expect(regel(paar("grant", "administrative")))
      .toContain("form_passt_nicht_zur_rechtsgrundlage");
  });

  it("solange eines von beiden fehlt, wird nicht geurteilt", () => {
    expect(pruefeZuwendungsform(paar("grant", ""))).toHaveLength(0);
    expect(pruefeZuwendungsform(entwurf({ financingForm: "grant" }))).toHaveLength(0);
  });
});

// Modell: „VV ist anzuwenden, wenn die Zuwendungsempfänger keine Komunen … sind."
describe("Empfängerkreis, VV oder VVG", () => {
  const mitEmpfaengern = (liste: string[]) => {
    const d = entwurf({ fundingRate: 90 });
    d.sections["3"] = {
      fields: {
        recipients: {
          value: liste, status: "confirmed", source: "user-form", confirmedByUser: true,
        },
      },
    };
    return d;
  };

  it("nur Kommunen: VVG, außerhalb des Piloten", () => {
    const [e] = pruefeEmpfaengerkreis(mitEmpfaengern(["municipal"]));
    expect(e!.befund.regel).toBe("vvg_ausserhalb_pilot");
    expect(e!.befund.severity).toBe("warning");
  });

  it("Kommunen und andere: gemischt, nicht entschieden", () => {
    const [e] = pruefeEmpfaengerkreis(mitEmpfaengern(["municipal", "private"]));
    expect(e!.befund.regel).toBe("empfaengerkreis_gemischt");
  });

  it("ohne Kommunen: kein Befund", () => {
    expect(pruefeEmpfaengerkreis(mitEmpfaengern(["private", "natural"]))).toHaveLength(0);
  });

  it("leerer Empfängerkreis: kein Befund", () => {
    expect(pruefeEmpfaengerkreis(mitEmpfaengern([]))).toHaveLength(0);
  });

  it("die übrigen Prüfungen laufen weiter", () => {
    // Bewusst nicht abgeschaltet: der kommunale Höchstsatz ist gerade hier die Aussage,
    // auf die es ankommt.
    const regeln = pruefeFachlich(mitEmpfaengern(["municipal"])).map((e) => e.befund.regel);
    expect(regeln).toContain("vvg_ausserhalb_pilot");
    expect(regeln).toContain("kommunaler_hoechstsatz");
  });
});

// Modell, Baustein 6: „Prüforgan: LHO: LRH + Min".
describe("Baustein 6, Prüfberechtigte", () => {
  const mitStellen = (liste: string[]) => {
    const d = entwurf({});
    d.sections["6"] = {
      fields: {
        auditRights: {
          value: liste, status: "confirmed", source: "user-form", confirmedByUser: true,
        },
      },
    };
    return d;
  };

  it("Landesrechnungshof und Ministerium: kein Befund", () => {
    expect(pruefeBaustein6(mitStellen(["lrh", "ministry"]))).toHaveLength(0);
  });

  // Hier stand bis zum 23.09.2026 „zusätzliche Stellen stören nicht" — eine ungeprüfte
  // Annahme aus dem Bauen, die der erste Durchlauf über Baustein 6 widerlegt hat: ein
  // Vorschlag setzte bei reiner Landesförderung den Bundesrechnungshof, und kein Befund kam.
  //
  // Der Bundesrechnungshof prüft, wo Bundesmittel fließen. Bei reiner Landesfinanzierung tut
  // er das nicht, und ihn in der Richtlinie zu nennen wäre eine falsche Angabe. Die Regel
  // schaut deshalb in beide Richtungen: was fehlt UND was zu viel ist.
  it("der Bundesrechnungshof ohne Bundesmittel ist ein Befund", () => {
    const [e] = pruefeBaustein6(mitStellen(["lrh", "ministry", "brh"]));
    expect(e!.befund.regel).toBe("pruefrechte_bund_ohne_bundesmittel");
  });

  it("nur der Rechnungshof: das Ministerium wird benannt", () => {
    const [e] = pruefeBaustein6(mitStellen(["lrh"]));
    expect(e!.befund.regel).toBe("pruefrechte_unvollstaendig");
    expect(e!.befund.message).toContain("Ministerium");
    expect(e!.befund.message).not.toContain("Landesrechnungshof prüfberechtigt");
  });

  it("noch nichts ausgewählt: kein Befund, das meldet die Feldprüfung", () => {
    expect(pruefeBaustein6(mitStellen([]))).toHaveLength(0);
  });
});

// Außergemeindlich gilt die VV mit 2.500 Euro, gemeindlich die VVG mit 5.000.
describe("Bagatellgrenze nach Empfängerkreis", () => {
  const mitEmpf = (minimum: number, empf: string[]) =>
    entwurf({ minimum }, { recipients: empf });

  it("ohne Kommunen gilt die Grenze von 2.500 Euro", () => {
    expect(regeln(mitEmpf(3000, ["private"]))).not.toContain("bagatellgrenze");
    expect(regeln(mitEmpf(2000, ["private"]))).toContain("bagatellgrenze");
  });

  it("mit Kommunen gilt die Grenze von 5.000 Euro", () => {
    // Der Fall, der vorher still durchging: 3.000 liegt über 2.500, aber unter 5.000.
    const [e] = pruefeBaustein5(mitEmpf(3000, ["municipal"]))
      .filter((r) => r.befund.regel === "bagatellgrenze");
    expect(e).toBeDefined();
    expect(e!.befund.message).toContain("5000");
    expect(e!.befund.message).toContain("gemeindlichen");
    expect(e!.befund.rechtsstelle).toContain("VVG");
  });

  it("über 5.000 Euro auch bei Kommunen kein Befund", () => {
    expect(regeln(mitEmpf(6000, ["municipal"]))).not.toContain("bagatellgrenze");
  });

  it("gemischter Empfängerkreis: die höhere Grenze gilt", () => {
    // Für den kommunalen Teil ist sie einschlägig; im Zweifel warnen statt schweigen.
    expect(regeln(mitEmpf(3000, ["municipal", "private"]))).toContain("bagatellgrenze");
  });

  it("die Grenzen stehen als Konstanten bereit", () => {
    expect(BAGATELLGRENZE_EUR).toBe(2500);
    expect(BAGATELLGRENZE_GEMEINDLICH_EUR).toBe(5000);
  });

  it("der Vermerk nennt den maßgeblichen Bereich", () => {
    const [e] = pruefeBaustein5(mitEmpf(3000, ["municipal"]))
      .filter((r) => r.befund.regel === "bagatellgrenze");
    expect(e!.vermerk?.beurteilung).toContain("gemeindlichen");
  });
});
