import {
  emptySections,
  chatStages,
  naechsteFrage,
  nextChatStage,
  pruefungenAnwenden,
  sections,
  validateDraft,
  type ChatReply,
  type FieldProposal,
  type FieldValue,
  type FundingProfile,
  type RichtlinieDraft,
  type SectionData,
} from "@richtlinie/shared";

const storageKey = "richtliniengenerator-offline-drafts";
const uuid = () =>
  globalThis.crypto?.randomUUID?.() ??
  `${Date.now()}-${Math.random().toString(16).slice(2)}`;

type DemoValue = string | number | boolean | string[];
const confirmedFields = (values: Record<string, DemoValue>) => ({
  fields: Object.fromEntries(
    Object.entries(values).map(([key, value]) => [
      key,
      {
        value,
        status: "confirmed",
        source: "user-form",
        confirmedByUser: true,
      } satisfies FieldValue,
    ]),
  ),
});

function completeDemoDraft(
  variant: "moor" | "wasser",
): RichtlinieDraft {
  const moor = variant === "moor";
  const title = moor
    ? "Richtlinie Klimaschutz durch Moorbodenschutz 2027"
    : "Richtlinie für klimaresiliente Bewässerungssysteme 2027";
  const profile: FundingProfile = {
    jurisdiction: moor ? "land" : "mixed",
    gak: !moor,
    stateAid: true,
    fundingType: "project",
  };
  const draft: RichtlinieDraft = {
    id: `demo-${variant}-2027`,
    ownerId: "offline",
    title,
    profile,
    sections: {
      "0": confirmedFields({
        title,
        preamble: moor
          ? "Intakte und wiedervernässte Moorböden leisten einen wesentlichen Beitrag zum Klimaschutz, zum Erhalt der biologischen Vielfalt und zur Anpassung an den Klimawandel."
          : "Eine nachhaltige und wassersparende Bewässerung stärkt die Anpassungsfähigkeit landwirtschaftlicher Betriebe an zunehmende Trockenperioden.",
      }),
      "1": confirmedFields({
        goal: moor
          ? "Dauerhafte Minderung von Treibhausgasemissionen aus landwirtschaftlich genutzten Moorböden im Land Brandenburg."
          : "Verbesserung der Klimaresilienz landwirtschaftlicher Betriebe durch eine effizientere Nutzung der verfügbaren Wasserressourcen.",
        purpose: moor
          ? "Gefördert werden investive und vorbereitende Maßnahmen zur Wiedervernässung sowie zur moorschonenden Bewirtschaftung."
          : "Die Förderung unterstützt Investitionen in wassersparende Bewässerungstechnik, digitale Steuerung und betriebliche Wasserspeicherung.",
        legalBasis: "lho44",
        ...(!moor
          ? { gakBasis: "GAK-Rahmenplan, Förderbereich 4 – Markt- und standortangepasste Landbewirtschaftung" }
          : {}),
        stateAidBasis: moor
          ? "Verordnung (EU) 2022/2472, insbesondere Artikel 14; ergänzend De-minimis-Verordnung im Agrarsektor."
          : "Verordnung (EU) 2022/2472, Artikel 14, in der jeweils geltenden Fassung.",
      }),
      "2": confirmedFields({
        subject: moor
          ? "Machbarkeitsstudien, wasserbauliche Maßnahmen, regelbare Staue, Flächeneinrichtung und Technik für eine moorschonende Nassbewirtschaftung."
          : "Tropf- und Mikrobewässerung, sensorbasierte Steuerung, Bodenfeuchtemessung, Speicherbecken und Anlagen zur Regenwassernutzung.",
        successCriteria: moor
          ? "Wiedervernässte Fläche in Hektar, angehobener mittlerer Wasserstand und rechnerisch vermiedene CO₂-Äquivalente."
          : "Wassereinsparung gegenüber dem Referenzverfahren, geförderte Fläche und Anzahl digital gesteuerter Bewässerungseinheiten.",
        exclusions: "Nicht gefördert werden Ersatzbeschaffungen ohne Effizienzgewinn, laufende Betriebsausgaben sowie Maßnahmen, die vor Antragstellung begonnen wurden.",
      }),
      "3": confirmedFields({
        recipients: moor
          ? ["natural", "private", "public", "municipal"]
          : ["natural", "private", "sme"],
        recipientDetails: moor
          ? "Landwirtschaftliche Betriebe, rechtsfähige Flächeneigentümer, Gewässerunterhaltungsverbände und kommunale Körperschaften mit Flächen im Fördergebiet."
          : "Kleine und mittlere landwirtschaftliche Unternehmen mit Betriebssitz oder förderfähiger Betriebsstätte im Land Brandenburg.",
        recipientExclusions: "Unternehmen in Schwierigkeiten sowie Antragstellende mit offenen Rückforderungsanordnungen der Europäischen Kommission sind ausgeschlossen.",
        forwarding: "no",
        forwardingRules: "Eine Weiterleitung der Zuwendung an Dritte ist nicht zulässig. Aufträge dürfen unter Beachtung des Vergaberechts vergeben werden.",
      }),
      "4": confirmedFields({
        requirements: moor
          ? "Die Flächen müssen als Moorboden kartiert sein. Ein hydrologisches Fachkonzept, die erforderlichen Genehmigungen und eine gesicherte Flächenverfügbarkeit für mindestens zwölf Jahre sind nachzuweisen."
          : "Vorlage eines betrieblichen Wassernutzungskonzepts, Nachweis einer gültigen wasserrechtlichen Erlaubnis und einer prognostizierten Wassereinsparung von mindestens 20 Prozent.",
        area: moor
          ? "Moor- und Anmoorböden innerhalb des Landes Brandenburg gemäß aktueller Moorbodenkarte."
          : "Landwirtschaftlich genutzte Flächen im Land Brandenburg außerhalb dauerhaft wasserwirtschaftlich überlasteter Teilgebiete.",
        selectionCriteria: "Bewertet werden Klimawirkung beziehungsweise Wassereinsparung, fachliche Qualität, Umsetzungsreife, Flächenwirkung und Wirtschaftlichkeit.",
        aidRegime: ["agrar-gvo", "de-minimis"],
      }),
      "5": confirmedFields({
        financingType: "share",
        financingForm: "grant",
        eligibleBasis: "actual",
        eligibleCosts: moor
          ? "Planungsleistungen, Genehmigungsunterlagen, Bauleistungen, Stau- und Messtechnik, Flächeneinrichtung sowie projektbezogene Beratung."
          : "Lieferung und Installation von Bewässerungstechnik, Sensorik, Steuerungssoftware, Speicheranlagen sowie erforderliche Planungsleistungen.",
        fundingRate: moor ? 80 : 60,
        maximum: moor ? 1500000 : 500000,
        ownContribution: "yes",
        minimum: moor ? 25000 : 10000,
        cumulation: "rules",
      }),
      "6": confirmedFields({
        ancillary: moor ? "anbest-p-g" : "anbest-p",
        auditRights: ["lrh", "ministry"],
        purposeBindingYears: moor ? 12 : 5,
        inventory: "yes",
        otherConditions: moor
          ? "Die geförderten Flächen und Anlagen sind zwölf Jahre zweckentsprechend zu nutzen. Wasserstände und Flächennutzung sind jährlich zu dokumentieren."
          : "Die geförderten Anlagen sind mindestens fünf Jahre zweckentsprechend zu betreiben. Wasserverbräuche sind digital zu erfassen und auf Anforderung vorzulegen.",
      }),
      "7": confirmedFields({
        authority: "Investitionsbank des Landes Brandenburg (ILB)",
        applicationType: "one",
        selection: "criteria",
        earlyStart: "variant-1",
        applicationProcedure: "analog-deadline",
        applicationDeadline: "2027-03-31",
        payment: "refund",
      }),
      "8": confirmedFields({
        validFrom: "2027-01-01",
        validUntil: "2030-12-31",
      }),
      "9": confirmedFields({
        heading: "Begriffsbestimmungen und technische Mindestanforderungen",
        other: moor
          ? "Anlage 1 enthält die anerkannten Verfahren zur Ermittlung der Klimawirkung. Anlage 2 bestimmt die Mindestanforderungen an das hydrologische Monitoring."
          : "Anlage 1 enthält technische Mindestanforderungen und Referenzwerte zur Berechnung der Wassereinsparung.",
      }),
      "10": confirmedFields({
        closing: "Potsdam, den 15. Dezember 2026\nMinisterium für Land- und Ernährungswirtschaft, Umwelt und Verbraucherschutz\nIm Auftrag",
      }),
    },
    validation: { valid: false, issues: [] },
    status: "review",
    version: 1,
    createdAt: "2026-08-20T09:00:00.000Z",
    updatedAt: moor
      ? "2026-08-28T09:15:00.000Z"
      : "2026-08-27T14:30:00.000Z",
  };
  draft.validation = validateDraft(draft);
  // Auch die Beispiel-Entwürfe durch die fachlichen Prüfungen: sonst ist ihr Prüfvermerk
  // leer, obwohl beide eine Geltungsdauer von vier Jahren führen — und die ist nach Anlage
  // 19 zu begründen. Ein Vorführentwurf, dessen Vermerk leer ist, zeigt das Gegenteil
  // dessen, was er zeigen soll.
  const gepruft = pruefungenAnwenden(draft);
  draft.sections = gepruft.sections;
  draft.vermerk = gepruft.vermerk;
  return draft;
}

