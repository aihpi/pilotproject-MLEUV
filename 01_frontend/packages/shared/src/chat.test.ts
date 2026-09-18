import { describe, expect, it } from "vitest";
import {
  chatStages,
  emptySections,
  istBelegSatz,
  nextChatStage,
  sections,
  stufenFelder,
  type RichtlinieDraft,
} from "./index";

/**
 * Was der Chat einsammelt — und was er dabei verliert.
 *
 * Anlass ist ein Durchlauf über die Oberfläche am 18.09.2026: Die Bearbeiterin schrieb „der
 * Fördersatz soll 90 Prozent betragen, als Anteilfinanzierung in Form eines Zuschusses". In
 * den Feldern kam nichts davon an, weil die Chat-Stufe nur ihre beiden gefragten Felder an
 * den Vorschlagsdienst weitergab. Die Prüfregeln dazu sind vorhanden und einzeln getestet —
 * sie schlugen trotzdem nicht an, denn ihre Eingangsgrößen blieben leer.
 *
 * Kein einziger Test hätte das gemeldet: geprüft war die Regel, nicht der Weg der Angabe
 * dorthin. Diese Datei deckt den Weg ab.
 */

const entwurf = (): RichtlinieDraft => ({
  id: "1",
  ownerId: "u",
  title: "",
  profile: { jurisdiction: "land", gak: false, stateAid: false, fundingType: "project" },
  sections: emptySections(),
  validation: { valid: false, issues: [] },
  status: "draft",
  version: 1,
  createdAt: "",
  updatedAt: "",
});

const stufe = (sectionId: string) =>
  chatStages.find((s) => s.sectionId === sectionId)!;

describe("stufenFelder sammelt den ganzen Abschnitt", () => {
  it("nimmt mehr Felder, als die Frage nennt", () => {
    const s = stufe("5");
    const gesammelt = stufenFelder(s, entwurf()).map((f) => f.id);
    expect(gesammelt.length).toBeGreaterThan(s.fieldIds.length);
  });

  it("nimmt den Fördersatz mit — daran hängt der kommunale Höchstsatz", () => {
    const gesammelt = stufenFelder(stufe("5"), entwurf()).map((f) => f.id);
    expect(gesammelt).toContain("fundingRate");
    expect(gesammelt).toContain("financingType");
  });

  it("lässt weg, was ein Mensch schon bestätigt hat", () => {
    const d = entwurf();
    d.sections["5"] = {
      fields: {
        fundingRate: { value: 60, status: "confirmed", source: "user-chat", confirmedByUser: true },
      },
    };
    expect(stufenFelder(stufe("5"), d).map((f) => f.id)).not.toContain("fundingRate");
  });

  it("lässt weg, was der gegenwärtige Pfad ausblendet", () => {
    const d = entwurf();
    const alle = sections.find((s) => s.id === "5")!.fields;
    const sichtbar = stufenFelder(stufe("5"), d);
    // Baustein 5 führt Felder, die erst eine Auswahl nötig macht (etwa der Festbetrag bei
    // Festbetragsfinanzierung). Ohne die Auswahl dürfen sie nicht mitgefragt werden.
    expect(sichtbar.length).toBeLessThan(alle.length);
  });
});

describe("Stufen und Abschnitte passen zusammen", () => {
  // Ohne diese Prüfung fällt ein Tippfehler in `fieldIds` nirgends auf: `stufeGilt` fragt
  // dann sicherheitshalber, und die Stufe endet nie, weil ihr Feld nicht existiert.
  it.each(chatStages.map((s) => [s.sectionId, s] as const))(
    "Baustein %s fragt nur nach Feldern, die es gibt",
    (sectionId, s) => {
      const vorhanden = sections.find((x) => x.id === sectionId)!.fields.map((f) => f.id);
      for (const id of s.fieldIds) expect(vorhanden, id).toContain(id);
    },
  );

  it("erhebt den Empfängerkreis als Auswahl, nicht nur als Beschreibung", () => {
    expect(stufe("3").fieldIds).toContain("recipients");
  });
});

describe("nextChatStage", () => {
  it("überspringt eine Stufe, deren gefragte Felder schon bestätigt sind", () => {
    const d = entwurf();
    const erste = chatStages[0]!;
    d.sections[erste.sectionId] = {
      fields: Object.fromEntries(
        erste.fieldIds.map((id) => [
          id,
          {
            value: "x",
            status: "confirmed" as const,
            source: "user-chat" as const,
            confirmedByUser: true,
          },
        ]),
      ),
    };
    expect(nextChatStage(d)?.sectionId).not.toBe(erste.sectionId);
  });

  it("ist am Ende leer", () => {
    const d = entwurf();
    for (const s of chatStages)
      d.sections[s.sectionId] = {
        fields: Object.fromEntries(
          s.fieldIds.map((id) => [
            id,
            {
            value: "x",
            status: "confirmed" as const,
            source: "user-chat" as const,
            confirmedByUser: true,
          },
          ]),
        ),
      };
    expect(nextChatStage(d)).toBeNull();
  });
});

describe("istBelegSatz", () => {
  it("verwirft eine Gliederungsüberschrift", () => {
    expect(istBelegSatz("Nennung der Fördergegenstände")).toBe(false);
  });

  it("verwirft einen Tabellenrest", () => {
    expect(istBelegSatz("5.4, 1 = Bemessungsgrundlage: Ausgaben..")).toBe(false);
  });

  it("verwirft ein Satzfragment", () => {
    expect(istBelegSatz("nach Maßgabe dieser Richtlinie")).toBe(false);
  });

  it("nimmt einen ganzen Satz", () => {
    expect(
      istBelegSatz(
        "Das Land Brandenburg gewährt Zuwendungen zur Förderung von Vorhaben des " +
          "Tierschutzes nach Maßgabe dieser Richtlinie.",
      ),
    ).toBe(true);
  });

  it("nimmt einen langen Absatz auch ohne Schlusspunkt", () => {
    // Der Satzfilter schneidet mitunter mitten im Satz ab. Ein solcher Rest ist unschön,
    // aber er trägt eine Aussage — anders als eine Überschrift.
    expect(
      istBelegSatz(
        "Zuwendungsfähig sind Investitionskosten zur Umsetzung der Vorhaben, Kosten für " +
          "die Durchführung von Vergabeverfahren sowie Honorarkosten zur Umsetzung der " +
          "Vorhaben und Sachkosten für Öffentlichkeitsarbeit",
      ),
    ).toBe(true);
  });

  it("nimmt nichts, wo nichts ist", () => {
    expect(istBelegSatz(null)).toBe(false);
    expect(istBelegSatz("")).toBe(false);
  });
});
