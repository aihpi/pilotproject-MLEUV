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
export type FieldStatus =
  "empty" | "suggested" | "confirmed" | "warning" | "invalid";
export type ValueSource =
  "user-form" | "user-chat" | "ai-extracted" | "rule" | "import";

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
  status: z.enum(["empty", "suggested", "confirmed", "warning", "invalid"]),
  source: z.enum(["user-form", "user-chat", "ai-extracted", "rule", "import"]),
  confidence: z.number().min(0).max(1).optional(),
  evidence: z.string().optional(),
  confirmedByUser: z.boolean(),
});
export type FieldValue = z.infer<typeof fieldValueSchema>;

export const sectionDataSchema = z.object({
  fields: z.record(fieldValueSchema),
});
export type SectionData = z.infer<typeof sectionDataSchema>;
export interface ValidationIssue {
  sectionId: SectionId;
  fieldId: string;
  severity: "error" | "warning";
  message: string;
}
export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
}

export const draftSchema = z.object({
  id: z.string(),
  ownerId: z.string(),
  title: z.string(),
  profile: fundingProfileSchema,
  sections: z.record(sectionDataSchema),
  validation: z.object({
    valid: z.boolean(),
    issues: z.array(
      z.object({
        sectionId: z.enum(sectionIds),
        fieldId: z.string(),
        severity: z.enum(["error", "warning"]),
        message: z.string(),
      }),
    ),
  }),
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
      if (
        field.required &&
        (value == null ||
          value === "" ||
          (Array.isArray(value) && !value.length))
      )
        issues.push({
          sectionId: section.id,
          fieldId: field.id,
          severity: "error",
          message: `„${field.label}“ muss ausgefüllt werden.`,
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