const demoDrafts = () => [
  completeDemoDraft("moor"),
  completeDemoDraft("wasser"),
];
const load = (): RichtlinieDraft[] => {
  try {
    const stored = JSON.parse(localStorage.getItem(storageKey) ?? "[]");
    const existing: RichtlinieDraft[] = Array.isArray(stored) ? stored : [];
    const missingDemos = demoDrafts().filter(
      (demo) => !existing.some((draft) => draft.id === demo.id),
    );
    const merged = [...missingDemos, ...existing];
    if (missingDemos.length)
      localStorage.setItem(storageKey, JSON.stringify(merged));
    return merged;
  } catch {
    return demoDrafts();
  }
};
const save = (drafts: RichtlinieDraft[]) =>
  localStorage.setItem(storageKey, JSON.stringify(drafts));
const get = (id: string) => {
  const draft = load().find((d) => d.id === id);
  if (!draft) throw new Error("Entwurf nicht gefunden");
  return draft;
};
const store = (draft: RichtlinieDraft) => {
  const drafts = load();
  const index = drafts.findIndex((d) => d.id === draft.id);
  index < 0 ? drafts.unshift(draft) : (drafts[index] = draft);
  save(drafts);
  return draft;
};
const touch = (draft: RichtlinieDraft) => {
  draft.updatedAt = new Date().toISOString();
  draft.version++;
  draft.validation = validateDraft(draft);
  // Wie im Dienst: die fachlichen Prüfungen schreiben Vermerkseinträge und
  // Überarbeitungsanforderungen mit. Ohne das bliebe der Prüfvermerk offline immer leer,
  // und die Attrappe würde etwas anderes zeigen als der Betrieb — der schlechteste Fall
  // für eine Vorführung.
  const gepruft = pruefungenAnwenden(draft);
  draft.sections = gepruft.sections;
  draft.vermerk = gepruft.vermerk;
  return store(draft);
};

