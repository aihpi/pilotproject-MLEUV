import { z } from "zod";

export const sectionIds = [
  "0",
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
] as const;
export type SectionId = (typeof sectionIds)[number];
export type DraftStatus = "draft" | "review" | "complete";
/** "unklar": geprüft, aber aus den Angaben nicht bestimmbar — nicht dasselbe wie "empty". */
export type FieldStatus =
  "empty" | "suggested" | "confirmed" | "warning" | "invalid" | "unklar";
/** "musterbaustein": Wert stammt aus einem Textbaustein der Musterrichtlinie. */
export type ValueSource =
  "user-form" | "user-chat" | "ai-extracted" | "rule" | "import" | "musterbaustein";

export const fieldStatuses = [
  "empty", "suggested", "confirmed", "warning", "invalid", "unklar",
] as const;
export const valueSources = [
  "user-form", "user-chat", "ai-extracted", "rule", "import", "musterbaustein",
] as const;

export const fundingProfileSchema = z.object({
  jurisdiction: z.enum(["bund", "land", "mixed"]),
  gak: z.boolean(),
  stateAid: z.boolean(),
  fundingType: z.literal("project"),
});
export type FundingProfile = z.infer<typeof fundingProfileSchema>;

export const fieldValueSchema = z.object({
  value: z
    .union([z.string(), z.number(), z.boolean(), z.array(z.string())])
    .nullable(),
  status: z.enum(fieldStatuses),
  source: z.enum(valueSources),
  confidence: z.number().min(0).max(1).optional(),
  evidence: z.string().optional(),
  confirmedByUser: z.boolean(),
  /**
   * Nummer des Textbausteins der Musterrichtlinie, der den Satzrahmen geliefert hat
   * ("1.1", "5.4.n"). Der Regelfall ist gemischt: Rahmen aus dem Musterbaustein,
   * Inhalt aus der Angabe des Fachreferats — dann steht hier die Nummer und in
   * `source` die inhaltliche Herkunft.
   */
  musterbaustein: z.string().optional(),
  /** Fundstelle in Zitierform, z.B. "VV zu § 44 LHO, Nummer 1.5 (S. 2)". */
  fundstelle: z.string().optional(),
  /** Wortlaut aus der Quelle, gegen sie geprüft. Getrennt von `fundstelle`. */
  belegzitat: z.string().optional(),
  /** Begründung der Formulierung — Doc 12 verlangt sie je Entscheidung. */
  rationale: z.string().optional(),
});
export type FieldValue = z.infer<typeof fieldValueSchema>;

/**
 * Überarbeitungsanforderung an einen Baustein.
 *
 * Die BPMN nennt das "Auswirkungen auf spätere Verfahren": die Wahl fester Beträge in
 * Baustein 5 erzeugt Pflichten in Baustein 7. Eine menschliche Bestätigung wird dabei
 * NICHT zurückgenommen — `confirmedByUser` bleibt stehen. Stattdessen tritt diese
 * Anforderung daneben. Der Unterschied zwischen "du hast nicht entschieden" und "die
 * Umstände haben sich geändert" muss im Verwaltungshandeln sichtbar bleiben.
 */
export const revisionSchema = z.object({
  regel: z.string(),
  rechtsstelle: z.string().optional(),
  grund: z.string(),
  ausgeloestVon: z.enum(sectionIds),
  betroffeneFelder: z.array(z.string()),
  erledigt: z.boolean(),
});
export type Revision = z.infer<typeof revisionSchema>;

export const sectionDataSchema = z.object({
  fields: z.record(fieldValueSchema),
  revisionen: z.array(revisionSchema).optional(),
});
export type SectionData = z.infer<typeof sectionDataSchema>;

export const validationIssueSchema = z.object({
  sectionId: z.enum(sectionIds),
  fieldId: z.string(),
  severity: z.enum(["error", "warning"]),
  message: z.string(),
  /** Kennung der Regel, verweist in die Regeltabelle — z.B. "bagatellgrenze". */
  regel: z.string().optional(),
  /** z.B. "Ziff. 1.5 VV zu § 44 LHO". */
  rechtsstelle: z.string().optional(),
  fundstelle: z.string().optional(),
  belegzitat: z.string().optional(),
  /** Fehlt bei deterministischen Regeln: eine Zahlenprüfung hat keine Unsicherheit. */
  konfidenz: z.number().min(0).max(1).optional(),
});
export type ValidationIssue = z.infer<typeof validationIssueSchema>;

