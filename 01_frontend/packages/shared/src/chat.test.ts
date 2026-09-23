import { describe, expect, it } from "vitest";
import {
  chatStages,
  emptySections,
  feldLeer,
  feldwertAusVorschlag,
  istBelegSatz,
  istWiederholung,
  naechsteFrage,
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

  it("fragt eine übersprungene Stufe nicht erneut", () => {
    // Die Sackgasse aus dem Durchlauf vom 22.09.2026: der Empfängerkreis liess sich aus dem
    // Gespräch nicht füllen, also kam dieselbe Frage wieder und wieder. „Überspringen" war
    // folgenlos.
    const d = entwurf();
    const erste = chatStages[0]!;
    d.uebersprungeneStufen = [erste.sectionId];
    expect(nextChatStage(d)?.sectionId).not.toBe(erste.sectionId);
  });

  it("überspringen bestätigt nichts", () => {
    // Übersprungen ist nur die FRAGE. Die Pflichtangabe fehlt weiterhin, und die
    // Gesamtprüfung muss sie anmahnen — sonst verschwindet eine Lücke durch einen Klick.
    const d = entwurf();
    d.uebersprungeneStufen = ["3"];
    const felder = stufenFelder(stufe("3"), d).map((f) => f.id);
    expect(felder).toContain("recipients");
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

describe("naechsteFrage", () => {
  const bestaetigt = (d: RichtlinieDraft, sectionId: string, felder: Record<string, unknown>) => {
    d.sections[sectionId] = {
      fields: Object.fromEntries(
        Object.entries(felder).map(([id, value]) => [
          id,
          {
            value: value as never,
            status: "confirmed" as const,
            source: "user-chat" as const,
            confirmedByUser: true,
          },
        ]),
      ),
    };
  };

  it("stellt nur die Frage, wenn nichts vorweggenommen wurde", () => {
    expect(naechsteFrage(entwurf())).toBe(chatStages[0]!.question);
  });

  it("zeigt, was aus früheren Angaben schon übernommen wurde", () => {
    // Die Kritik aus dem Durchlauf: wer seine Förderidee am Stück erzählt, füllt mehrere
    // Bausteine — und die zugehörigen Fragen verschwanden wortlos. Das Gespräch sprang.
    const d = entwurf();
    bestaetigt(d, "0", { title: "Richtlinie Katzenkastration" });
    const text = naechsteFrage(d);
    expect(text).toContain("schon übernommen");
    expect(text).toContain("Richtlinie Katzenkastration");
    expect(text).toContain("ergänzen");
    expect(text).toContain(chatStages[1]!.question);
  });

  it("zeigt Auswahlwerte als Beschriftung, nicht als Kennung", () => {
    const d = entwurf();
    bestaetigt(d, "0", { title: "T" });
    bestaetigt(d, "1", { goal: "Z", purpose: "P" });
    bestaetigt(d, "2", { subject: "G" });
    bestaetigt(d, "3", { recipients: ["municipal"], recipientDetails: "Gemeinden" });
    const text = naechsteFrage(d);
    expect(text).toContain("Kommunen und kommunale Einrichtungen");
    expect(text).not.toContain("municipal");
  });

  it("sagt am Ende, dass die Erhebung durch ist", () => {
    const d = entwurf();
    for (const s of chatStages) d.uebersprungeneStufen = [
      ...(d.uebersprungeneStufen ?? []), s.sectionId,
    ];
    expect(naechsteFrage(d)).toContain("abgeschlossen");
  });
});

describe("feldwertAusVorschlag", () => {
  // Der Dienst antwortet in Text, das Formular rechnet in Zahlen und Listen. Ging der Wert
  // ungeprüft durch, stand im Fördersatz "90 Prozent" — und `pruefeBaustein5` verglich eine
  // Zeichenkette mit 80, ohne Fehler und ohne Befund.
  it("macht aus 90 Prozent die Zahl 90", () => {
    expect(feldwertAusVorschlag("90 Prozent", "number")).toBe(90);
  });

  it("lässt eine Zahl Zahl sein", () => {
    expect(feldwertAusVorschlag(90, "number")).toBe(90);
  });

  it("versteht deutsche Tausender- und Dezimaltrennung", () => {
    expect(feldwertAusVorschlag("1.500 Euro", "number")).toBe(1500);
    expect(feldwertAusVorschlag("2,5 %", "number")).toBe(2.5);
  });

  it("erfindet keine Zahl, wo keine steht", () => {
    expect(feldwertAusVorschlag("nach Bedarf", "number")).toBe("nach Bedarf");
  });

  it("macht aus einer Mehrfachauswahl eine Liste", () => {
    expect(feldwertAusVorschlag("municipal", "checkbox")).toEqual(["municipal"]);
    expect(feldwertAusVorschlag(["municipal", "private"], "checkbox")).toEqual([
      "municipal",
      "private",
    ]);
  });

  it("zerlegt eine Aufzählung in einer Zeile", () => {
    expect(feldwertAusVorschlag("municipal, private", "checkbox")).toEqual([
      "municipal",
      "private",
    ]);
    expect(feldwertAusVorschlag("municipal und private", "checkbox")).toEqual([
      "municipal",
      "private",
    ]);
  });

  it("gibt für nichts nichts zurück", () => {
    expect(feldwertAusVorschlag(null, "text")).toBeNull();
  });
});

describe("istWiederholung", () => {
  // Im Durchlauf vom 22.09.2026 zog sich der Abschnitt „Zuwendungsvoraussetzungen" den
  // Empfängerkreis, den Fördergegenstand und die Weiterleitungsregel aus dem Verlauf — alles
  // schon anderswo geregelt. Die Weiterleitungsregel stand danach im Text von Baustein 4
  // und fehlte in Baustein 3.
  const mit = (sectionId: string, fieldId: string, value: string) => {
    const d = entwurf();
    d.sections[sectionId] = {
      fields: {
        [fieldId]: {
          value,
          status: "confirmed",
          source: "user-chat",
          confirmedByUser: true,
        },
      },
    };
    return d;
  };

  const weiterleitung =
    "Eine Weiterleitung der Zuwendung an Dritte ist nicht zulässig und auch nicht in " +
    "Teilen gestattet.";

  it("erkennt eine Wiederholung aus einem anderen Abschnitt", () => {
    const d = mit("3", "forwardingRules", weiterleitung);
    expect(istWiederholung(weiterleitung, d, "4")).toBe(true);
  });

  it("erkennt sie auch umformuliert", () => {
    const d = mit("3", "forwardingRules", weiterleitung);
    const anders =
      "Eine Weiterleitung der Zuwendung an Dritte ist nicht zulässig, auch nicht in Teilen.";
    expect(istWiederholung(anders, d, "4")).toBe(true);
  });

  it("stört den eigenen Abschnitt nicht", () => {
    const d = mit("3", "forwardingRules", weiterleitung);
    expect(istWiederholung(weiterleitung, d, "3")).toBe(false);
  });

  it("lässt eine eigenständige Regelung stehen", () => {
    const d = mit("3", "forwardingRules", weiterleitung);
    const eigen =
      "Der Antragsteller muss seinen Sitz im Land Brandenburg haben und die Maßnahme " +
      "dort durchführen.";
    expect(istWiederholung(eigen, d, "4")).toBe(false);
  });

  it("greift nicht bei kurzen Werten", () => {
    const d = mit("3", "forwarding", "Nicht zulässig");
    expect(istWiederholung("Nicht zulässig", d, "4")).toBe(false);
  });

  it("vergleicht nur bestätigte Werte", () => {
    const d = entwurf();
    d.sections["3"] = {
      fields: {
        forwardingRules: {
          value: weiterleitung,
          status: "suggested",
          source: "ai-extracted",
          confirmedByUser: false,
        },
      },
    };
    expect(istWiederholung(weiterleitung, d, "4")).toBe(false);
  });

  it("lässt Zahlen und Listen unberührt", () => {
    const d = mit("3", "forwardingRules", weiterleitung);
    expect(istWiederholung(90, d, "5")).toBe(false);
    expect(istWiederholung(["municipal"], d, "5")).toBe(false);
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

describe("feldLeer", () => {
  // `!wert` gab hier die falsche Antwort: eine leere Liste ist in JavaScript wahr. Wer bei
  // „Prüfberechtigte Stellen" alle Haken entfernte, hatte für die Statusanzeige weiterhin
  // einen Wert — der Abschnitt blieb auf „Vollständig" und mahnte gleichzeitig ein offenes
  // Feld an. Zwei widersprüchliche Meldungen aus derselben Ursache.
  it("die leere Liste ist leer", () => {
    expect(feldLeer([])).toBe(true);
    // Das Missverständnis dahinter: `[]` ist wahrheitswertig, `![]` also falsch.
  });

  it("nichts ist leer", () => {
    expect(feldLeer(null)).toBe(true);
    expect(feldLeer("")).toBe(true);
  });

  it("die Null ist eine Festlegung, keine Leere", () => {
    expect(feldLeer(0)).toBe(false);
  });

  it("ein abgewähltes Ja/Nein ist eine Festlegung", () => {
    expect(feldLeer(false)).toBe(false);
  });

  it("gefüllte Werte sind nicht leer", () => {
    expect(feldLeer("Text")).toBe(false);
    expect(feldLeer(["municipal"])).toBe(false);
    expect(feldLeer(90)).toBe(false);
  });
});