export const staticApi = {
  session: async () => ({ user: { name: "Offline-Nutzer:in" } }),
  drafts: async () => load(),
  draft: async (id: string) => get(id),
  create: async (profile: FundingProfile) => {
    const now = new Date().toISOString();
    const draft: RichtlinieDraft = {
      id: uuid(),
      ownerId: "offline",
      title: "Neue Förderrichtlinie",
      profile,
      sections: emptySections(),
      validation: { valid: false, issues: [] },
      status: "draft",
      version: 1,
      createdAt: now,
      updatedAt: now,
    };
    draft.validation = validateDraft(draft);
    return store(draft);
  },
  update: async (
    id: string,
    patch: {
      title?: string;
      profile?: FundingProfile;
      sections?: Record<string, SectionData>;
      status?: RichtlinieDraft["status"];
      expectedVersion: number;
    },
  ) => {
    const draft = get(id);
    if (patch.title !== undefined) draft.title = patch.title;
    if (patch.profile) draft.profile = patch.profile;
    if (patch.sections)
      draft.sections = { ...draft.sections, ...patch.sections };
    if (patch.status) draft.status = patch.status;
    return touch(draft);
  },
  chatAusVerlauf: async (id: string): Promise<ChatReply> =>
    staticApi.chat(id, (get(id).chatVerlauf ?? []).join("\n\n")),
  chat: async (id: string, message: string): Promise<ChatReply> => {
    const draft = get(id);
    const stage = nextChatStage(draft) ?? chatStages[0]!;
    const def = sections.find((s) => s.id === stage.sectionId)!;
    // Wie im Dienst: gefragt ist gefragt, auch wenn nichts dabei herauskommt.
    draft.gefragteStufen = [
      ...new Set([...(draft.gefragteStufen ?? []), stage.sectionId]),
    ];
    store(draft);
    const proposals: FieldProposal[] = stage.fieldIds.map((fieldId) => {
      const field = def.fields.find((f) => f.id === fieldId)!;
      return {
        sectionId: stage.sectionId,
        fieldId,
        label: field.label,
        value: message.trim(),
        confidence: 0.82,
        evidence: message.trim(),
      };
    });
    const index = chatStages.indexOf(stage);
    return {
      message: `Ich habe Ihre Angabe dem Abschnitt „${def.title}“ zugeordnet. Bitte prüfen Sie den Vorschlag, bevor er übernommen wird.`,
      extraction: {
        id: uuid(),
        messageId: uuid(),
        proposals,
        followUpQuestions: chatStages[index + 1]
          ? [chatStages[index + 1]!.question]
          : [],
        conflicts: [],
      },
      progress: Math.round(((index + 1) / chatStages.length) * 100),
    };
  },
  confirm: async (
    id: string,
    _extractionId: string,
    proposals: FieldProposal[],
  ) => {
    const draft = get(id);
    for (const p of proposals) {
      draft.sections[p.sectionId] ??= { fields: {} };
      draft.sections[p.sectionId]!.fields[p.fieldId] = {
        value: p.value,
        status: "confirmed",
        source: "ai-extracted",
        confidence: p.confidence,
        evidence: p.evidence,
        confirmedByUser: true,
      };
      if (p.fieldId === "title") draft.title = String(p.value ?? "");
    }
    touch(draft);
    return {
      draft,
      nextQuestion: naechsteFrage(draft, proposals[0]?.sectionId),
    };
  },
  // Auch im Offline-Mockup überspringt „Überspringen" wirklich — sonst verhält sich die
  // Oberfläche dort anders als am laufenden Dienst, und Fehler zeigen sich erst spät.
  reject: async (id: string) => {
    const draft = get(id);
    const stage = nextChatStage(draft);
    if (stage)
      draft.uebersprungeneStufen = [
        ...new Set([...(draft.uebersprungeneStufen ?? []), stage.sectionId]),
      ];
    store(draft);
    return {
      ok: true,
      nextQuestion: naechsteFrage(draft, stage?.sectionId),
    };
  },
  // Der Prüfvermerk auch offline: die Regeln laufen in `shared` und brauchen kein Backend,
  // also darf die Attrappe hier nicht weniger können als der Dienst.
  vermerk: async (id: string) => {
    const alle = get(id).vermerk ?? [];
    const offen = alle.filter((v) => v.status === "offen").length;
    const unbestaetigt = alle.filter((v) => v.status === "beantwortet").length;
    return { eintraege: alle, offen, unbestaetigt,
             vollstaendig: offen === 0 && unbestaetigt === 0 };
  },
  begruenden: async (id: string, eintragId: string, begruendung: string) => {
    const draft = get(id);
    const e = (draft.vermerk ?? []).find((v) => v.id === eintragId);
    if (!e) throw new Error("Eintrag nicht gefunden.");
    e.begruendung = begruendung.trim();
    e.status = "beantwortet";
    store(draft);
    return e;
  },
  // Offline gibt es keinen Vorschlagsdienst, also auch keinen Text. Das wird gesagt statt
  // erfunden — ein Platzhaltertext sähe aus wie eine Richtlinie.
  pruefen: async () => {
    throw new Error(
      "Im Offline-Betrieb kann kein Entwurf geprüft werden: dafür wird der Prüfdienst " +
      "gebraucht.",
    );
  },
  richtlinieErzeugen: async () => {
    throw new Error(
      "Im Offline-Betrieb kann keine Richtlinie erzeugt werden: dafür wird der " +
      "Vorschlagsdienst gebraucht.",
    );
  },
  bestaetigen: async (id: string, eintragId: string) => {
    const draft = get(id);
    const e = (draft.vermerk ?? []).find((v) => v.id === eintragId);
    if (!e) throw new Error("Eintrag nicht gefunden.");
    if (!e.begruendung?.trim())
      throw new Error("Ohne Begründung gibt es nichts zu bestätigen.");
    e.status = "bestaetigt";
    store(draft);
    return e;
  },
  loeschen: async (id: string) => {
    save(load().filter((d) => d.id !== id));
  },
  preview: async (id: string) => {
    const draft = get(id);
    return {
      title: draft.title,
      sections: sections.map((s) => ({
        id: s.id,
        title: s.title,
        paragraphs: s.fields
          .map((f) => ({
            label: f.label,
            value: draft.sections[s.id]?.fields[f.id]?.value,
          }))
          .filter((x) => x.value != null && x.value !== ""),
      })),
    };
  },
};