export const validationResultSchema = z.object({
  valid: z.boolean(),
  issues: z.array(validationIssueSchema),
});
export type ValidationResult = z.infer<typeof validationResultSchema>;

/**
 * Eintrag im Prüfvermerk — das zweite Arbeitsergebnis neben der Richtlinie.
 *
 * Doc 12 verlangt je Baustein einen Formulierungsvorschlag UND einen separaten, über die
 * Bausteine mitwachsenden Vermerk. Im Landesrecht ist dessen Adressat das MdFE: sowohl die
 * Abweichung von der Bagatellgrenze (Ziff. 1.5) als auch die Vollfinanzierung (Ziff. 2.4)
 * verlangen eine fachliche Begründung im MdFE-Anschreiben. Die Vorlagen dafür existieren
 * als Anlagen 06 und 08 des RL-Erlasses.
 */
export const vermerkEintragSchema = z.object({
  id: z.string(),
  adressat: z.enum(["pruefvermerk", "mdfe"]),
  sectionId: z.enum(sectionIds),
  regel: z.string(),
  rechtsstelle: z.string().optional(),
  beurteilung: z.string(),
  fundstelle: z.string().optional(),
  belegzitat: z.string().optional(),
  /** Vom Fachreferat eingeholte Begründung — BPMN: "Fachliche Begründung beim Nutzer einholen". */
  begruendung: z.string().optional(),
  status: z.enum(["offen", "beantwortet", "bestaetigt"]),
});
export type VermerkEintrag = z.infer<typeof vermerkEintragSchema>;

