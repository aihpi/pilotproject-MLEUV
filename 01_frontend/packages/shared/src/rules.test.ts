import { describe, expect, it } from "vitest";
import {
  abfrageartFuer,
  chatStages,
  dokumentLink,
  emptySections,
  nextChatStage,
  sections,
  stufeGilt,
  validateDraft,
  type RichtlinieDraft,
} from "./index";
const base: RichtlinieDraft = {
  id: "1",
  ownerId: "u",
  title: "",
  profile: {
    jurisdiction: "land",
    gak: false,
    stateAid: false,
    fundingType: "project",
  },
  sections: emptySections(),
  validation: { valid: false, issues: [] },
  status: "draft",
  version: 1,
  createdAt: "",
  updatedAt: "",
};
describe("rules", () => {
  it("finds required fields", () =>
    expect(validateDraft(base).issues.length).toBeGreaterThan(10));
  it("activates GAK warning", () =>
    expect(
      validateDraft({
        ...base,
        profile: { ...base.profile, gak: true, jurisdiction: "bund" },
      }).issues.some((i) => i.severity === "warning"),
    ).toBe(true));
  it("contains the revised ELER choices", () => {
    const legalBasis = sections[1]!.fields.find(
      (field) => field.id === "legalBasis",
    )!;
    expect(legalBasis.options?.map((option) => option.label)).toEqual([
      "Zuwendung nach § 44 LHO",
      "Billigkeitsleistung nach § 53 LHO",
      "Verwaltungsvorschriften",
    ]);
    const procedure = sections.find((section) => section.id === "7")!;
    expect(procedure.fields.some((field) => field.id === "data")).toBe(false);
    expect(
      procedure.fields.find((field) => field.id === "applicationType")?.options,
    ).toHaveLength(3);
    expect(
      procedure.fields.find((field) => field.id === "payment")?.options,
    ).toHaveLength(2);
  });
  it("keeps the visible chat question aligned with its target fields", () => {
    expect(nextChatStage(base)?.fieldIds).toEqual(["title"]);
    const titleConfirmed: RichtlinieDraft = {
      ...base,
      sections: {
        ...base.sections,
        "0": {
          fields: {
            title: {
              value: "Tierschutzförderrichtlinie",
              status: "confirmed",
              source: "user-chat",
              confirmedByUser: true,
            },
          },
        },
      },
    };
    const next = nextChatStage(titleConfirmed);
    expect(next?.fieldIds).toEqual(["goal", "purpose"]);
    expect(next?.question).toContain("Ziel der Förderung");
    expect(next?.question).toContain("Zuwendungszweck");
  });
});

// Modell: „Nur alte RL des Landes/GAK als Hilfestellung (auch bei nicht GAK-RL)."
describe("Abfragesorte nach Zielfeld", () => {
  it("Voraussetzungen kommen aus früheren Richtlinien", () => {
    expect(abfrageartFuer(["requirements"])).toBe("vorschlagen");
  });

  it("fachliche Ausschlüsse und Zuwendungsbestimmungen ebenso", () => {
    expect(abfrageartFuer(["exclusions"])).toBe("vorschlagen");
    expect(abfrageartFuer(["otherConditions"])).toBe("vorschlagen");
  });

  it("ein Vorschlagsfeld in der Menge genügt", () => {
    expect(abfrageartFuer(["subject", "requirements"])).toBe("vorschlagen");
  });

  it("sonst keine Sorte — dann sieht die Suche den ganzen Korpus", () => {
    expect(abfrageartFuer(["goal", "purpose"])).toBeUndefined();
    expect(abfrageartFuer([])).toBeUndefined();
  });
});

describe("Bemessungsgrundlage kommt aus früheren Verfahren", () => {
  it("Bemessungsgrundlage und förderfähige Kosten sind Vorschlagsfelder", () => {
    expect(abfrageartFuer(["eligibleBasis"])).toBe("vorschlagen");
    expect(abfrageartFuer(["eligibleCosts"])).toBe("vorschlagen");
  });

  it("die letzte Chat-Stufe fragt sie ab", () => {
    // Das Prozessmodell verlangt für die Bemessungsgrundlage ausdrücklich den Chat und
    // nicht das Formular — sie sei „sehr individuell".
    const stufe = chatStages.find((s) => s.sectionId === "5");
    expect(stufe).toBeDefined();
    expect(stufe!.fieldIds).toContain("eligibleCosts");
    expect(stufe!.fieldIds).toContain("eligibleBasis");
  });
});

