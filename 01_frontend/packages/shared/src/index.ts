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
  /**
   * "gegenstandslos": die Regel greift nicht mehr, weil der auslösende Wert geändert wurde.
   * Solche Einträge werden NICHT gelöscht. Ein Prüfvermerk ist ein Nachweis darüber, was
   * geprüft wurde — auch eine Feststellung, die sich später erledigt hat, gehört dazu, und
   * eine bereits eingeholte Begründung darf nicht stillschweigend verschwinden.
   */
  status: z.enum(["offen", "beantwortet", "bestaetigt", "gegenstandslos"]),
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
  /**
   * Herkunft des Vorschlags, getrennt nach Rolle — ohne diese Angaben ist ein Vorschlag
   * nicht nachvollziehbar, und Nachvollziehbarkeit ist der Zweck des Werkzeugs.
   *
   * `deckung` ist die Stelle der Nutzereingabe, die den Wert trägt; sie wird zeichengenau
   * gegengeprüft. `belegzitat` mit `fundstelle` weist die Regel nach, nach der formuliert
   * wurde. `musterbaustein` nennt den Satzrahmen aus der Musterrichtlinie.
   */
  deckung?: string;
  belegzitat?: string;
  fundstelle?: string;
  musterbaustein?: string;
  /**
   * Die Fundstelle ist ein VORBILD aus einer früheren Richtlinie, keine Rechtsgrundlage.
   *
   * Gesetzt, wenn die Abfrage von der Sorte „vorschlagen" war — dann sieht die Suche nur
   * frühere Richtlinien und Rahmenpläne, und was sie liefert, ist die bisherige Praxis und
   * keine Vorschrift. Das Prozessmodell trennt beides, und der Unterschied ist
   * haftungsrelevant: eine Anlehnung an eine fremde Richtlinie darf nicht wie eine
   * Rechtsgrundlage aussehen.
   */
  vorbild?: boolean;
  /**
   * Dateiname und Seite der Belegstelle — damit die Fundstelle anklickbar wird.
   *
   * Getrennt von `fundstelle`, weil diese die Zitierform trägt („RL Tierheimförderung,
   * Nummer 4.1 (S. 3)") und daraus kein Dateiname zurückzurechnen ist: sie nennt den
   * Kurznamen aus dem Register, nicht die Datei.
   *
   * Ohne das Öffnen bleibt eine Fundstelle eine Behauptung — nachprüfbar nur für
   * jemanden, der den Datenordner kennt.
   */
  belegdatei?: string;
  belegseite?: number;
}

/**
 * Adresse des Vorschlagsdienstes, der die Quelldokumente ausliefert.
 *
 * Er läuft auf der Maschine der Bearbeiterin; die Dokumente liegen in einem lokalen Ordner
 * und werden bewusst nicht mitgeliefert. Sobald etwas davon über ein Netz erreichbar sein
 * soll, braucht der Endpunkt eine Berechtigungsprüfung — vertrauliche Ordner sind dabei.
 */
export const DOKUMENT_BASIS =
  (typeof process !== "undefined" && process.env?.VORSCHLAG_URL) || "http://127.0.0.1:8000";