export const draftSchema = z.object({
  id: z.string(),
  ownerId: z.string(),
  title: z.string(),
  profile: fundingProfileSchema,
  sections: z.record(sectionDataSchema),
  validation: validationResultSchema,
  /** Wächst über die Bausteine; leer, solange keine Prüfung etwas festgestellt hat. */
  vermerk: z.array(vermerkEintragSchema).optional(),
  status: z.enum(["draft", "review", "complete"]),
  version: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type RichtlinieDraft = z.infer<typeof draftSchema>;

export interface FieldProposal {
  sectionId: SectionId;
  fieldId: string;
  label: string;
  value: string;
  confidence: number;
  evidence: string;
}
export interface ChatExtraction {
  id: string;
  messageId: string;
  proposals: FieldProposal[];
  followUpQuestions: string[];
  conflicts: string[];
}
export interface ChatReply {
  message: string;
  extraction: ChatExtraction;
  progress: number;
}

export type FieldKind =
  "text" | "textarea" | "radio" | "checkbox" | "date" | "number";
export interface FieldDefinition {
  id: string;
  label: string;
  kind: FieldKind;
  required?: boolean;
  help?: string;
  options?: { value: string; label: string }[];
  visible?: (p: FundingProfile, values: Record<string, unknown>) => boolean;
}
export interface SectionDefinition {
  id: SectionId;
  title: string;
  description: string;
  fields: FieldDefinition[];
}

const yesNo = [
  { value: "yes", label: "Ja" },
  { value: "no", label: "Nein" },
];
export const sections: SectionDefinition[] = [
  {
    id: "0",
    title: "Titel und Präambel",
    description: "Benennen und rahmen Sie die Förderrichtlinie.",
    fields: [
      {
        id: "title",
        label: "Titel der Förderrichtlinie",
        kind: "text",
        required: true,
      },
      {
        id: "preamble",
        label: "Präambel",
        kind: "textarea",
        help: "Optionaler gesellschaftlicher und politischer Kontext.",
      },
    ],
  },
  {
    id: "1",
    title: "Förderziel, Zweck und Rechtsgrundlagen",
    description: "Was soll die Förderung bewirken und worauf beruht sie?",
    fields: [
      { id: "goal", label: "Förderziel", kind: "textarea", required: true },
      {
        id: "purpose",
        label: "Zuwendungszweck",
        kind: "textarea",
        required: true,
      },
      {
        id: "legalBasis",
        label: "Rechtsgrundlage",
        kind: "radio",
        required: true,
        options: [
          { value: "lho44", label: "Zuwendung nach § 44 LHO" },
          { value: "lho53", label: "Billigkeitsleistung nach § 53 LHO" },
          { value: "administrative", label: "Verwaltungsvorschriften" },
        ],
      },
      {
        id: "gakBasis",
        label: "GAK-Rahmenplanbereich",
        kind: "text",
        visible: (p) => p.gak,
      },
      {
        id: "stateAidBasis",
        label: "Beihilferechtliche Rechtsgrundlage",
        kind: "textarea",
        help: "Der Beihilfebezug ist unabhängig von der Finanzierungsquelle fachlich zu prüfen.",
      },
    ],
  },
  {
    id: "2",
    title: "Gegenstand der Förderung",
    description: "Welche Maßnahmen werden konkret gefördert?",
    fields: [
      {
        id: "subject",
        label: "Gegenstand der Förderung",
        kind: "textarea",
        required: true,
      },
      {
        id: "successCriteria",
        label: "Kriterien für die Erfolgskontrolle",
        kind: "textarea",
        help: "Diese Kriterien können für die Abstimmung mit dem Finanzministerium benötigt werden.",
      },
      { id: "exclusions", label: "Förderausschlüsse", kind: "textarea" },
    ],
  },
  {
    id: "3",
    title: "Zuwendungsempfänger",
    description: "Wer ist antrags- und zuwendungsberechtigt?",
    fields: [
      {
        id: "recipients",
        label: "Zuwendungsempfänger",
        kind: "checkbox",
        required: true,
        options: [
          { value: "natural", label: "Natürliche Personen" },
          {
            value: "private",
            label: "Juristische Personen des privaten Rechts",
          },
          {
            value: "public",
            label: "Juristische Personen des öffentlichen Rechts",
          },
          { value: "municipal", label: "Kommunen und kommunale Einrichtungen" },
          { value: "sme", label: "Kleine und mittlere Unternehmen" },
          {
            value: "research",
            label: "Hochschulen und Forschungseinrichtungen",
          },
          { value: "other", label: "Weitere Gruppen" },
        ],
      },
      {
        id: "recipientDetails",
        label: "Konkretisierung der Zielgruppe",
        kind: "textarea",
        help: "Beschreiben Sie insbesondere Wirtschaftssektor, Unternehmensgröße und Rechtsnatur. Konkretisieren Sie hier auch die Auswahl „Weitere Gruppen“.",
      },
      {
        id: "recipientExclusions",
        label: "Ausgeschlossene Gruppen",
        kind: "textarea",
      },
      {
        id: "forwarding",
        label: "Weiterleitung an Dritte",
        kind: "radio",
        required: true,
        options: [
          { value: "no", label: "Nicht zulässig" },
          { value: "yes", label: "Zulässig" },
        ],
      },
      {
        id: "forwardingRules",
        label: "Bedingungen der Weiterleitung",
        kind: "textarea",
      },
    ],
  },
  {
    id: "4",
    title: "Zuwendungsvoraussetzungen",
    description:
      "Welche fachlichen, rechtlichen und räumlichen Voraussetzungen gelten?",
    fields: [
      {
        id: "requirements",
        label: "Zuwendungsvoraussetzungen",
        kind: "textarea",
        required: true,
      },
      { id: "area", label: "Gebietskulisse", kind: "text" },
      {
        id: "selectionCriteria",
        label: "Auswahl- und Wertungskriterien",
        kind: "textarea",
      },
      {
        id: "aidRegime",
        label: "Beihilferechtliche Einordnung",
        kind: "checkbox",
        visible: (p) => p.stateAid,
        options: [
          { value: "de-minimis", label: "De-minimis" },
          { value: "agvo", label: "AGVO" },
          { value: "agrar-gvo", label: "AgrarGVO" },
          { value: "notification", label: "Notifizierung" },
        ],
      },
    ],
  },
  {
    id: "5",
    title: "Art, Umfang und Höhe",
    description: "Wie wird die Förderung finanziert und bemessen?",
    fields: [
      {
        id: "financingType",
        label: "Finanzierungsart",
        kind: "radio",
        required: true,
        options: [
          { value: "share", label: "Anteilfinanzierung" },
          { value: "deficit", label: "Fehlbedarfsfinanzierung" },
          { value: "fixed", label: "Festbetragsfinanzierung" },
          { value: "full", label: "Vollfinanzierung" },
        ],
      },
      {
        id: "financingForm",
        label: "Finanzierungsform",
        kind: "radio",
        required: true,
        options: [
          { value: "allocation", label: "Zuweisung" },
          { value: "grant", label: "Zuschuss" },
        ],
      },
      {
        id: "eligibleBasis",
        label: "Bemessungsgrundlage",
        kind: "radio",
        required: true,
        options: [
          { value: "actual", label: "Spitzabrechnung" },
          {
            value: "actual-overhead",
            label: "Spitzabrechnung mit Gemeinkosten",
          },
          { value: "fixed", label: "Feste Beträge" },
          {
            value: "fixed-rest",
            label: "Feste Beträge mit Pauschalfinanzierung der Restkosten",
          },
          {
            value: "fixed-overhead",
            label: "Feste Beträge mit Pauschalfinanzierung der Gemeinkosten",
          },
        ],
      },
      {
        id: "eligibleCosts",
        label: "Zuwendungsfähige Ausgaben oder Kosten",
        kind: "textarea",
        required: true,
        help: "Bei einer GAK-Förderung sollen Angaben aus dem gewählten Förderbereich des Rahmenplans übernommen werden. Prüfen und kennzeichnen Sie Abweichungen.",
      },
      {
        id: "fundingRate",
        label: "Fördersatz in Prozent",
        kind: "number",
        help: "Bei einer GAK-Förderung soll der Fördersatz aus dem Rahmenplan vorbelegt werden. Eine Reduzierung ist als Abweichung zu dokumentieren.",
      },
      { id: "maximum", label: "Höchstbetrag in Euro", kind: "number" },
      {
        id: "ownContribution",
        label: "Eigenanteil erforderlich?",
        kind: "radio",
        options: yesNo,
      },
      { id: "minimum", label: "Bagatellgrenze in Euro", kind: "number" },
      {
        id: "cumulation",
        label: "Kumulierung mit anderen Fördermitteln",
        kind: "radio",
        required: true,
        options: [
          { value: "yes", label: "Zulässig" },
          { value: "no", label: "Nicht zulässig" },
          { value: "rules", label: "Nur unter weiteren Bedingungen" },
        ],
      },
    ],
  },
  {
    id: "6",
    title: "Sonstige Zuwendungsbestimmungen",
    description:
      "Welche Nebenbestimmungen, Prüfrechte und Zweckbindungen gelten?",
    fields: [
      {
        id: "ancillary",
        label: "Allgemeine Nebenbestimmungen",
        kind: "radio",
        required: true,
        options: [
          { value: "anbest-p", label: "ANBest-P" },
          { value: "anbest-g", label: "ANBest-G" },
          { value: "anbest-p-g", label: "ANBest-P und ANBest-G" },
        ],
      },
      {
        id: "otherConditions",
        label: "Weitere fachliche Nebenbestimmungen",
        kind: "textarea",
        help: "Erfassen Sie besondere fachliche Bestimmungen. Prüfrechte und Zweckbindungsfrist werden später anhand der Finanzierungsquelle aus den Mustersätzen ergänzt.",
      },
    ],
  },
  {
    id: "7",
    title: "Verfahren",
    description: "Wie laufen Antrag, Bewilligung, Auszahlung und Nachweis ab?",
    fields: [
      {
        id: "authority",
        label: "Bewilligungsbehörde",
        kind: "text",
        required: true,
      },
      {
        id: "applicationType",
        label: "Verfahrensart",
        kind: "radio",
        required: true,
        options: [
          { value: "one", label: "Einstufig" },
          { value: "two", label: "Zweistufig" },
          { value: "three", label: "Dreistufig" },
        ],
      },
      {
        id: "selection",
        label: "Antragsauswahl",
        kind: "radio",
        options: [
          { value: "first", label: "Windhundprinzip" },
          { value: "criteria", label: "Kriteriengebundene Auswahl" },
        ],
      },
      {
        id: "earlyStart",
        label: "Vorzeitiger Vorhabenbeginn",
        kind: "radio",
        required: true,
        help: "Wählen Sie die einschlägige Variante der Musterrichtlinie.",
        options: [
          { value: "variant-1", label: "Variante 1 gemäß Musterrichtlinie" },
          { value: "variant-2", label: "Variante 2 gemäß Musterrichtlinie" },
        ],
      },
      {
        id: "payment",
        label: "Anforderungs- und Auszahlungsverfahren",
        kind: "radio",
        required: true,
        options: [
          { value: "advance", label: "Vorschussprinzip" },
          { value: "refund", label: "Erstattungsprinzip" },
        ],
      },
    ],
  },
  {
    id: "8",
    title: "Geltungsdauer",
    description: "Wann tritt die Richtlinie in Kraft und außer Kraft?",
    fields: [
      { id: "validFrom", label: "Inkrafttreten", kind: "date", required: true },
      {
        id: "validUntil",
        label: "Außerkrafttreten",
        kind: "date",
        required: true,
      },
    ],
  },
  {
    id: "9",
    title: "Sonstiges und Anhänge",
    description: "Optionale Begriffe, technische Einzelheiten oder Anhänge.",
    fields: [
      { id: "heading", label: "Abschnittsüberschrift", kind: "text" },
      { id: "other", label: "Weitere Inhalte", kind: "textarea" },
    ],
  },
  {
    id: "10",
    title: "Schlussformel",
    description: "Schließen Sie die Richtlinie formal ab.",
    fields: [
      {
        id: "closing",
        label: "Schlussformel, Ort und Datum",
        kind: "textarea",
      },
    ],
  },
];

export interface ChatStage {
  sectionId: SectionId;
  fieldIds: string[];
  question: string;
}

export const chatStages: ChatStage[] = [
  {
    sectionId: "0",
    fieldIds: ["title"],
    question: "Wie soll die Förderrichtlinie heißen?",
  },
  {
    sectionId: "1",
    fieldIds: ["goal", "purpose"],
    question:
      "Welches langfristige Ziel verfolgt die Förderung (Ziel der Förderung) und welchen konkreten Beitrag sollen die Vorhaben (Zuwendungszweck) leisten?",
  },
  {
    sectionId: "2",
    fieldIds: ["subject"],
    question: "Welche Maßnahmen oder Vorhaben sollen konkret gefördert werden?",
  },
  {
    sectionId: "3",
    fieldIds: ["recipientDetails"],
    question:
      "Wer soll die Förderung beantragen können? Bitte beschreiben Sie die Zielgruppen (Zuwendungsempfangende). Berücksichtigen Sie Einschränkungen zum Wirtschaftssektor (z. B. Landwirtschaft, Fischerei oder Forst), zur Größe des Unternehmens (z. B. KMU) und zur Rechtsnatur der Antragstellenden (z. B. natürliche oder juristische Personen).",
  },
  {
    sectionId: "4",
    fieldIds: ["requirements"],
    question:
      "Welche fachlichen, räumlichen oder organisatorischen Voraussetzungen müssen zum Zeitpunkt der Antragstellung erfüllt sein?",
  },
  {
    sectionId: "5",
    fieldIds: ["eligibleCosts"],
    question:
      "Welche Ausgaben oder Kosten sollen förderfähig sein? Die Bemessung erfolgt entweder als Spitzabrechnung oder über feste Beträge.",
  },
];

export function nextChatStage(draft: RichtlinieDraft): ChatStage | null {
  return (
    chatStages.find((stage) =>
      stage.fieldIds.some(
        (fieldId) =>
          !draft.sections[stage.sectionId]?.fields[fieldId]?.confirmedByUser,
      ),
    ) ?? null
  );
}

export function emptySections(): Record<string, SectionData> {
  return Object.fromEntries(sections.map((s) => [s.id, { fields: {} }]));
}
export function fieldVisible(
  field: FieldDefinition,
  profile: FundingProfile,
  values: Record<string, unknown>,
) {
  return field.visible ? field.visible(profile, values) : true;
}
/**
 * Kyrillische und griechische Zwillinge lateinischer Buchstaben.
 *
 * Ein Probelauf gegen das LLM lieferte für `legalBasis` den Wert "lhо44" mit kyrillischem
 * о (U+043E). Optisch nicht von "lho44" zu unterscheiden, gegen die Optionsliste geprüft
 * aber ungültig — und NFKC normalisiert das nicht weg, weil beide Zeichen kanonisch
 * verschieden sind. Auswahlwerte aus KI-Vorschlägen müssen daher hier durchlaufen.
 */
const HOMOGLYPHEN: Record<string, string> = {
  а: "a", е: "e", о: "o", с: "c", р: "p", х: "x", у: "y", і: "i",
  ѕ: "s", ԁ: "d", һ: "h", ν: "v", ο: "o", α: "a", ε: "e", ι: "i",
};

/** Auswahlwert vergleichbar machen: NFKC, Homoglyphen ersetzen, trimmen. */
export function normalisiereAuswahl(wert: unknown): string {
  return String(wert ?? "")
    .normalize("NFKC")
    .replace(/./gu, (z) => HOMOGLYPHEN[z] ?? z)
    .trim();
}

/**
 * Auswahlwert gegen die Optionsliste prüfen. Gibt den kanonischen Wert zurück oder null.
 * Mehrfachauswahl (checkbox) wird elementweise geprüft.
 */
export function pruefeAuswahl(
  field: FieldDefinition,
  wert: unknown,
): { gueltig: boolean; kanonisch: string | string[] | null } {
  if (!field.options?.length) return { gueltig: true, kanonisch: null };
  const erlaubt = new Map(
    field.options.map((o) => [normalisiereAuswahl(o.value), o.value]),
  );
  if (Array.isArray(wert)) {
    const treffer = wert.map((w) => erlaubt.get(normalisiereAuswahl(w)));
    return treffer.every((t) => t !== undefined)
      ? { gueltig: true, kanonisch: treffer as string[] }
      : { gueltig: false, kanonisch: null };
  }
  const treffer = erlaubt.get(normalisiereAuswahl(wert));
  return treffer !== undefined
    ? { gueltig: true, kanonisch: treffer }
    : { gueltig: false, kanonisch: null };
}

export function validateDraft(draft: RichtlinieDraft): ValidationResult {
  const issues: ValidationIssue[] = [];
  for (const section of sections)
    for (const field of section.fields) {
      const values = Object.fromEntries(
        Object.values(draft.sections).flatMap((s) =>
          Object.entries(s.fields).map(([k, v]) => [k, v.value]),
        ),
      );
      if (!fieldVisible(field, draft.profile, values)) continue;
      const value = draft.sections[section.id]?.fields[field.id]?.value;
      const leer =
        value == null || value === "" || (Array.isArray(value) && !value.length);
      if (field.required && leer)
        issues.push({
          sectionId: section.id,
          fieldId: field.id,
          severity: "error",
          message: `„${field.label}“ muss ausgefüllt werden.`,
        });
      // Auswahlfelder gegen ihre Optionsliste prüfen. Betrifft vor allem KI-Vorschläge:
      // ein Mensch klickt eine Option an, ein Modell schreibt sie hin — und kann sich
      // dabei unsichtbar vertippen.
      if (!leer && !pruefeAuswahl(field, value).gueltig)
        issues.push({
          sectionId: section.id,
          fieldId: field.id,
          severity: "error",
          regel: "auswahlwert",
          message:
            `„${field.label}“ enthält einen Wert, der nicht zur Auswahl gehört. ` +
            `Zulässig: ${field.options?.map((o) => o.value).join(", ")}.`,
        });
    }
  if (draft.profile.gak && draft.profile.jurisdiction === "bund")
    issues.push({
      sectionId: "1",
      fieldId: "gakBasis",
      severity: "warning",
      message: "Prüfen Sie den einschlägigen GAK-Rahmenplanbereich.",
    });
  return { valid: !issues.some((i) => i.severity === "error"), issues };
}
