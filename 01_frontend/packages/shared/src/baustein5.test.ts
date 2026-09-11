import { describe, expect, it } from "vitest";
import {
  BAGATELLGRENZE_EUR,
  emptySections,
  pruefeBaustein5,
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
    expect(regeln(entwurf({}))).toHaveLength(0);
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
    expect(regeln(entwurf({ financingType: "share" }))).toHaveLength(0);
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
    // Aus der Erläuterung der VB ELER zur Musterrichtlinie: „Im Landesbereich sind keine
    // VKO'en möglich." Zwei von Arvids fünf Optionen sind genau das.
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
    expect(regeln(entwurf({ eligibleBasis: "actual" }))).toHaveLength(0);
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