/** Verweis auf die Belegstelle, aufgeschlagen an der richtigen Seite. Null ohne Datei. */
export function dokumentLink(p: FieldProposal): string | null {
  if (!p.belegdatei) return null;
  const seite = p.belegseite ? `#page=${p.belegseite}` : "";
  return `${DOKUMENT_BASIS}/dokument/${encodeURIComponent(p.belegdatei)}${seite}`;
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
      // Die Finanzierungsart verzweigt im Prozessmodell sofort: Vollfinanzierung führt zur
      // Frage nach dem wirtschaftlichen Interesse, Festbetragsfinanzierung zur Abfrage des
      // Betrags. Beide Felder stehen deshalb hier und nicht weiter unten bei der Höhe.
      {
        id: "economicInterest",
        label: "Wirtschaftliches Interesse der Zuwendungsempfangenden?",
        kind: "radio",
        required: true,
        help: "Bei wirtschaftlichem Interesse ist eine Vollfinanzierung ausgeschlossen.",
        options: yesNo,
        visible: (_p, v) => v.financingType === "full",
      },
      {
        id: "fixedAmount",
        label: "Festbetrag in Euro",
        kind: "number",
        required: true,
        help: "Der feste Zuschussbetrag, unabhängig von den förderfähigen Gesamtkosten.",
        visible: (_p, v) => v.financingType === "fixed",
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
      // Das Prozessmodell zählt für Baustein 6 auf: Prüfberechtigung, Zweckbindungsfristen,
      // Inventarisierungspflicht, Geschlechtergleichstellung (optional), Vorgaben aus dem
      // Beihilferecht und fachspezifische Bestimmungen der Fachreferate. Die ersten vier
      // stehen als eigene Felder, weil sie eine feste Form haben; der Rest bleibt Freitext.
      {
        id: "auditRights",
        label: "Prüfberechtigte Stellen",
        kind: "checkbox",
        required: true,
        help: "Im Landesrecht sind es der Landesrechnungshof und das zuständige Ministerium.",
        options: [
          { value: "lrh", label: "Landesrechnungshof Brandenburg" },
          { value: "ministry", label: "Zuständiges Ministerium" },
          { value: "brh", label: "Bundesrechnungshof" },
          { value: "bwb", label: "Bundesbeauftragte für Wirtschaftlichkeit in der Verwaltung" },
        ],
      },
      {
        id: "purposeBindingYears",
        label: "Zweckbindungsfrist in Jahren",
        kind: "number",
        help: "Dauer, für die der geförderte Gegenstand zweckentsprechend zu nutzen ist.",
      },
      {
        id: "inventory",
        label: "Inventarisierungspflicht",
        kind: "radio",
        options: yesNo,
      },
      {
        id: "genderEquality",
        label: "Bestimmung zur Geschlechtergleichstellung",
        kind: "radio",
        help: "Optional.",
        options: yesNo,
      },
      {
        id: "otherConditions",
        label: "Weitere fachliche Nebenbestimmungen",
        kind: "textarea",
        help: "Fachspezifische Bestimmungen der Fachreferate sowie Vorgaben aus dem Beihilferecht.",
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
      // Ziffer 7.1. Das Prozessmodell nennt vier Fallgruppen, aufgespannt aus zwei
      // Unterscheidungen: analog oder digital, mit oder ohne Antragsfrist. Sie stehen hier
      // als vier Auswahlwerte und nicht als zwei Felder, weil das Modell sie so führt und
      // weil je Fallgruppe ein eigener Mustersatz einzutragen ist.
      {
        id: "applicationProcedure",
        label: "Antragsverfahren",
        kind: "radio",
        required: true,
        options: [
          { value: "analog", label: "Schriftlich, ohne Frist" },
          { value: "analog-deadline", label: "Schriftlich, mit Antragsfrist" },
          { value: "digital", label: "Digitales Antragssystem, ohne Frist" },
          {
            value: "digital-deadline",
            label: "Digitales Antragssystem, mit Antragsfrist",
          },
        ],
      },
      {
        id: "applicationDeadline",
        label: "Antragsfrist",
        kind: "date",
        required: true,
        help: "Posteingang beziehungsweise Eingang im Antragssystem.",
        visible: (_p, v) =>
          typeof v.applicationProcedure === "string" &&
          v.applicationProcedure.endsWith("-deadline"),
      },
      {
        id: "payment",
        label: "Anforderungs- und Auszahlungsverfahren",
        kind: "radio",
        required: true,
        help: "Die Wahl wirkt auf das Verwendungsnachweisverfahren nach Ziffer 7.4 durch.",
        options: [
          { value: "advance", label: "Vorschussprinzip" },
          { value: "refund", label: "Erstattungsprinzip" },
        ],
      },
      {
        id: "applicationType",
        label: "Verfahrensart",
        kind: "radio",
        required: true,
        options: [
          { value: "one", label: "Einstufig" },
          { value: "two", label: "Zweistufig (Antrag, Verwendungsnachweis inklusive Auszahlung)" },
          { value: "three", label: "Dreistufig (Antrag, Auszahlung, Verwendungsnachweis)" },
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
  /**
   * Bedingung für die Übersprünge, die das Prozessmodell ausdrücklich benennt — etwa
   * „Wenn RGL Landesrecht, dann gehe direkt weiter".
   *
   * Muss deterministisch sein und nur bestätigte Werte lesen; siehe `stufeGilt`. Ohne
   * Angabe gilt die Stufe immer, soweit eines ihrer Felder sichtbar ist.
   */
  gilt?: (draft: RichtlinieDraft) => boolean;
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
    // Die Bemessungsgrundlage gehört in den Chat und nicht ins Formular: das Prozessmodell
    // führt dafür eine eigene Aufgabe „Eingabe über Chat-Interface", weil die Entscheidung
    // „sehr individuell ist und von verschiedenen Faktoren abhängt". Die Frage nannte sie
    // schon, erhoben wurde sie bisher nur per Klick.
    fieldIds: ["eligibleCosts", "eligibleBasis"],
    question:
      "Welche Ausgaben oder Kosten sollen förderfähig sein, und wie sollen sie bemessen werden — als Spitzabrechnung der tatsächlichen Kosten oder über feste Beträge?",
  },
];

/**
 * Die bestätigten Feldwerte des Entwurfs, über alle Bausteine hinweg.
 *
 * Nur bestätigte: an diesen Werten hängen die Verzweigungen, und eine unbestätigte
 * Vermutung des Modells darf keinen Pfad festlegen. Der Unterschied ist wichtiger, als er
 * aussieht — ein still übersprungener Schritt ist ein Fehler, den niemand sieht.
 */
function bestaetigteWerte(draft: RichtlinieDraft): Record<string, unknown> {
  const werte: Record<string, unknown> = {};
  for (const abschnitt of Object.values(draft.sections))
    for (const [id, feld] of Object.entries(abschnitt.fields))
      if (feld.confirmedByUser) werte[id] = feld.value;
  return werte;
}

/**
 * Gilt diese Chat-Stufe im gegenwärtigen Pfad?
 *
 * Zwei Gründe, sie zu überspringen:
 *
 * 1. Eine ausdrückliche Bedingung an der Stufe (`gilt`) — für die Übersprünge, die das
 *    Prozessmodell benennt und die sich nicht aus der Sichtbarkeit eines Feldes ergeben.
 * 2. Keines ihrer Zielfelder ist im gegenwärtigen Pfad sichtbar. Das braucht keine zweite
 *    Pflege: die `visible`-Bedingungen der Felder tragen die Verzweigungen des Modells
 *    bereits, und das Gespräch soll nichts erfragen, was das Formular ausblendet.
 *
 * Deterministisch, ohne Modellaufruf. Was das Modell beigesteuert hat, ist der Feldwert —
 * und der ist an dieser Stelle bereits von einem Menschen bestätigt.
 */
export function stufeGilt(stage: ChatStage, draft: RichtlinieDraft): boolean {
  if (stage.gilt && !stage.gilt(draft)) return false;
  const werte = bestaetigteWerte(draft);
  const felder = (sections.find((s) => s.id === stage.sectionId)?.fields ?? [])
    .filter((f) => stage.fieldIds.includes(f.id));
  // Kennt die Stufe ein Feld, das es in der Abschnittsdefinition nicht gibt, wird nicht
  // übersprungen — lieber einmal zu viel fragen als eine Angabe verlieren.
  if (felder.length !== stage.fieldIds.length) return true;
  return felder.some((f) => fieldVisible(f, draft.profile, werte));
}

export function nextChatStage(draft: RichtlinieDraft): ChatStage | null {
  return (
    chatStages.find(
      (stage) =>
        stufeGilt(stage, draft) &&
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
/**
 * Felder, für die das Prozessmodell einen KI-Vorschlag aus früheren Richtlinien vorsieht.
 *
 * Das Modell führt dafür eigene Aufgaben — „KI-Vorschlag für Voraussetzungen aus bisherigen
 * Eingaben", „KI-Vorschlag für Fachliche Ausschlüsse", „KI-Vorschlag zu fachlichen
 * Zuwendungsbestimmungen" — und schreibt jeder von ihnen denselben Korpusausschnitt vor:
 * „Nur alte RL des Landes/GAK als Hilfestellung (auch bei nicht GAK-RL)".
 *
 * Der Grund steht als Beispiel daneben: „Bspw. Tierheime RL enthält ähnliche
 * Voraussetzungen für neue Streichelzoo RL". Hier wird nicht aus einer Vorschrift
 * übernommen, sondern nach dem Vorbild eines früheren Verfahrens entworfen — und was dabei
 * herauskommt, ist ein Entwurf zur Bestätigung und keine Rechtsgrundlage.
 */
export const VORSCHLAGSFELDER = [
  "requirements", "exclusions", "otherConditions",
  // Bemessungsgrundlage und förderfähige Kosten. Das Modell führt dafür eine eigene
  // Aufgabe „Eingabe über Chat-Interface" mit der Begründung, die Bemessungsgrundlage sei
  // „sehr individuell" und brauche „Vorschläge aus alten Förderverfahren".
  //
  // Warum das hier und nicht irgendwo stehen muss: die VV zu § 44 LHO sagt, was zulässig
  // ist — Spitzabrechnung ODER feste Beträge, beides. Die Frage der Bearbeiterin ist aber,
  // was sie nehmen soll, und die beantwortet die Norm nicht. Kommt sie trotzdem als Beleg
  // zurück, sieht eine freie Auswahlentscheidung aus wie eine gebundene.
  "eligibleBasis", "eligibleCosts",
];

/** Die Abfragesorte für eine Menge von Zielfeldern, oder keine. */
export function abfrageartFuer(fieldIds: string[]): "vorschlagen" | undefined {
  return fieldIds.some((id) => VORSCHLAGSFELDER.includes(id)) ? "vorschlagen" : undefined;
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
  // Über pruefeFachlich, nicht über die einzelne Baustein-Funktion: sonst hängt jeder neue
  // Baustein nur dann in der Validierung, wenn man daran denkt, ihn hier nachzutragen.
  issues.push(...pruefeFachlich(draft).map((b) => b.befund));
  return { valid: !issues.some((i) => i.severity === "error"), issues };
}

// ---------------------------------------------------------------------------------------
// Fachliche Prüflogik, Baustein 5 (Art, Umfang und Höhe)
// ---------------------------------------------------------------------------------------

/** Ein Prüfergebnis: der Befund fürs Formular, dazu was er auslöst. */
export interface Pruefergebnis {
  befund: ValidationIssue;
  /** Eintrag für Prüfvermerk oder MdFE-Anschreiben, falls die Regel einen verlangt. */
  vermerk?: Omit<VermerkEintrag, "id">;
  /** Überarbeitung eines ANDEREN Bausteins, falls die Entscheidung dorthin ausstrahlt. */
  revision?: { sectionId: SectionId; eintrag: Revision };
}

/** Bagatellgrenze nach Ziff. 1.5 VV zu § 44 LHO, außergemeindlicher Bereich. */
export const BAGATELLGRENZE_EUR = 2500;
/**
 * Bagatellgrenze im gemeindlichen Bereich.
 *
 * Im gemeindlichen Bereich gilt nicht die VV, sondern die VVG, und dort liegt die Grenze
 * bei 5.000 Euro statt bei 2.500 (VVG Nr. 1.1 zu § 44 LHO).
 *
 * Kein Widerspruch zum Prozessmodell: die 2.500 stehen in der VV, die 5.000 dort, wo die
 * VVG greift — bei kommunalen Zuwendungsempfangenden. Ohne diese Unterscheidung gibt es
 * einen falschen Freispruch: 3.000 Euro bei kommunalen Empfangenden blieben unbeanstandet,
 * obwohl die einschlägige Grenze unterschritten ist.
 */
export const BAGATELLGRENZE_GEMEINDLICH_EUR = 5000;
/** Ab diesem Fördersatz brauchen Kommunen die Zustimmung des MdFE. */
export const KOMMUNAL_HOECHSTSATZ_PROZENT = 80;
/** Vereinfachte Kostenoptionen nach Art. 83 GAP-SP-VO — nur für ELER, nicht im Landesbereich. */
export const VKO_BEMESSUNGEN = ["fixed-rest", "fixed-overhead"];

/**
 * Prüfungen zu Baustein 5, reines Landesrecht.
 *
 * Deterministisch und ohne Modell: jede Regel hat einen festen Schwellenwert und eine
 * Rechtsstelle. Deshalb steht sie hier und nicht hinter der KI-Naht — was man ausrechnen
 * kann, soll man nicht schätzen lassen.
 *
 * Zwei Regeln erzeugen mehr als einen Hinweis: sie verlangen eine Begründung fürs
 * MdFE-Anschreiben (Prüfvermerk) oder machen einen anderen Baustein wieder auf (Revision).
 * Das ist die Rückkopplung, die das Prozessmodell „Auswirkungen auf spätere Verfahren" nennt.
 */
export function pruefeBaustein5(draft: RichtlinieDraft): Pruefergebnis[] {
  const raus: Pruefergebnis[] = [];
  const feld = (id: string) => draft.sections["5"]?.fields[id]?.value;
  const zahl = (id: string) => {
    const v = feld(id);
    return typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : null;
  };
  /** Eine Zahl ist angegeben — nicht leer, nicht unlesbar, nicht null. */
  const hat = (v: number | null) => v !== null && !Number.isNaN(v) && v > 0;

  // 1 — Bagatellgrenze. Eine Unterschreitung ist zulässig, aber begründungspflichtig.
  //
  //     Welche Grenze gilt, hängt am Empfängerkreis in Baustein 3. Sind Kommunen dabei,
  //     gilt die höhere — auch im gemischten Fall, denn dann ist sie für einen Teil der
  //     Empfangenden einschlägig. Die strengere Grenze zu nehmen erzeugt im Zweifel eine
  //     Warnung statt Schweigen, und das ist hier die richtige Richtung.
  const empfaengerliste = draft.sections["3"]?.fields["recipients"]?.value;
  const kommunal = Array.isArray(empfaengerliste) && empfaengerliste.includes("municipal");
  const grenze = kommunal ? BAGATELLGRENZE_GEMEINDLICH_EUR : BAGATELLGRENZE_EUR;
  const grenzstelle = kommunal
    ? "VVG Nr. 1.1 zu § 44 LHO"
    : "Ziff. 1.5 VV zu § 44 LHO";
  const bereich = kommunal ? "gemeindlichen" : "außergemeindlichen";

  const bagatelle = zahl("minimum");
  if (bagatelle !== null && !Number.isNaN(bagatelle) && bagatelle < grenze)
    raus.push({
      befund: {
        sectionId: "5", fieldId: "minimum", severity: "warning",
        regel: "bagatellgrenze", rechtsstelle: grenzstelle,
        message:
          `Die Bagatellgrenze liegt mit ${bagatelle} Euro unter ${grenze} Euro — der Grenze ` +
          `für den ${bereich} Bereich. Das ist zulässig, die Abweichung ist aber im ` +
          `MdFE-Anschreiben zu begründen.`,
      },
      vermerk: {
        adressat: "mdfe", sectionId: "5", regel: "bagatellgrenze",
        rechtsstelle: grenzstelle,
        beurteilung:
          `Bagatellgrenze ${bagatelle} Euro, abweichend von ${grenze} Euro ` +
          `(${bereich} Bereich).`,
        status: "offen",
      },
    });

  // 1b — Fehlbedarfsfinanzierung ohne Höchstbetrag. Ziff. 2.2.2 lässt hier keinen Spielraum:
  //      „Die Zuwendung ist bei der Bewilligung auf einen Höchstbetrag zu begrenzen." Im
  //      Prozessmodell ist die Abfrage des Höchstbetrags ein eigener Schritt, der auf die
  //      Wahl dieser Finanzierungsart unmittelbar folgt.
  //
  //      Fehler, nicht Warnung: ohne Deckel ist die Fehlbedarfsfinanzierung ein offener
  //      Anspruch gegen den Haushalt.
  if (feld("financingType") === "deficit" && !hat(zahl("maximum")))
    raus.push({
      befund: {
        sectionId: "5", fieldId: "maximum", severity: "error",
        regel: "fehlbedarf_ohne_hoechstbetrag",
        rechtsstelle: "Ziff. 2.2.2 der VV zu § 44 LHO",
        message:
          "Bei einer Fehlbedarfsfinanzierung ist die Zuwendung auf einen Höchstbetrag zu " +
          "begrenzen. Tragen Sie einen Höchstbetrag ein.",
      },
    });

  // 1c — Vollfinanzierung bei wirtschaftlichem Interesse. Das Prozessmodell verzweigt an
  //      dieser Stelle aus der Vollfinanzierung heraus („Andere Finanzierungsart wählen") —
  //      es wird also gar nicht erst begründet, sondern umgewählt.
  const wirtschaftlich = feld("economicInterest") === "yes";
  if (feld("financingType") === "full" && wirtschaftlich)
    raus.push({
      befund: {
        sectionId: "5", fieldId: "financingType", severity: "error",
        regel: "vollfinanzierung_wirtschaftliches_interesse",
        rechtsstelle: "Ziff. 2.4 und 2.5 der VV zu § 44 LHO",
        message:
          "Vollfinanzierung ist ausgeschlossen, wenn die Zuwendungsempfangenden ein " +
          "wirtschaftliches Interesse an der Maßnahme haben. Wählen Sie eine andere " +
          "Finanzierungsart.",
      },
    });

  // 2 — Vollfinanzierung. Nur zulässig, wenn der Zweck anders nicht erreichbar ist.
  //
  //     Nur, solange kein wirtschaftliches Interesse vorliegt: dann führt das Modell aus der
  //     Vollfinanzierung heraus, und eine Begründung fürs MdFE einzuholen wäre verfehlt —
  //     zu begründen ist nichts, zu ändern ist die Finanzierungsart.
  if (feld("financingType") === "full" && !wirtschaftlich)
    raus.push({
      befund: {
        sectionId: "5", fieldId: "financingType", severity: "warning",
        regel: "vollfinanzierung", rechtsstelle: "Ziff. 2.4 und 2.5 VV zu § 44 LHO",
        message:
          "Vollfinanzierung kommt nur in Betracht, wenn der Zweck nur bei Übernahme " +
          "sämtlicher zuwendungsfähiger Ausgaben erreichbar ist. Sie ist ausgeschlossen, " +
          "wenn die Zuwendungsempfangenden ein wirtschaftliches Interesse haben. Die " +
          "fachliche Begründung ist im MdFE-Anschreiben aufzunehmen.",
      },
      vermerk: {
        adressat: "mdfe", sectionId: "5", regel: "vollfinanzierung",
        rechtsstelle: "Ziff. 2.4 VV zu § 44 LHO",
        beurteilung: "Vollfinanzierung gewählt; Begründung gegenüber dem MdFE erforderlich.",
        status: "offen",
      },
    });

  // 2b — Angaben zur Höhe. Die Musterrichtlinie sieht zwei Größen vor, beide wählbar: eine
  //      Quote („bis zu XX % der zuwendungsfähigen Kosten") und einen Deckel („höchstens xxx
  //      Euro"). Pflicht ist im Landesrecht keine von beiden — wo Höchstbeträge zwingend
  //      sind, kommt das aus dem EU-Beihilferecht und liegt außerhalb des Piloten.
  //
  //      Fehlen aber BEIDE, steht zur Höhe überhaupt nichts, und weder Antragstellende noch
  //      Bewilligungsbehörde wissen, woran sie sind. Das ist etwas anderes, als bewusst nur
  //      eine der beiden Größen zu setzen.
  const quote = zahl("fundingRate");
  const deckel = zahl("maximum");
  if (!hat(quote) && !hat(deckel))
    raus.push({
      befund: {
        sectionId: "5", fieldId: "fundingRate", severity: "warning",
        regel: "hoehe_unbestimmt", rechtsstelle: "Ziff. 5.5 der Musterrichtlinie",
        message:
          "Zur Höhe der Zuwendung ist nichts angegeben — weder ein Fördersatz noch ein " +
          "Höchstbetrag. Üblich ist mindestens eine der beiden Größen.",
      },
    });

  // 2c — Widerspruch in der Richtlinie selbst: liegt die Bagatellgrenze über dem
  //      Höchstbetrag, ist kein Vorhaben förderfähig. Anträge unterhalb der Bagatellgrenze
  //      sind zu klein, oberhalb des Höchstbetrags gibt es nichts mehr — dazwischen bleibt
  //      nichts. Ein Handwerksfehler, der beim Korrekturlesen leicht durchrutscht.
  if (hat(deckel) && bagatelle !== null && !Number.isNaN(bagatelle) && bagatelle > deckel!)
    raus.push({
      befund: {
        sectionId: "5", fieldId: "maximum", severity: "error",
        regel: "grenzen_widerspruch",
        message:
          `Die Bagatellgrenze (${bagatelle} Euro) liegt über dem Höchstbetrag ` +
          `(${deckel} Euro). Damit wäre kein Vorhaben förderfähig.`,
      },
    });

  // 2d — Ein Fördersatz über 100 Prozent ist keine Entscheidung, sondern ein Vertipper.
  if (quote !== null && !Number.isNaN(quote) && quote > 100)
    raus.push({
      befund: {
        sectionId: "5", fieldId: "fundingRate", severity: "error",
        regel: "foerdersatz_ueber_hundert",
        message: `Ein Fördersatz von ${quote} Prozent ist nicht möglich.`,
      },
    });

  // 3 — Erhöhter Fördersatz für Kommunen. Aus der Erläuterung der VB ELER zur
  //     Musterrichtlinie: über 80 Prozent ist die Zustimmung des MdFE nötig.
  const satz = zahl("fundingRate");
  if (satz !== null && !Number.isNaN(satz) && satz > KOMMUNAL_HOECHSTSATZ_PROZENT && kommunal)
    raus.push({
      befund: {
        sectionId: "5", fieldId: "fundingRate", severity: "warning",
        regel: "kommunaler_hoechstsatz",
        message:
          `Fördersatz ${satz} Prozent bei kommunalen Zuwendungsempfangenden. Über ` +
          `${KOMMUNAL_HOECHSTSATZ_PROZENT} Prozent ist die Zustimmung des MdFE erforderlich.`,
      },
      vermerk: {
        adressat: "mdfe", sectionId: "5", regel: "kommunaler_hoechstsatz",
        beurteilung: `Fördersatz ${satz} Prozent für Kommunen.`,
        status: "offen",
      },
    });

  // 4 — Vereinfachte Kostenoptionen. Im Landesbereich gibt es sie nicht; sie gehören zu
  //     ELER-Vorhaben. Ein harter Fehler, keine Warnung.
  const bemessung = feld("eligibleBasis");
  if (typeof bemessung === "string" && VKO_BEMESSUNGEN.includes(bemessung) && !draft.profile.gak)
    raus.push({
      befund: {
        sectionId: "5", fieldId: "eligibleBasis", severity: "error",
        regel: "vko_nicht_im_land", rechtsstelle: "Art. 83 Abs. 1 GAP-SP-VO",
        message:
          "Vereinfachte Kostenoptionen sind im Landesbereich nicht möglich. Wählen Sie " +
          "Spitzabrechnung oder feste Beträge.",
      },
    });

  // 5 — Feste Beträge strahlen auf Baustein 7 aus. Das Prozessmodell nennt es
  //     „Auswirkungen auf spätere Verfahren": mit der Wahl sollen Erleichterungen bei
  //     Antrag, Prüfung und Verwendungsnachweis festgelegt werden.
  if (typeof bemessung === "string" && bemessung.startsWith("fixed"))
    raus.push({
      befund: {
        sectionId: "5", fieldId: "eligibleBasis", severity: "warning",
        regel: "feste_betraege_folgen", rechtsstelle: "Ziff. 2.3 und 2.3.1 VV zu § 44 LHO",
        message:
          "Feste Beträge gewählt: Die Herleitung der Kalkulation muss nachvollziehbar sein, " +
          "und im Verfahren sind Erleichterungen bei Antragstellung, Prüfung und " +
          "Verwendungsnachweis festzulegen.",
      },
      revision: {
        sectionId: "7",
        eintrag: {
          regel: "feste_betraege_folgen",
          rechtsstelle: "Ziff. 2.3 VV zu § 44 LHO",
          grund:
            "In Baustein 5 wurden feste Beträge gewählt. Antrags-, Prüf- und " +
            "Verwendungsnachweisverfahren sind auf Erleichterungen hin anzupassen.",
          ausgeloestVon: "5",
          betroffeneFelder: ["applicationType", "payment"],
          erledigt: false,
        },
      },
    });

  return raus;
}

// ---------------------------------------------------------------------------------------
// Fachliche Prüflogik, Baustein 6 (Sonstige Zuwendungsbestimmungen)
// ---------------------------------------------------------------------------------------

/** Prüforgane, die das Prozessmodell für das Landesrecht nennt: „LHO: LRH + Min". */
export const PRUEFORGANE_LAND = ["lrh", "ministry"];

/**
 * Prüfungen zu Baustein 6.
 *
 * Der Baustein ist im Modell fast ausschließlich Eintragung — Prüfrechte, Zweckbindung und
 * Inventarisierung sind Mustersätze, die übernommen werden. Geprüft wird die eine Stelle,
 * an der das Modell einen festen Inhalt nennt: „Prüforgan: LHO: LRH + Min".
 */
export function pruefeBaustein6(draft: RichtlinieDraft): Pruefergebnis[] {
  const stellen = draft.sections["6"]?.fields["auditRights"]?.value;
  if (!Array.isArray(stellen) || !stellen.length) return [];

  const fehlend = PRUEFORGANE_LAND.filter((s) => !stellen.includes(s));
  if (!fehlend.length) return [];

  const namen = fehlend
    .map((s) => (s === "lrh" ? "der Landesrechnungshof" : "das zuständige Ministerium"))
    .join(" und ");
  return [{
    befund: {
      sectionId: "6", fieldId: "auditRights", severity: "warning",
      regel: "pruefrechte_unvollstaendig",
      message:
        `Im Landesrecht sind der Landesrechnungshof und das zuständige Ministerium ` +
        `prüfberechtigt. Nicht angegeben ist ${namen}.`,
    },
  }];
}

// ---------------------------------------------------------------------------------------
// Fachliche Prüflogik, Baustein 7 (Verfahren)
// ---------------------------------------------------------------------------------------

/**
 * Prüfungen zu Baustein 7.
 *
 * Der Baustein ist im Prozessmodell eine Kette: Bewilligungsbehörde, Antragsauswahl,
 * vorzeitiger Vorhabenbeginn, Antragsverfahren (7.1), Auszahlungsverfahren (7.3),
 * Verwendungsnachweis (7.4). Das meiste daran ist Eintragung und keine Prüfung — welcher
 * Mustersatz einzutragen ist, ergibt sich aus der Auswahl und wird nicht geprüft.
 *
 * Geprüft wird nur, wo zwei Angaben einander widersprechen können. Das ist hier genau eine
 * Stelle, und sie fällt zwischen zwei Felder: sie gehört weder zum Antragsverfahren noch
 * zum Auszahlungsverfahren allein, und deshalb fällt sie beim Ausfüllen nicht auf.
 */
export function pruefeBaustein7(draft: RichtlinieDraft): Pruefergebnis[] {
  const raus: Pruefergebnis[] = [];
  const feld = (id: string) => draft.sections["7"]?.fields[id]?.value;

  // Digitale Antragstellung ist derzeit nur für Programme im Erstattungsverfahren
  // umgesetzt. Die Programmierung im nationalen Bereich erfolgt nach und nach, das
  // Vorschussprinzip ist dort noch nicht abgebildet.
  //
  // Fehler und nicht Warnung: anders als eine Bagatellgrenze unter 2.500 Euro lässt sich
  // das nicht begründen. Das Verfahren gibt es nicht, also kann die Richtlinie es nicht
  // vorsehen.
  const verfahren = feld("applicationProcedure");
  const digital = typeof verfahren === "string" && verfahren.startsWith("digital");
  if (digital && feld("payment") === "advance")
    raus.push({
      befund: {
        sectionId: "7", fieldId: "payment", severity: "error",
        regel: "digital_nur_erstattung",
        message:
          "Digitale Antragstellung ist derzeit nur für Programme im Erstattungsverfahren " +
          "möglich. Wählen Sie entweder das Erstattungsprinzip oder ein schriftliches " +
          "Antragsverfahren.",
      },
    });

  // Kriteriengebundene Auswahl ohne Kriterien. Ziffer 7.2 verlangt im Mustersatz die
  // Grundlage für die Auswahlentscheidung; ohne sie bleibt dort eine Lücke.
  //
  // Warnung und nicht Fehler, weil das Prozessmodell die Kriterien an dieser Stelle
  // ausdrücklich als optional führt — sie können auch später nachgereicht werden.
  //
  // Geprüft wird gegen das vorhandene Feld in Baustein 4 und nicht gegen ein zweites in
  // Baustein 7: dieselben Kriterien zweimal erfassen zu lassen, hieße sie auseinanderlaufen
  // zu lassen.
  const kriterien = draft.sections["4"]?.fields["selectionCriteria"]?.value;
  const leer =
    kriterien == null || (typeof kriterien === "string" && kriterien.trim() === "");
  if (feld("selection") === "criteria" && leer)
    raus.push({
      befund: {
        sectionId: "7", fieldId: "selection", severity: "warning",
        regel: "auswahlkriterien_fehlen",
        message:
          "Kriteriengebundene Auswahl gewählt, aber in Baustein 4 sind keine Auswahl- und " +
          "Wertungskriterien angegeben. Sie sind die Grundlage der Auswahlentscheidung " +
          "nach Ziffer 7.2.",
      },
    });

  return raus;
}

/** Höchstdauer einer Landesrichtlinie in Jahren. GAK darf vier, liegt aber außerhalb. */
export const GELTUNGSDAUER_JAHRE = 3;

/**
 * Prüfungen zu Baustein 8 (Geltungsdauer).
 *
 * Nach Anlage 19 zu VV Nr. 14.2.1 zu § 44 LHO soll die Geltungsdauer drei Jahre nicht
 * überschreiten. „Soll" heißt: zulässig mit Begründung, deshalb Warnung und nicht Fehler.
 */
export function pruefeBaustein8(draft: RichtlinieDraft): Pruefergebnis[] {
  const feld = (id: string) => draft.sections["8"]?.fields[id]?.value;
  const von = typeof feld("validFrom") === "string" ? new Date(String(feld("validFrom"))) : null;
  const bis = typeof feld("validUntil") === "string" ? new Date(String(feld("validUntil"))) : null;
  if (!von || !bis || Number.isNaN(von.valueOf()) || Number.isNaN(bis.valueOf())) return [];

  if (bis <= von)
    return [{
      befund: {
        sectionId: "8", fieldId: "validUntil", severity: "error",
        regel: "geltungsdauer_reihenfolge",
        message: "Das Außerkrafttreten liegt nicht nach dem Inkrafttreten.",
      },
    }];

  // Über Kalenderjahre statt über Tage: „drei Jahre" meint den Tag drei Jahre später, nicht
  // 1095 Tage — bei einem Schaltjahr wäre die Rechnung sonst um einen Tag daneben.
  const grenze = new Date(von);
  grenze.setFullYear(grenze.getFullYear() + GELTUNGSDAUER_JAHRE);
  if (bis <= grenze) return [];

  const jahre = ((bis.valueOf() - von.valueOf()) / (365.2425 * 24 * 3600 * 1000)).toFixed(1);
  return [{
    befund: {
      sectionId: "8", fieldId: "validUntil", severity: "warning",
      regel: "geltungsdauer", rechtsstelle: "Anlage 19 zu VV Nr. 14.2.1 zu § 44 LHO",
      message:
        `Die Geltungsdauer beträgt rund ${jahre} Jahre. Sie soll ${GELTUNGSDAUER_JAHRE} ` +
        `Jahre nicht überschreiten; eine längere Laufzeit ist zu begründen.`,
    },
    vermerk: {
      adressat: "pruefvermerk", sectionId: "8", regel: "geltungsdauer",
      rechtsstelle: "Anlage 19 zu VV Nr. 14.2.1 zu § 44 LHO",
      beurteilung: `Geltungsdauer rund ${jahre} Jahre, Regelgrenze ${GELTUNGSDAUER_JAHRE} Jahre.`,
      status: "offen",
    },
  }];
}

/**
 * Form der Zuwendung gegen die Rechtsgrundlage.
 *
 * Das Prozessmodell koppelt beides fest: „Zuschuss — Herkunft der Förderung ist dann § 44/53
 * LHO. Zuweisung — Herkunft der Förderung ist eine Verwaltungsvorschrift."
 *
 * Diese Prüfung steht bewusst VOR der Bindung an § 44 LHO und läuft immer. Sie stammt nicht
 * aus der VV, sondern aus dem Aufbau des Zuwendungsrechts selbst — und gerade der Fall
 * „Zuweisung, aber § 44 als Rechtsgrundlage" wäre sonst nie zu sehen.
 */
export function pruefeZuwendungsform(draft: RichtlinieDraft): Pruefergebnis[] {
  const form = draft.sections["5"]?.fields["financingForm"]?.value;
  const rgl = draft.sections["1"]?.fields["legalBasis"]?.value;
  if (typeof form !== "string" || typeof rgl !== "string" || !form || !rgl) return [];

  const passt =
    form === "grant" ? rgl === "lho44" || rgl === "lho53" : rgl === "administrative";
  if (passt) return [];

  const erwartet =
    form === "grant"
      ? "ein Zuschuss beruht auf § 44 oder § 53 LHO"
      : "eine Zuweisung beruht auf einer Verwaltungsvorschrift";
  return [{
    befund: {
      sectionId: "5", fieldId: "financingForm", severity: "error",
      regel: "form_passt_nicht_zur_rechtsgrundlage",
      message:
        `Die Finanzierungsform passt nicht zur Rechtsgrundlage in Baustein 1 — ${erwartet}. ` +
        `Ändern Sie eines von beidem.`,
    },
  }];
}

/**
 * Empfängerkreis: VV zu § 44 LHO oder VVG?
 *
 * Im Prozessmodell steht diese Prüfung VOR Baustein 5 und entscheidet, ob die Prüfkette
 * überhaupt betreten wird. Drei Ergebnisse sind dort benannt:
 *
 * 1. VV ist anzuwenden, wenn die Empfänger keine Kommunen sind → weiter zu Baustein 5.
 * 2. VVG ist anzuwenden, wenn die Empfänger Kommunen sind → „Option ist nicht scope des
 *    Projektes".
 * 3. Beides zugleich — im Modell beschrieben, aber ohne gezeichneten Ausgang.
 *
 * Anders als bei der Rechtsgrundlage werden die folgenden Prüfungen hier NICHT abgeschaltet.
 * Bei § 53 LHO wäre die VV die falsche Vorschrift, hier ist sie nur nicht die einzige — die
 * Feststellung gehört an die Bearbeiterin, das Wegnehmen der Prüfungen nähme ihr etwas weg.
 */
export function pruefeEmpfaengerkreis(draft: RichtlinieDraft): Pruefergebnis[] {
  const empfaenger = draft.sections["3"]?.fields["recipients"]?.value;
  if (!Array.isArray(empfaenger) || !empfaenger.length) return [];
  const kommunal = empfaenger.includes("municipal");
  if (!kommunal) return [];
  const auchAndere = empfaenger.some((e) => e !== "municipal");

  return [{
    befund: {
      sectionId: "3", fieldId: "recipients", severity: "warning",
      regel: auchAndere ? "empfaengerkreis_gemischt" : "vvg_ausserhalb_pilot",
      message: auchAndere
        ? "Der Empfängerkreis umfasst Kommunen und andere Empfangende zugleich. Dann sind " +
          "VV zu § 44 LHO und VVG nebeneinander einschlägig; die Abgrenzung ist fachlich zu " +
          "klären und wird von diesem Werkzeug nicht entschieden."
        : "Zuwendungsempfangende sind ausschließlich Kommunen. Dann ist die VVG anzuwenden " +
          "und nicht die VV zu § 44 LHO. Dieser Zweig liegt außerhalb des Piloten — die " +
          "folgenden Prüfungen beruhen auf der VV und sind entsprechend zu bewerten.",
    },
  }];
}

/**
 * Alle fachlichen Prüfungen. Wächst, wenn weitere Bausteine dazukommen.
 *
 * Gebunden an die Rechtsgrundlage: im Prozessmodell hängt die gesamte Prüflogik unterhalb
 * des Teilprozesses „Prüfung nach § 44 LHO". Jede einzelne Regel zitiert dann auch eine
 * Ziffer der VV zu § 44 LHO oder eine ihrer Anlagen. Für eine Billigkeitsleistung nach § 53
 * LHO oder eine Verwaltungsvorschrift ist diese VV nicht einschlägig — die Regeln dort
 * anzuwenden hieße, mit der falschen Rechtsgrundlage zu prüfen.
 *
 * Nur bei ausdrücklich anderer Wahl. Solange die Rechtsgrundlage nicht gesetzt ist, wird
 * geprüft: der Regelfall ist die Zuwendungsrichtlinie, und eine Prüfung ausfallen zu lassen,
 * weil ein Feld noch leer ist, wäre die gefährlichere Vorgabe.
 */
export function pruefeFachlich(draft: RichtlinieDraft): Pruefergebnis[] {
  const rgl = draft.sections["1"]?.fields["legalBasis"]?.value;
  const immer = [...pruefeZuwendungsform(draft), ...pruefeEmpfaengerkreis(draft)];
  if (typeof rgl === "string" && rgl !== "" && rgl !== "lho44")
    return [...immer, {
      befund: {
        sectionId: "1", fieldId: "legalBasis", severity: "warning",
        regel: "pruefung_nicht_einschlaegig",
        message:
          "Die fachlichen Prüfungen dieses Werkzeugs beruhen auf der VV zu § 44 LHO. Für " +
          "die gewählte Rechtsgrundlage sind sie nicht einschlägig und laufen nicht — " +
          "Bagatellgrenze, Finanzierungsart, Verfahren und Geltungsdauer sind hier von " +
          "Hand zu prüfen.",
      },
    }];
  return [
    ...immer,
    ...pruefeBaustein5(draft),
    ...pruefeBaustein6(draft),
    ...pruefeBaustein7(draft),
    ...pruefeBaustein8(draft),
  ];
}

/** Kennung eines Vermerkseintrags. Ein Baustein kann jede Regel nur einmal auslösen. */
const vermerkSchluessel = (sectionId: string, regel: string) => `${sectionId}:${regel}`;

/**
 * Prüfergebnisse in den Entwurf schreiben: Vermerkseinträge und Überarbeitungsanforderungen.
 *
 * Läuft bei jeder Änderung und muss deshalb mehrfach anwendbar sein — ein zweiter Lauf bei
 * unverändertem Entwurf darf nichts hinzufügen und nichts verlieren.
 *
 * Die beiden Sorten werden absichtlich verschieden behandelt, wenn eine Regel nicht mehr
 * greift:
 * - VERMERKSEINTRÄGE bleiben und werden auf "gegenstandslos" gesetzt. Der Vermerk ist ein
 *   Nachweis; was einmal festgestellt wurde, verschwindet nicht, und eine schon eingeholte
 *   Begründung schon gar nicht.
 * - ÜBERARBEITUNGSANFORDERUNGEN, die niemand angefasst hat, fallen weg. Sie sind eine
 *   Arbeitsanweisung, kein Nachweis — eine gegenstandslose Aufgabe stehenzulassen erzeugt
 *   nur Rauschen. Erledigte bleiben, weil die Arbeit stattgefunden hat.
 */
export function pruefungenAnwenden(draft: RichtlinieDraft): RichtlinieDraft {
  const ergebnisse = pruefeFachlich(draft);
  const aktiv = new Set(
    ergebnisse
      .filter((e) => e.vermerk)
      .map((e) => vermerkSchluessel(e.vermerk!.sectionId, e.vermerk!.regel)),
  );

  const vorhanden = new Map(
    (draft.vermerk ?? []).map((v) => [vermerkSchluessel(v.sectionId, v.regel), v]),
  );

  for (const e of ergebnisse) {
    if (!e.vermerk) continue;
    const schluessel = vermerkSchluessel(e.vermerk.sectionId, e.vermerk.regel);
    const alt = vorhanden.get(schluessel);
    vorhanden.set(schluessel, {
      ...e.vermerk,
      id: alt?.id ?? schluessel,
      // Menschliche Eingaben überleben die Neubewertung: Begründung und Status bleiben,
      // nur die maschinelle Beurteilung wird aufgefrischt.
      begruendung: alt?.begruendung,
      status: alt && alt.status !== "gegenstandslos" ? alt.status : "offen",
    });
  }
  for (const [schluessel, v] of vorhanden)
    if (!aktiv.has(schluessel) && v.status !== "gegenstandslos")
      vorhanden.set(schluessel, { ...v, status: "gegenstandslos" });

  const sections: Record<string, SectionData> = { ...draft.sections };
  const gewuenscht = new Map<string, Revision[]>();
  for (const e of ergebnisse) {
    if (!e.revision) continue;
    const liste = gewuenscht.get(e.revision.sectionId) ?? [];
    liste.push(e.revision.eintrag);
    gewuenscht.set(e.revision.sectionId, liste);
  }
  const betroffen = new Set([
    ...gewuenscht.keys(),
    ...Object.entries(sections)
      .filter(([, s]) => (s.revisionen ?? []).length)
      .map(([id]) => id),
  ]);
  for (const id of betroffen) {
    const soll = gewuenscht.get(id) ?? [];
    const alt = sections[id]?.revisionen ?? [];
    const erledigt = alt.filter((r) => r.erledigt);
    const offen = soll
      .filter((r) => !erledigt.some((e) => e.regel === r.regel))
      .map((r) => alt.find((a) => a.regel === r.regel && !a.erledigt) ?? r);
    sections[id] = { ...(sections[id] ?? { fields: {} }), revisionen: [...erledigt, ...offen] };
  }

  return { ...draft, sections, vermerk: [...vorhanden.values()] };
}