describe("Fundstelle als Verweis", () => {
  const p = (extra: Record<string, unknown>) => ({
    sectionId: "1" as const, fieldId: "goal", label: "Förderziel", value: "x",
    confidence: 0.9, evidence: "", ...extra,
  });

  it("Datei und Seite ergeben einen Verweis mit Seitensprung", () => {
    const link = dokumentLink(p({ belegdatei: "RL Tierheim.pdf", belegseite: 3 }));
    expect(link).toContain("/dokument/");
    expect(link).toContain("#page=3");
  });

  it("Leerzeichen und Umlaute werden kodiert", () => {
    // Sonst bricht der Verweis bei fast jedem Dokument des Korpus.
    expect(dokumentLink(p({ belegdatei: "RL Tierheimförderung_16.pdf", belegseite: 1 })))
      .toContain("RL%20Tierheimf%C3%B6rderung_16.pdf");
  });

  it("ohne Seite trotzdem ein Verweis, nur ohne Sprung", () => {
    const link = dokumentLink(p({ belegdatei: "x.pdf" }));
    expect(link).toContain("x.pdf");
    expect(link).not.toContain("#page");
  });

  it("ohne Datei kein Verweis", () => {
    expect(dokumentLink(p({ belegseite: 3 }))).toBeNull();
    expect(dokumentLink(p({}))).toBeNull();
  });
});

// Das Prozessmodell verzweigt; das Gespräch tat es bisher nicht.
describe("Chat-Stufen im Pfad", () => {
  const entwurf = (felder: Record<string, Record<string, unknown>>,
                   bestaetigt = true): RichtlinieDraft => {
    const alle = emptySections();
    for (const [abschnitt, werte] of Object.entries(felder))
      alle[abschnitt] = {
        fields: Object.fromEntries(Object.entries(werte).map(([k, v]) => [k, {
          value: v as never, status: "confirmed" as const,
          source: "user-form" as const, confirmedByUser: bestaetigt,
        }])),
      };
    return {
      id: "1", ownerId: "u", title: "T",
      profile: { jurisdiction: "land", gak: false, stateAid: false, fundingType: "project" },
      sections: alle, validation: { valid: false, issues: [] },
      status: "draft", version: 1, createdAt: "", updatedAt: "",
    };
  };
  const stufe5 = chatStages.find((s) => s.sectionId === "5")!;

  it("eine Stufe gilt, solange eines ihrer Felder sichtbar ist", () => {
    expect(stufeGilt(stufe5, entwurf({}))).toBe(true);
  });

  it("eine ausdrückliche Bedingung kann sie abschalten", () => {
    const aus = { ...stufe5, gilt: () => false };
    expect(stufeGilt(aus, entwurf({}))).toBe(false);
    expect(nextChatStage(entwurf({}))).not.toBeNull();
  });

  it("unbestätigte Werte steuern den Pfad NICHT", () => {
    // Der gefährlichste Fall: eine Vermutung des Modells überspringt still eine Frage.
    const nurVermutet = entwurf({ "5": { financingType: "full" } }, false);
    const werte = Object.values(nurVermutet.sections).flatMap((s) =>
      Object.entries(s.fields).filter(([, f]) => f.confirmedByUser));
    expect(werte).toHaveLength(0);
    expect(stufeGilt(stufe5, nurVermutet)).toBe(true);
  });

  it("nextChatStage überspringt eine nicht geltende Stufe", () => {
    // Stufe 0 ist bestätigt, also wäre Stufe 1 dran — sie gilt und kommt.
    const d = entwurf({ "0": { title: "Test" } });
    expect(nextChatStage(d)?.sectionId).toBe("1");
  });

  it("alles bestätigt: keine Stufe mehr offen", () => {
    const d = entwurf(Object.fromEntries(chatStages.map((s) =>
      [s.sectionId, Object.fromEntries(s.fieldIds.map((f) => [f, "x"]))])));
    expect(nextChatStage(d)).toBeNull();
  });
});
