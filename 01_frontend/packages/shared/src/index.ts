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
 * verlangen eine fachliche Begründung im MdFE-Anschreiben. Vorlagen dafür liegen im
 * Datenordner.
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

/**
 * Ein ausformulierter Abschnitt der Richtlinie — der letzte Schritt des Prozessmodells.
 *
 * Zwei Teile mit unterschiedlicher Verlässlichkeit, und die Trennung ist der Punkt: `text`
 * ist formuliert, `begruendungen` sind gerechnet. Wer welchen Wert beigesteuert hat, welcher
 * Musterbaustein den Rahmen gab und welche Prüfung lief, steht im Entwurf und wird nur
 * eingesammelt.
 *
 * `befunde` sind die Wächter: ein Satz ohne Rückhalt in Musterbaustein oder Angabe, ein
 * nicht gefüllter Platzhalter, eine Regelung zu einer abgewählten Option, oder eine
 * bestätigte Angabe, die im Text fehlt.
 */
export const richtlinienAbschnittSchema = z.object({
  nr: z.number(),
  text: z.string(),
  begruendungen: z.array(z.object({
    feld: z.string(),
    wert: z.unknown(),
    herkunft: z.string().nullable().optional(),
    musterbaustein: z.string().nullable().optional(),
    fundstelle: z.string().nullable().optional(),
    pruefungen: z.array(z.string()).default([]),
    hinweise: z.array(z.string()).default([]),
  })).default([]),
  verwendete_bausteine: z.array(z.string()).default([]),
  offene_platzhalter: z.array(z.string()).default([]),
  befunde: z.array(z.string()).default([]),
  uebersprungen: z.string().optional(),
  fehler: z.string().optional(),
  dauer_s: z.number().optional(),
});
export type RichtlinienAbschnitt = z.infer<typeof richtlinienAbschnittSchema>;

export const richtlinientextSchema = z.object({
  abschnitte: z.array(richtlinienAbschnittSchema),
  befunde: z.array(z.string()).default([]),
  erzeugtAm: z.string(),
  /** Version des Entwurfs, aus der dieser Text entstand — siehe `textVeraltet`. */
  ausVersion: z.number(),
});
export type Richtlinientext = z.infer<typeof richtlinientextSchema>;

/**
 * Ist der erzeugte Text älter als der Entwurf?
 *
 * Ein Richtlinientext, der zu geänderten Angaben nicht mehr passt, ist gefährlicher als
 * keiner: er sieht fertig aus. Deshalb wird er nicht verworfen, sondern als veraltet
 * ausgewiesen — verwerfen hieße, eine Minute Rechenzeit stillschweigend wegzuwerfen.
 */
export function textVeraltet(draft: RichtlinieDraft): boolean {
  return !!draft.richtlinientext && draft.richtlinientext.ausVersion !== draft.version;
}

export const draftSchema = z.object({
  id: z.string(),
  ownerId: z.string(),
  title: z.string(),
  profile: fundingProfileSchema,
  sections: z.record(sectionDataSchema),
  validation: validationResultSchema,
  /** Wächst über die Bausteine; leer, solange keine Prüfung etwas festgestellt hat. */
  vermerk: z.array(vermerkEintragSchema).optional(),
  /** Der ausformulierte Text, sofern schon erzeugt. Siehe `textVeraltet`. */
  richtlinientext: richtlinientextSchema.optional(),
  /**
   * Was die Bearbeiterin im Chat geschrieben hat, in der Reihenfolge der Eingabe.
   *
   * Ohne das war jede Nachricht nur für die gerade laufende Stufe da: wer den Empfängerkreis
   * nennt, während nach dem Zuwendungszweck gefragt ist, hat ihn umsonst genannt. Im
   * Prozessmodell gibt es diese Trichter nicht — die Bearbeiterin beschreibt ihre Förderidee,
   * und das Werkzeug holt sich daraus, was es für den jeweiligen Baustein braucht.
   *
   * Deshalb geht der ganze Verlauf in jede Anfrage. Er ersetzt keine Bestätigung: Werte
   * entstehen weiterhin nur als Vorschlag und nur für die Felder der laufenden Stufe.
   */
  chatVerlauf: z.array(z.string()).optional(),
  /**
   * Chat-Stufen, die die Bearbeiterin übersprungen hat (Abschnittsnummern).
   *
   * „Überspringen" war bis hierher folgenlos: der Kasten schloss sich, und beim nächsten Zug
   * kam dieselbe Frage wieder. Konnte ein Pflichtfeld aus dem Gespräch nicht gefüllt werden
   * — im Durchlauf vom 22.09.2026 der Empfängerkreis —, drehte sich das Gespräch endlos im
   * Kreis, ohne dass es einen Ausweg gab.
   *
   * Übersprungen heißt nicht erledigt: die Felder bleiben unbestätigt, die Gesamtprüfung
   * mahnt sie weiter an, und im Formular sind sie auszufüllen. Es heißt nur, dass das
   * GESPRÄCH nicht noch einmal danach fragt.
   */
  uebersprungeneStufen: z.array(z.string()).optional(),
  /**
   * Chat-Stufen, deren Frage schon einmal gestellt wurde (Abschnittsnummern).
   *
   * Nur dafür da, die Rückschau „habe ich schon übernommen" ehrlich zu halten: aufgezählt
   * gehört, was das Gespräch NIE gefragt hat und trotzdem aus einer früheren Antwort gefüllt
   * wurde. Ohne diese Unterscheidung wuchs die Liste mit jedem Zug und wiederholte am Ende
   * alles, was die Bearbeiterin selbst beantwortet hatte.
   */
  gefragteStufen: z.array(z.string()).optional(),
  /**
   * Die Freigabe der Angaben, bevor daraus Text wird.
   *
   * Im Prozessmodell drei Aufgaben hintereinander: „Richtlinienprüfung durch
   * Verantwortlichen" → „Prüfung und Anpassung der Eingaben durch VB ELER" → „Freigabe zur
   * Richtlinienerstellung". Die Freigabe steht dort VOR dem Ausformulieren, nicht danach.
   *
   * Ohne sie formuliert das Werkzeug bereitwillig einen Richtlinientext aus Werten, die
   * niemand gegengelesen hat — und der fertige Text sieht amtlich aus. Das ist der Punkt,
   * an dem ein Mensch die Verantwortung übernimmt, bevor die Maschine Prosa daraus macht.
   *
   * `version` hält fest, für WELCHEN Stand freigegeben wurde. Ändert danach jemand eine
   * Angabe, verfällt die Freigabe — sonst wäre ein Stand freigegeben, den es nicht mehr
   * gibt. Siehe `freigabeGueltig`.
   */
  freigabe: z
    .object({
      person: z.string().min(1),
      am: z.string(),
      version: z.number().int(),
    })
    .optional(),
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
  /**
   * Derselbe Typ wie im Formularfeld, siehe `fieldValueSchema`.
   *
   * Vorher `string`: ein Fördersatz wurde dann zu "90" und eine Mehrfachauswahl zu
   * "municipal" statt `["municipal"]`. Bestätigt landete der falsche Typ im Entwurf, und die
   * Prüfregeln — die auf Zahlen und Listen rechnen — liefen daran vorbei, ohne zu meckern.
   */
  value: FieldValue["value"];
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
  /**
   * Gerechnet statt vorgeschlagen — kein Modell beteiligt.
   *
   * Die Schlussformel wird aus Titel und Baustein 8 zusammengesetzt. Ohne diese Marke zeigte
   * die Oberfläche „Aus dem Regelfall abgeleitet, bitte besonders prüfen" — eine Warnung vor
   * einer Vermutung, wo gar keine vorliegt. Wer sie dreimal zu Unrecht liest, liest sie beim
   * vierten Mal nicht mehr.
   */
  berechnet?: boolean;
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
// Nimmt alles, was eine Datei und eine Seite kennt — nicht nur einen Feldvorschlag. Seit die
// Vorbilder im Prüfvermerk dieselbe Verlinkung brauchen, wäre die engere Signatur eine
// künstliche Hürde: gebraucht werden ohnehin nur diese beiden Angaben.
/**
 * Der Weg zu einem Quelldokument, aufgeschlagen an der richtigen Seite.
 *
 * Die Grundform mit zwei Angaben statt mit einem ganzen Feldvorschlag: dieselbe Verlinkung
 * brauchen inzwischen drei Stellen — Chat, Formular und die Vorbilder im Prüfvermerk —, und
 * nur die letzte hat einen Feldvorschlag zur Hand.
 */
export function dokumentUrl(
  datei?: string | null,
  seite?: number | null,
): string | null {
  if (!datei) return null;
  return `${DOKUMENT_BASIS}/dokument/${encodeURIComponent(datei)}${seite ? `#page=${seite}` : ""}`;
}

/**
 * Eine Stelle, die die Suche geliefert hat.
 *
 * Getrennt von `FieldProposal`: Eine Fundstelle gehört zur SUCHE, nicht zu einem Wert. Sie
 * steht auch dann da, wenn aus ihr kein Vorschlag wurde — dass die Suche nichts fand, ist
 * eine andere Auskunft als dass das Modell nichts übernahm.
 */
export type Fundstelle = {
  text: string;
  datei: string | null;
  seite: number | null;
  /** Zu welchem Zielfeld diese Stelle gesucht wurde. */
  feld?: string | null;
  feld_label?: string | null;
  /** Die tragenden Sätze, zum Verwerfen ohne Aufschlagen. */
  zitat?: string | null;
};

export function dokumentLink(p: FieldProposal): string | null {
  return dokumentUrl(p.belegdatei, p.belegseite);
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
        // Nur, wenn überhaupt weitergeleitet werden darf. Ohne diese Bedingung wurde das
        // Feld auch bei „nicht zulässig" erhoben und mit „Keine Weiterleitung zulässig"
        // gefüllt — eine Regelung zu einem Fall, den die Richtlinie ausschließt. Im
        // Richtlinientext stünde das als eigener Absatz.
        visible: (_p, v) => v["forwarding"] === "yes",
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
        // Der Hinweis geht in den Prompt mit (siehe `_felder_text` im Vorschlagsdienst) und
        // ist deshalb mehr als eine Lesehilfe. Ohne ihn wählte das Modell bei gemischtem
        // Empfängerkreis nur ANBest-P — die Kommunen stünden dann ohne ihre
        // Nebenbestimmungen da, obwohl beide Dokumente im Korpus liegen.
        help:
          "ANBest-P gilt für Zuwendungen zur Projektförderung allgemein, ANBest-G für " +
          "Gemeinden und Gemeindeverbände. Umfasst der Empfängerkreis BEIDE Gruppen, gelten " +
          "auch beide — jede für ihre Gruppe.",
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
        // Die Beschriftungen nennen den Inhalt, nicht die Nummer. „Variante 1 gemäß
        // Musterrichtlinie" verlangt von der Bearbeiterin, ein Dokument aufzuschlagen,
        // das die Oberfläche ihr nicht zeigt — und bis dahin rät sie. Der Wortlaut steht
        // in Musterbaustein 7.1 und passt in eine Zeile.
        help: "Nach Musterbaustein 7.1 der Musterrichtlinie.",
        options: [
          {
            value: "variant-1",
            label:
              "Variante 1 — nur noch nicht begonnene Vorhaben (Grundsatz nach § 44 LHO)",
          },
          {
            value: "variant-2",
            label:
              "Variante 2 — Beginn mit Antragstellung zulässig, ohne Genehmigung des vorzeitigen Vorhabenbeginns",
          },
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
   * Bedingung für die Übersprünge, die das Prozessmodell ausdrücklich benennt — etwa den
   * Sprung über die Beihilfestufen, wenn die Rechtsgrundlage reines Landesrecht ist.
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
    // `recipients` gehört dazu und nicht nur die Beschreibung: an der Auswahl „Kommunen"
    // hängt der kommunale Höchstsatz. Stand hier nur `recipientDetails`, blieb die Auswahl
    // leer, und die Regel konnte nicht greifen — sie hatte ihre Eingangsgröße nie.
    sectionId: "3",
    fieldIds: ["recipients", "recipientDetails"],
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
    // führt dafür eine eigene Erhebung über das Chat-Interface, mit der Begründung, die
    // Entscheidung sei stark einzelfallabhängig. Die Frage nannte sie schon, erhoben wurde
    // sie bisher nur per Klick.
    //
    // Fördersatz, Finanzierungsart und Finanzierungsform stehen mit in der Frage, weil sie
    // sonst niemand erhebt: die Frage nannte sie nicht, also gingen sie auch nicht in die
    // Anfrage, und wer sie trotzdem nannte, verlor die Angabe. An ihnen hängen drei
    // Prüfregeln — kommunaler Höchstsatz, Vollfinanzierung, Zuwendungsform.
    fieldIds: [
      "eligibleCosts", "eligibleBasis", "fundingRate", "financingType", "financingForm",
    ],
    question:
      "Welche Ausgaben oder Kosten sollen förderfähig sein, wie sollen sie bemessen werden — als Spitzabrechnung der tatsächlichen Kosten oder über feste Beträge —, und wie hoch soll die Förderung sein (Fördersatz, Finanzierungsart, Finanzierungsform)?",
  },
  // Hier endet das Gespräch, und das ist eine Entscheidung.
  //
  // Die Bausteine 0 bis 5 sind Entscheidungen, die man erzählt: Titel, Ziel, Gegenstand,
  // Empfängerkreis, Voraussetzungen, Höhe. Für die Bemessungsgrundlage nennt das
  // Prozessmodell die Chat-Eingabe sogar ausdrücklich.
  //
  // Ab Baustein 6 gilt überwiegend der Regelfall: eine Auswahl aus drei Nebenbestimmungen,
  // ein paar Haken, zwei Datumsangaben. Dafür eine Frage zu stellen und ein bis zwei Minuten
  // auf ein Modell zu warten, kostet mehr Zeit, als das Ausfüllen spart — kurz erprobt und
  // wieder entfernt. Die Unterstützung dort gehört ins Formular („Vorschlag holen"), nicht
  // ins Gespräch: ein Knopf wartet nicht, wenn niemand ihn drückt.
];

/**
 * Die bestätigten Feldwerte des Entwurfs, über alle Bausteine hinweg.
 *
 * Nur bestätigte: an diesen Werten hängen die Verzweigungen, und eine unbestätigte
 * Vermutung des Modells darf keinen Pfad festlegen. Der Unterschied ist wichtiger, als er
 * aussieht — ein still übersprungener Schritt ist ein Fehler, den niemand sieht.
 */
export function bestaetigteWerte(draft: RichtlinieDraft): Record<string, unknown> {
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
  if (draft.uebersprungeneStufen?.includes(stage.sectionId)) return false;
  if (stage.gilt && !stage.gilt(draft)) return false;
  const werte = bestaetigteWerte(draft);
  const felder = (sections.find((s) => s.id === stage.sectionId)?.fields ?? [])
    .filter((f) => stage.fieldIds.includes(f.id));
  // Kennt die Stufe ein Feld, das es in der Abschnittsdefinition nicht gibt, wird nicht
  // übersprungen — lieber einmal zu viel fragen als eine Angabe verlieren.
  if (felder.length !== stage.fieldIds.length) return true;
  return felder.some((f) => fieldVisible(f, draft.profile, werte));
}

/**
 * Die Felder, für die eine Stufe einen Vorschlag holen soll.
 *
 * NICHT `stage.fieldIds` — das sind die Felder, nach denen die Frage ausdrücklich fragt, und
 * es sind weniger. Baustein 5 hat elf Felder, die Frage nennt zwei; bis hierher gingen auch
 * nur diese zwei in die Anfrage. Wer „der Fördersatz soll 90 Prozent betragen" schrieb,
 * bekam den Wert nirgends abgelegt, und weil die Prüfregeln auf den Feldern sitzen, schlug
 * auch keine an. Ein stiller Verlust, der wie ein fehlerfreier Entwurf aussieht.
 *
 * Gesammelt wird deshalb für jedes sichtbare, noch unbestätigte Feld des Abschnitts. Die
 * Frage bleibt die schmale — sie soll die Bearbeiterin führen, nicht abfragen. Deckt ihre
 * Antwort mehr ab, wird das mitgenommen; deckt sie weniger ab, kommt für den Rest `[Unklar]`
 * und damit gar kein Vorschlag.
 *
 * Bestätigte Felder bleiben außen vor: was ein Mensch entschieden hat, schlägt das Werkzeug
 * nicht erneut vor.
 */
export function stufenFelder(
  stage: ChatStage,
  draft: RichtlinieDraft,
): FieldDefinition[] {
  const werte = bestaetigteWerte(draft);
  return (sections.find((s) => s.id === stage.sectionId)?.fields ?? []).filter(
    (f) =>
      fieldVisible(f, draft.profile, werte) &&
      !draft.sections[stage.sectionId]?.fields[f.id]?.confirmedByUser,
  );
}

/**
 * Die nächste Stufe, oder keine.
 *
 * Offen ist eine Stufe, solange eines ihrer GEFRAGTEN Felder (`stage.fieldIds`) unbestätigt
 * ist — nicht solange irgendein Feld des Abschnitts offen ist. Der Unterschied ist nötig,
 * weil Abschnitte optionale Felder haben, die oft leer bleiben (Ausschlüsse, Weiterleitung);
 * am weiten Maßstab gemessen käme das Gespräch nie von der Stelle.
 *
 * Gesammelt wird trotzdem breit, siehe `stufenFelder`. Hat eine frühere Antwort die
 * gefragten Felder einer späteren Stufe schon gefüllt und die Bearbeiterin sie bestätigt,
 * wird diese Stufe übersprungen — genau dafür ist der Verlauf da.
 */
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

/**
 * Ein Feldwert, wie ihn ein Mensch liest.
 *
 * Auswahlfelder tragen intern eine Kennung — `municipal`, `actual`, `share`. Für eine
 * Rückfrage an die Bearbeiterin („Ihre bisherigen Angaben: …") ist die Kennung wertlos; sie
 * soll wiedererkennen, was sie gesagt hat.
 */
export function feldwertText(
  sectionId: string,
  fieldId: string,
  wert: FieldValue["value"],
): string {
  const feld = sections
    .find((s) => s.id === sectionId)
    ?.fields.find((f) => f.id === fieldId);
  const lesbar = (v: unknown) =>
    feld?.options?.find((o) => o.value === String(v))?.label ?? String(v);
  if (wert === null || wert === undefined) return "";
  return Array.isArray(wert) ? wert.map(lesbar).join(", ") : lesbar(wert);
}

/**
 * Stufen, die das Gespräch übergehen wird, weil frühere Angaben sie schon decken.
 *
 * Bis hierher verschwanden sie wortlos: wer seine Förderidee am Stück erzählt, füllt damit
 * mehrere Bausteine, und die zugehörigen Fragen kamen einfach nicht mehr. Aus Sicht der
 * Bearbeiterin sprang das Gespräch — sie konnte nicht sehen, was das Werkzeug ihr in den
 * Mund gelegt hat, und nichts ergänzen.
 *
 * Ergibt je Stufe die bestätigten Werte ihrer gefragten Felder, damit die Oberfläche sie
 * zeigen und nachfragen kann. Nur die Stufen VOR der nächsten offenen — was danach kommt,
 * ist noch nicht an der Reihe.
 */
export function gedeckteStufen(
  draft: RichtlinieDraft,
  ohne?: string,
): { stage: ChatStage; werte: { label: string; wert: string }[] }[] {
  const naechste = nextChatStage(draft);
  const grenze = naechste ? chatStages.indexOf(naechste) : chatStages.length;
  return chatStages.slice(0, grenze).flatMap((stage) => {
    // Die eben beantwortete Stufe nicht aufzählen. Sie steht schon im Bestätigen-Kasten
    // darüber, und sie noch einmal als „habe ich übernommen" zu melden, liest sich wie ein
    // zweiter Vorgang.
    if (stage.sectionId === ohne) return [];
    // Und nichts aufzählen, wonach das Gespräch gefragt hat. Die Rückschau ist für das
    // gedacht, was die Bearbeiterin NEBENBEI mitgeliefert hat — beantwortete Fragen weiss
    // sie selbst.
    if (draft.gefragteStufen?.includes(stage.sectionId)) return [];
    if (!stufeGilt(stage, draft)) return [];
    const felder = sections.find((s) => s.id === stage.sectionId)?.fields ?? [];
    const werte = stage.fieldIds.flatMap((id) => {
      const feld = draft.sections[stage.sectionId]?.fields[id];
      if (!feld?.confirmedByUser) return [];
      return [{
        label: felder.find((f) => f.id === id)?.label ?? id,
        wert: feldwertText(stage.sectionId, id, feld.value),
      }];
    });
    return werte.length ? [{ stage, werte }] : [];
  });
}

const ERHEBUNG_FERTIG =
  "Die geführte Erhebung ist abgeschlossen. Prüfen Sie nun den strukturierten Entwurf.";

/**
 * Die nächste Nachricht des Assistenten: was schon gedeckt ist, dann die offene Frage.
 *
 * An einer Stelle gebaut, weil Dienst und Offline-Attrappe sie beide brauchen und weil eine
 * auseinanderlaufende Gesprächsführung der schwerste Fehler dieser Naht wäre — die
 * Bearbeiterin merkt ihn erst, wenn sie beides nebeneinander sieht.
 */
export function naechsteFrage(draft: RichtlinieDraft, ohne?: string): string {
  const gedeckt = gedeckteStufen(draft, ohne);
  const frage = nextChatStage(draft)?.question ?? ERHEBUNG_FERTIG;
  if (!gedeckt.length) return frage;
  const uebernommen = gedeckt
    .map(({ stage, werte }) => {
      const titel = sections.find((s) => s.id === stage.sectionId)?.title ?? stage.sectionId;
      return `${titel}\n${werte.map((w) => `  • ${w.label}: ${w.wert}`).join("\n")}`;
    })
    .join("\n");
  return (
    "Aus Ihren bisherigen Angaben habe ich schon übernommen:\n\n" +
    uebernommen +
    "\n\nMöchten Sie dazu etwas ergänzen oder ändern? Wenn nicht, weiter:\n\n" +
    frage
  );
}

/**
 * Die Schlussformel aus dem zusammensetzen, was schon im Entwurf steht.
 *
 * Ort, Datum, Ministerium, „Im Auftrag" — die Formel sieht in jeder Landesrichtlinie gleich
 * aus, und alle Bestandteile liegen bereits vor: das Ministerium im Titel, das Datum als
 * Inkrafttreten in Baustein 8. Ein Modellaufruf dafür wäre eine Minute Wartezeit für einen
 * Satz, der sich ausrechnen lässt — und er könnte danebengreifen, was hier nicht kann.
 *
 * Die Bausteine 0, 9 und 10 haben in der Musterrichtlinie keinen Satzrahmen. Für 9
 * (Anhänge) gibt es auch keinen Regelfall; für 10 gibt es ihn, er steht nur nicht in der
 * Vorlage.
 *
 * Ergibt null, wenn das Ministerium nicht aus dem Titel zu lesen ist. Lieber nichts als eine
 * Behörde, die niemand genannt hat — die Unterschriftszeile einer Richtlinie ist der letzte
 * Ort für eine Vermutung.
 */
/** Die Linie, auf der bei der Ausfertigung das Datum eingetragen wird. */
const AUSFERTIGUNGSLUECKE = "__________";

export function schlussformel(draft: RichtlinieDraft): string | null {
  const titel = String(draft.sections["0"]?.fields["title"]?.value ?? draft.title ?? "");
  // „Richtlinie des Ministeriums für X über die Gewährung …" — der Name endet vor dem
  // nächsten Bindewort, das die Formel einleitet.
  const treffer = titel.match(
    /\b(Ministeriums?|Ministerium)\s+(für|der|des)\s+(.+?)(?=\s+(?:über|zur|zum|betreffend|vom)\b|$)/i,
  );
  if (!treffer) return null;
  const ministerium = `Ministerium ${treffer[2]} ${treffer[3]}`.replace(/\s+/g, " ").trim();

  // Ohne Datum, mit Absicht.
  //
  // Bis zum 24.09.2026 stand hier das Inkrafttretensdatum aus Baustein 8, und im Durchlauf
  // desselben Tages las sich das als „Potsdam, den 1. Januar 2027". Das sind zwei
  // verschiedene Daten: die Schlussformel trägt den Tag der AUSFERTIGUNG — den Tag, an dem
  // unterschrieben wird. Der liegt vor dem Inkrafttreten und steht beim Entwerfen noch
  // nicht fest.
  //
  // „Potsdam, den" ohne Datum ist deshalb kein Mangel, sondern die richtige Form eines
  // unterschriftsreifen Entwurfs. Ein Datum, das wir raten, wäre der schlechtere Zustand:
  // es sähe fertig aus.
  //
  // Die Lücke bekommt eine Linie, weil sie sonst wie ein Fehler aussieht: Im Durchlauf vom
  // 09.10.2026 endete der Vorschlag mit „Potsdam, den" und brach scheinbar ab. Die Linie ist
  // die übliche Form einer Stelle, die bei der Unterschrift ausgefüllt wird — und sie löst
  // den Platzhalter-Wächter nicht aus, der auf „XX" und spitze Klammern sieht.

  // Potsdam als Sitz der Landesregierung. Steht so in jeder Landesrichtlinie; ein eigenes
  // Feld dafür wäre eine Frage, die nie eine andere Antwort hat.
  return [`Potsdam, den ${AUSFERTIGUNGSLUECKE}`, ministerium, "Im Auftrag"].join("\n");
}

/**
 * Gilt die Freigabe noch für den gegenwärtigen Stand?
 *
 * Jede Änderung an einem Feld erhöht `version`. Eine Freigabe, die für Version 12 erteilt
 * wurde, deckt Version 13 nicht — sonst würde eine Unterschrift für Angaben gelten, die
 * nach ihr geändert wurden. Das ist derselbe Gedanke wie bei `textVeraltet`.
 */
export function freigabeGueltig(draft: RichtlinieDraft): boolean {
  return !!draft.freigabe && draft.freigabe.version === draft.version;
}

export function emptySections(): Record<string, SectionData> {
  return Object.fromEntries(sections.map((s) => [s.id, { fields: {} }]));
}
/**
 * Felder, für die das Prozessmodell einen KI-Vorschlag aus früheren Richtlinien vorsieht.
 *
 * Das Modell führt dafür eigene Aufgaben — je eine für Zuwendungsvoraussetzungen, fachliche
 * Ausschlüsse und fachliche Zuwendungsbestimmungen — und schreibt jeder von ihnen denselben
 * Korpusausschnitt vor: ausschließlich frühere Richtlinien des Landes und der GAK als
 * Hilfestellung, und zwar auch dann, wenn die neue Richtlinie selbst keine GAK-Richtlinie ist.
 *
 * Als Begründung nennt es ein Beispiel: eine bestehende Richtlinie eines Sachgebiets trage
 * ähnliche Voraussetzungen wie eine neu zu schreibende eines verwandten. Hier wird nicht aus
 * einer Vorschrift
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

/**
 * Taugt dieses Zitat als Fundstelle — oder ist es eine Überschrift, ein Tabellenrest?
 *
 * Der Satzfilter schneidet Textstücke auf ihre tragenden Sätze zurück, prüft aber nicht, ob
 * das Ergebnis überhaupt ein Satz ist. Im Probelauf kamen „Nennung der Fördergegenstände"
 * (eine Gliederungsüberschrift) und „5.4, 1 = Bemessungsgrundlage: Ausgaben.." (ein Rest aus
 * einer Tabelle) als Fundstellen zurück. Beides kann nichts belegen: eine Überschrift
 * benennt ein Thema, sie trifft keine Aussage.
 *
 * Dasselbe Maß wie `ist_ueberschrift` im Vorschlagsdienst, wo es beim Ausformulieren schon
 * angewandt wird — kurz und ohne Satzende. Im Belegweg fehlte es, also lief die Erkenntnis
 * nur auf einer von zwei Strecken mit.
 *
 * Die Längengrenze ist großzügig: ein langer Absatz ohne Schlusspunkt ist ein abgeschnittener
 * Satz, keine Überschrift. Überschriften sind kurz — das ist ihr Zweck.
 */
export function istBelegSatz(zitat: string | null | undefined): boolean {
  const t = (zitat ?? "").trim();
  if (t.length < 40) return false;
  // Spuren einer Tabelle: das Gleichheitszeichen trennt dort Zelle von Zelle. In einem
  // Rechtstext kommt es praktisch nicht vor — „5.4, 1 = Bemessungsgrundlage: Ausgaben.."
  // ist eine Zeile aus dem Raster, kein Satz, und sie endet trotzdem auf einen Punkt.
  if (t.includes("=")) return false;
  // Doppelpunkte am Ende kündigen eine Aufzählung an, die hier nicht mehr steht; doppelte
  // Punkte sind eine abgeschnittene Zelle.
  if (t.endsWith("..")) return false;
  return /[.!?][)"”»]?$/.test(t) || t.length >= 120;
}

/**
 * Den Wert aus dem Vorschlagsdienst in den Typ des Formularfelds bringen.
 *
 * Das Modell antwortet in Text, das Formular rechnet in Zahlen und Listen. Ohne diese Naht
 * steht im Fördersatz "90 Prozent" statt 90, und `pruefeBaustein5` vergleicht eine
 * Zeichenkette mit einer Zahl — ohne Fehler, aber ohne Befund. Eine Mehrfachauswahl kommt
 * als "municipal" zurück und nicht als `["municipal"]`; der kommunale Höchstsatz sucht dann
 * in einer Zeichenkette nach einem Listeneintrag und findet nichts.
 *
 * Was sich nicht umwandeln lässt, bleibt unverändert: lieber ein sichtbar unpassender Wert
 * im Feld als eine erfundene Zahl. Die Auswahlprüfung des Formulars fängt ihn ab.
 */
export function feldwertAusVorschlag(
  wert: string | number | boolean | string[] | null,
  kind: FieldDefinition["kind"],
): FieldValue["value"] {
  if (wert === null || wert === undefined) return null;
  if (kind === "checkbox") {
    if (Array.isArray(wert)) return wert.map((w) => normalisiereAuswahl(w));
    // Das Modell liefert Mehrfachauswahlen gern als Aufzählung in einer Zeile.
    return String(wert)
      .split(/[,;]|\bund\b/)
      .map((w) => normalisiereAuswahl(w))
      .filter(Boolean);
  }
  if (Array.isArray(wert)) return wert.join(", ");
  if (kind === "number") {
    if (typeof wert === "number") return wert;
    // „90 Prozent", „90 %", „1.500 Euro" — die Einheit steht im Feldnamen, nicht im Wert.
    const roh = String(wert).replace(/\./g, "").replace(",", ".");
    const treffer = roh.match(/-?\d+(\.\d+)?/);
    return treffer ? Number(treffer[0]) : String(wert);
  }
  if (kind === "radio") return normalisiereAuswahl(wert);
  return typeof wert === "boolean" ? wert : String(wert);
}

/** Wortmenge eines Textes, kurze Wörter weggelassen. */
function _woerter(text: string): Set<string> {
  return new Set(
    (text.toLowerCase().match(/[\wäöüß]{5,}/g) ?? []).filter(Boolean),
  );
}

/**
 * Wiederholt dieser Vorschlag, was in einem ANDEREN Abschnitt schon bestätigt ist?
 *
 * Die breite Sammlung hat einen Preis: jedes Feld eines Abschnitts bekommt den ganzen
 * Gesprächsverlauf zu sehen und greift sich heraus, was irgendwie passt. In den
 * Zuwendungsvoraussetzungen landete so der Empfängerkreis, der Fördergegenstand und die
 * Weiterleitungsregel — alles schon anderswo geregelt, hier bloß noch einmal erzählt.
 *
 * Der Schaden ist doppelt: die Richtlinie regelt dieselbe Sache zweimal, und dem Abschnitt,
 * dem der Inhalt gehört, fehlt er hinterher. Im Durchlauf vom 22.09.2026 stand die
 * Weiterleitungsregel im Text von Baustein 4 und fehlte in Baustein 3 — gemeldet wurde nur
 * das Fehlen, nicht die Ursache.
 *
 * Verglichen werden Wörter, kein Modell. Ein umformulierter Satz teilt mit seinem Vorbild
 * fast alle tragenden Wörter; eine eigenständige Regelung tut das nicht. Die Schwelle ist
 * hoch angesetzt — im Zweifel lieber eine Dopplung stehen lassen als eine echte Angabe
 * verwerfen, denn das Fehlende fällt auf, das Doppelte auch, aber das Verworfene nicht.
 */
export function istWiederholung(
  wert: FieldValue["value"],
  draft: RichtlinieDraft,
  sectionId: string,
): boolean {
  if (typeof wert !== "string" || wert.trim().length < 60) return false;
  const neu = _woerter(wert);
  if (neu.size < 5) return false;
  for (const [sid, abschnitt] of Object.entries(draft.sections)) {
    if (sid === sectionId) continue;
    for (const feld of Object.values(abschnitt.fields)) {
      if (!feld.confirmedByUser || typeof feld.value !== "string") continue;
      const alt = _woerter(feld.value);
      if (alt.size < 5) continue;
      const gemeinsam = [...neu].filter((w) => alt.has(w)).length;
      if (gemeinsam / Math.min(neu.size, alt.size) >= 0.8) return true;
    }
  }
  return false;
}

/** Die Abfragesorte für eine Menge von Zielfeldern, oder keine. */
export function abfrageartFuer(fieldIds: string[]): "vorschlagen" | undefined {
  return fieldIds.some((id) => VORSCHLAGSFELDER.includes(id)) ? "vorschlagen" : undefined;
}

/**
 * Ist dieser Feldwert leer?
 *
 * Gibt es, weil `!wert` die falsche Antwort gibt: eine leere Liste ist in JavaScript WAHR.
 * Wer bei „Prüfberechtigte Stellen" alle Haken entfernte und speicherte, hatte damit
 * weiterhin einen Wert — der Abschnitt blieb auf „Vollständig", und der Vorschlagsknopf
 * hielt das Feld für bestätigt und bot nichts an. Zwei verschiedene Symptome, eine Ursache.
 *
 * Die Zahl 0 und `false` sind dagegen KEINE Leere: ein Fördersatz von 0 Prozent und ein
 * abgewähltes Ja/Nein sind Festlegungen.
 */
/**
 * Die Musterbaustein-Kennung so schreiben, wie eine Bearbeiterin sie lesen kann.
 *
 * In der Musterrichtlinie heißen manche Bausteine „5.4.n" oder „8.n". Das `n` ist keine
 * Nummer, sondern eine Anweisung an den Ersteller: „laufend zu nummerieren, sooft der
 * Baustein gebraucht wird". In der erzeugten Datei bleibt es deshalb stehen — sie ist ein
 * getreues Abbild der Vorlage.
 *
 * In der Oberfläche ist es ein Fremdkörper. Im Durchlauf vom 24.09.2026 stand unter einem
 * Vorschlag „Musterbaustein 5.4.n", und das liest sich wie ein Tippfehler oder ein kaputter
 * Datensatz. Wer der Herkunftsangabe nicht traut, liest sie nicht mehr — und die
 * Herkunftsangabe ist der Unterschied zwischen diesem Werkzeug und einem Textgenerator.
 */
export function musterbausteinText(nummer: string | null | undefined): string {
  const roh = (nummer ?? "").trim();
  if (!roh) return "";
  return roh.endsWith(".n") ? `${roh.slice(0, -2)} (fortlaufend nummeriert)` : roh;
}

/**
 * Womit im Korpus gesucht wird, wenn es keine frische Eingabe gibt.
 *
 * Der Knopf „Vorschlag holen" im Formular hat keine, also reichte die Naht bis zum
 * 06.10.2026 den GESAMTEN Chatverlauf als Suchanfrage durch. Für die Deckung ist er die
 * richtige Quelle — es sind die Angaben der Bearbeiterin. Als Suchanfrage ist er das
 * Schlechteste, was man schicken kann: ein langer, thematisch gemischter Text trifft überall
 * ein bisschen und nirgends genau. Im Durchlauf vom 24.09.2026 kam so der Richtlinien-Titel
 * als Deckung für die Bewilligungsbehörde heraus — er stand im Verlauf, und er war das
 * Ähnlichste, was die Suche zum Stichwort „Ministerium" fand.
 *
 * Gesucht wird stattdessen mit dem, worum es in DIESEM Abschnitt geht — und zwar aus zwei
 * Richtungen:
 *
 * - den BESTÄTIGTEN Werten, jeder mit seiner Beschriftung. Sie sagen, worum es in diesem
 *   Vorhaben geht.
 * - den Beschriftungen der FEHLENDEN Felder. Sie sagen, wonach überhaupt gefragt ist, und
 *   ohne sie sucht das Werkzeug nach dem, was schon entschieden ist. In Abschnitt 5 fehlte
 *   zuletzt allein die Kumulierungsregel; die Anfrage beschrieb Fördersatz und
 *   Finanzierungsart, und das Wort „Kumulierung" erreichte die Suche überhaupt nicht.
 *
 * Die Themen des Abschnitts kommen im Vorschlagsdienst ohnehin dazu (`ABSCHNITT_THEMEN` in
 * anfrage.py), auch wenn hier nichts zusammenkommt — ein frischer Abschnitt sucht dann
 * allein über sein Thema, und das ist genau richtig.
 *
 * `gesucht` sind die Felder, die gerade gefüllt werden sollen. Ohne Angabe gelten alle noch
 * nicht bestätigten des Abschnitts.
 */
/**
 * Die Felder, die einen Förderfall mit einem anderen vergleichbar machen.
 *
 * Gesucht wird nicht irgendeine Stelle zum Thema, sondern eine, aus der sich etwas ableiten
 * lässt — also eine unter ähnlichen Bedingungen. Für einen Fördersatz ist die wichtigste
 * Bedingung, ob die Empfangenden Kommunen sind; die steht aber in Abschnitt 3, nicht in
 * Abschnitt 5. Ein Suchtext allein aus den Feldern DIESES Abschnitts schließt also gerade
 * das aus, was den Fall vergleichbar macht.
 *
 * Bewusst kurz gehalten: je mehr Bedingungen in die Anfrage wandern, desto mehr ähnelt sie
 * wieder dem ganzen Chatverlauf, der am Anfang das Problem war.
 */
const RAHMENBEDINGUNGEN: { sectionId: SectionId; fieldId: string }[] = [
  { sectionId: "1", fieldId: "legalBasis" },
  { sectionId: "3", fieldId: "recipients" },
  { sectionId: "5", fieldId: "financingType" },
  { sectionId: "5", fieldId: "financingForm" },
];

/** Die Randbedingungen des Entwurfs als Text, ohne die des gefragten Abschnitts. */
export function rahmenbedingungen(d: RichtlinieDraft, ausser?: SectionId): string {
  const teile: string[] = [];
  for (const { sectionId, fieldId } of RAHMENBEDINGUNGEN) {
    if (sectionId === ausser) continue;
    const feld = d.sections[sectionId]?.fields[fieldId];
    if (!feld?.confirmedByUser || feldLeer(feld.value ?? null)) continue;
    teile.push(feldwertText(sectionId, fieldId, feld.value));
  }
  // Die Finanzierungsquelle steht nicht in einem Feld, sondern im Profil.
  teile.push(d.profile.gak ? "Bund-Land-Finanzierung nach GAK" : "reine Landesmittel");
  return teile.filter(Boolean).join(", ");
}

export function suchtextFuer(
  d: RichtlinieDraft,
  nr: SectionId,
  gesucht?: { id: string; label: string }[],
): string {
  const def = sections.find((s) => s.id === nr);
  if (!def) return "";
  const bestaetigt: string[] = [];
  const offen: string[] = [];
  for (const f of def.fields) {
    const feld = d.sections[nr]?.fields[f.id];
    if (feld?.confirmedByUser && !feldLeer(feld.value ?? null)) {
      bestaetigt.push(`${f.label}: ${feldwertText(nr, f.id, feld.value)}`);
    } else if (!gesucht) {
      offen.push(f.label);
    }
  }
  for (const f of gesucht ?? []) offen.push(f.label);
  // Die Gesuchten zuerst: sie sind die Frage. Dann die Randbedingungen, die den Fall
  // vergleichbar machen, dann der Zusammenhang aus diesem Abschnitt.
  return [offen.join(", "), suchkontextFuer(d, nr)].filter(Boolean).join(". ");
}

/**
 * Der Zusammenhang OHNE die gesuchten Felder — Randbedingungen und schon Bestätigtes.
 *
 * Getrennt, weil der Dienst je Feld einzeln sucht und dafür den Feldnamen selbst davorsetzt.
 * Eine gemeinsame Anfrage für alle offenen Felder eines Abschnitts stellt mehrere Fragen auf
 * einmal, und was zurückkommt, beantwortet bestenfalls eine davon: Bei der Beurteilung am
 * 08.10.2026 begründete das prüfende Modell JEDE der 22 verworfenen Stellen mit demselben
 * Muster — „regelt die Finanzierungsart, aber nicht den Höchstbetrag". Richtiger Abschnitt,
 * falsches Feld.
 */
export function suchkontextFuer(d: RichtlinieDraft, nr: SectionId): string {
  const def = sections.find((s) => s.id === nr);
  if (!def) return "";
  const bestaetigt: string[] = [];
  for (const f of def.fields) {
    const feld = d.sections[nr]?.fields[f.id];
    if (feld?.confirmedByUser && !feldLeer(feld.value ?? null))
      bestaetigt.push(`${f.label}: ${feldwertText(nr, f.id, feld.value)}`);
  }
  return [rahmenbedingungen(d, nr), bestaetigt.join(". ")].filter(Boolean).join(". ");
}

export function feldLeer(wert: FieldValue["value"]): boolean {
  if (wert === null || wert === undefined) return true;
  if (Array.isArray(wert)) return wert.length === 0;
  return wert === "";
}

export function fieldVisible(
  field: FieldDefinition,
  profile: FundingProfile,
  values: Record<string, unknown>,
) {
  return field.visible ? field.visible(profile, values) : true;
}

/**
 * Wie weit ist der Entwurf? Anteil der bestätigten Pflichtangaben, 0 bis 100.
 *
 * Vorher rechnete die Übersicht `1 − Fehleranzahl / 25` und nannte das Ergebnis
 * „Vollständigkeit". Das war keine: die 25 war eine geratene Obergrenze, und ein frisch
 * angelegter Entwurf ohne eine einzige Eingabe stand damit auf 12 Prozent — er hatte 22 der
 * 25 möglichen Fehler. Wer den Balken las, hielt ein leeres Blatt für angefangen.
 *
 * Gezählt werden nur SICHTBARE Pflichtfelder: welche das sind, hängt am Pfad — ein Feld, das
 * die gewählte Finanzierungsart gar nicht vorsieht, darf den Nenner nicht aufblähen. Und nur
 * BESTÄTIGTE zählen als erledigt, wie überall sonst auch: ein Vorschlag, den niemand
 * angenommen hat, ist keine Angabe.
 */
export function vollstaendigkeit(draft: RichtlinieDraft): number {
  let noetig = 0;
  let da = 0;
  for (const def of sections) {
    const felder = draft.sections[def.id]?.fields ?? {};
    const werte = Object.fromEntries(
      Object.entries(felder).map(([id, f]) => [id, f.value]),
    );
    for (const f of def.fields) {
      if (!f.required || !fieldVisible(f, draft.profile, werte)) continue;
      noetig += 1;
      const feld = felder[f.id];
      if (feld?.confirmedByUser && !feldLeer(feld.value)) da += 1;
    }
  }
  return noetig === 0 ? 0 : Math.round((da / noetig) * 100);
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
      // Dieselbe Definition wie überall sonst, siehe `feldLeer`. Sie stand hier als Kopie,
      // und die Kopie war die einzige RICHTIGE: Statusanzeige und Vorschlagsknopf hielten
      // eine leere Liste für einen Wert, diese Stelle nicht. Die Meldungen widersprachen
      // sich deshalb — der Abschnitt galt als vollständig und mahnte gleichzeitig ein Feld an.
      const leer = feldLeer(value ?? null);
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

  // 3 — Erhöhter Fördersatz für Kommunen: über 80 Prozent ist die Zustimmung des MdFE
  //     nötig.
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
  const raus: Pruefergebnis[] = [];

  // Die Nebenbestimmungen müssen zum Empfängerkreis passen.
  //
  // ANBest-P gilt für die Projektförderung allgemein, ANBest-G für Gemeinden und
  // Gemeindeverbände — zwei Anlagen an zwei verschiedenen Verwaltungsvorschriften (Anlage 15
  // zur VV, Anlage 21 zur VVG). Umfasst der Empfängerkreis beide Gruppen, gelten beide, jede
  // für ihre.
  //
  // Ein Hinweis am Feld hat den Feldvorschlag repariert (Eval-Fall F-15, von 0/3 auf 3/3).
  // Er hilft aber nur dort, wo das Modell füllt — wer es von Hand einträgt, bekommt keinen
  // Hinweis. Geprüft wird deshalb hier, unabhängig davon, wer das Feld gefüllt hat.
  const empfaenger = draft.sections["3"]?.fields["recipients"]?.value;
  const nebenbestimmungen = draft.sections["6"]?.fields["ancillary"]?.value;
  if (Array.isArray(empfaenger) && empfaenger.length && typeof nebenbestimmungen === "string") {
    const kommunal = empfaenger.includes("municipal");
    const andere = empfaenger.some((e) => e !== "municipal");
    const soll = kommunal && andere ? "anbest-p-g" : kommunal ? "anbest-g" : "anbest-p";
    const name = (v: string) =>
      v === "anbest-p-g" ? "ANBest-P und ANBest-G" : v === "anbest-g" ? "ANBest-G" : "ANBest-P";
    if (nebenbestimmungen !== soll)
      raus.push({
        befund: {
          sectionId: "6", fieldId: "ancillary", severity: "warning",
          regel: "nebenbestimmungen_empfaengerkreis",
          rechtsstelle: "Anlagen 15 und 21 zu VV bzw. VVG Nr. 5.1 zu § 44 LHO",
          message:
            `Zum angegebenen Empfängerkreis passt ${name(soll)}, gewählt ist ` +
            `${name(nebenbestimmungen)}. ANBest-G gilt für Gemeinden und Gemeindeverbände, ` +
            `ANBest-P für die übrigen Zuwendungsempfangenden.`,
        },
      });
  }

  // Wer ANBest-P oder ANBest-G wählt, hat die Inventarisierung schon mitgewählt.
  //
  // Nummer 4 ANBest-P und ANBest-G verpflichten die Zuwendungsempfangenden, beschaffte
  // Gegenstände ab einem Anschaffungswert von 800 Euro zu inventarisieren. Die Richtlinie
  // kann davon abweichen — dann ist das aber eine Entscheidung und gehört begründet, nicht
  // als stilles „Nein" in ein Auswahlfeld.
  //
  // Der Anlass ist gemessen: Im Durchlauf vom 08.10.2026 schlug das Werkzeug in EINEM Aufruf
  // ANBest-P und „Inventarisierungspflicht: Nein" vor, mit dem Mustersatz zur 800-Euro-Grenze
  // als Fundstelle daneben. Zwei Vorschläge derselben Antwort, die sich widersprechen — und
  // keine Regel, die das bemerkt hätte.
  const inventar = draft.sections["6"]?.fields["inventory"]?.value;
  if (typeof nebenbestimmungen === "string" && nebenbestimmungen && inventar === "no")
    raus.push({
      befund: {
        sectionId: "6", fieldId: "inventory", severity: "warning",
        regel: "inventarisierung_gegen_anbest",
        rechtsstelle: "Nummer 4 ANBest-P und ANBest-G",
        message:
          "Die gewählten Allgemeinen Nebenbestimmungen verlangen die Inventarisierung " +
          "beschaffter Gegenstände ab 800 Euro Anschaffungswert. Ein Verzicht darauf weicht " +
          "von ihnen ab und ist zu begründen.",
      },
      vermerk: {
        adressat: "pruefvermerk", sectionId: "6", regel: "inventarisierung_gegen_anbest",
        rechtsstelle: "Nummer 4 ANBest-P und ANBest-G",
        beurteilung:
          "Inventarisierungspflicht abgewählt, obwohl die gewählten Allgemeinen " +
          "Nebenbestimmungen sie ab 800 Euro Anschaffungswert verlangen.",
        status: "offen",
      },
    });

  // Die Prüfrechte erst ab hier — und nur sie hängen daran, dass etwas angegeben ist.
  //
  // Dieser Ausstieg stand bis zum 24.09.2026 ganz oben in der Funktion und übersprang damit
  // alles Folgende: wer die Prüfberechtigten noch nicht ausgefüllt hatte, bekam auch keinen
  // Befund zu den Nebenbestimmungen. Ein Wächter, der auf einen unbeteiligten Wert wartet,
  // schweigt an der falschen Stelle.
  const stellen = draft.sections["6"]?.fields["auditRights"]?.value;
  if (!Array.isArray(stellen) || !stellen.length) return raus;

  const fehlend = PRUEFORGANE_LAND.filter((s) => !stellen.includes(s));
  if (fehlend.length) {
    const namen = fehlend
      .map((s) => (s === "lrh" ? "der Landesrechnungshof" : "das zuständige Ministerium"))
      .join(" und ");
    raus.push({
      befund: {
        sectionId: "6", fieldId: "auditRights", severity: "warning",
        regel: "pruefrechte_unvollstaendig",
        message:
          `Im Landesrecht sind der Landesrechnungshof und das zuständige Ministerium ` +
          `prüfberechtigt. Nicht angegeben ist ${namen}.`,
      },
    });
  }

  // Die Gegenrichtung, und sie fehlte.
  //
  // Geprüft wurde nur, ob eines der beiden Landesprüforgane FEHLT. Ein Vorschlag setzte
  // daraufhin auch den Bundesrechnungshof — bei einer reinen Landesförderung hat der kein
  // Prüfrecht, und niemand meldete es. Eine Regel, die nur in eine Richtung schaut, deckt
  // den halben Fehlerraum ab.
  //
  // Nur bei reiner Landesfinanzierung: sobald Bundesmittel im Spiel sind (GAK), sind die
  // Bundesorgane zu Recht dabei.
  const bundesorgane = stellen.filter((s) => s === "brh" || s === "bwb");
  if (!draft.profile.gak && bundesorgane.length) {
    const namen = bundesorgane
      .map((s) =>
        s === "brh"
          ? "der Bundesrechnungshof"
          : "die Bundesbeauftragte für Wirtschaftlichkeit in der Verwaltung",
      )
      .join(" und ");
    raus.push({
      befund: {
        sectionId: "6", fieldId: "auditRights", severity: "warning",
        regel: "pruefrechte_bund_ohne_bundesmittel",
        message:
          `${namen} ist bei reiner Landesfinanzierung nicht prüfberechtigt. ` +
          `Prüfen Sie, ob Bundesmittel beteiligt sind.`,
      },
    });
  }

  return raus;
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
  // umgesetzt. Die technische Umsetzung im nationalen Bereich schreitet schrittweise voran;
  // das Vorschussprinzip ist dort noch nicht abgebildet.
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

  // Das Ministerium als Bewilligungsbehörde.
  //
  // Der Fall aus dem Durchlauf vom 24.09.2026, und er ist lehrreich: der Vorschlagsdienst
  // setzte „Ministerium für Landwirtschaft, Umwelt und Verbraucherschutz" und wies als
  // Deckung den TITEL der Richtlinie aus — „Richtlinie des Ministeriums für …". Das Zitat
  // war echt und stand wörtlich in der Eingabe. Es sagt nur über die Bewilligungsbehörde
  // nichts: wer eine Richtlinie erlässt, bewilligt nach ihr nicht.
  //
  // Warnung und nicht Fehler: das Ministerium KANN im Einzelfall selbst bewilligen. Die
  // Regel stellt fest, was fast immer ein Übernahmefehler ist, und überlässt die
  // Entscheidung dem Fachreferat.
  const stelle = feld("authority");
  const geber = draft.sections["0"]?.fields["title"]?.value;
  if (
    typeof stelle === "string" && stelle.trim() &&
    /ministerium|ministeriums/i.test(stelle) &&
    typeof geber === "string" && geber.toLowerCase().includes(stelle.trim().toLowerCase())
  )
    raus.push({
      befund: {
        sectionId: "7", fieldId: "authority", severity: "warning",
        regel: "bewilligungsbehoerde_ist_richtliniengeber",
        message:
          "Als Bewilligungsbehörde ist das Ministerium angegeben, das die Richtlinie " +
          "erlässt. Bewilligungsbehörde ist in der Regel eine nachgeordnete Behörde. " +
          "Prüfen Sie, ob das Ministerium hier wirklich selbst bewilligt.",
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

  // Deutsch geschrieben, und ohne die überflüssige Null: `toFixed(1)` allein ergab „rund 5.0
  // Jahre" — ein englischer Dezimalpunkt in einem Satz, der so ins Anschreiben ans
  // Finanzministerium geht. Halbe Jahre bleiben sichtbar („3,5"), volle stehen glatt da.
  const jahre = ((bis.valueOf() - von.valueOf()) / (365.2425 * 24 * 3600 * 1000))
    .toFixed(1)
    .replace(/\.0$/, "")
    .replace(".", ",");
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
/** Die europäischen Instrumente, auf die eine beihilferechtliche Grundlage lauten kann. */
const BEIHILFE_INSTRUMENTE =
  /AGVO|AgrarGVO|FIBER|De-?minimis|Agrarrahmen|Freistellung|Notifizierung|Beihilfe|AEUV|Verordnung \(EU\)|Leitlinien/i;

/**
 * Die beihilferechtliche Rechtsgrundlage, die keine ist.
 *
 * Im Durchlauf vom 24.09.2026 stand im Feld „Beihilferechtliche Rechtsgrundlage": „§ 44 LHO
 * in Verbindung mit den Verwaltungsvorschriften zur Landeshaushaltsordnung." Das ist die
 * zuwendungsrechtliche Grundlage — sie steht ein Feld höher und sagt über das Beihilferecht
 * nichts. Beihilferecht ist Unionsrecht: AGVO, AgrarGVO, De-minimis, Agrarrahmen oder eine
 * Notifizierung.
 *
 * Warnung und nicht Fehler: ob überhaupt ein Beihilfebezug besteht, entscheidet das
 * Fachreferat. Wer aber etwas einträgt, soll nicht das Falsche eintragen.
 */
export function pruefeBeihilfegrundlage(draft: RichtlinieDraft): Pruefergebnis[] {
  const wert = draft.sections["1"]?.fields["stateAidBasis"]?.value;
  if (typeof wert !== "string" || !wert.trim()) return [];
  if (BEIHILFE_INSTRUMENTE.test(wert)) return [];
  return [{
    befund: {
      sectionId: "1", fieldId: "stateAidBasis", severity: "warning",
      regel: "beihilfegrundlage_ohne_unionsrecht",
      message:
        "Die beihilferechtliche Rechtsgrundlage nennt kein europäisches Instrument. " +
        "§ 44 LHO und die Verwaltungsvorschriften sind die zuwendungsrechtliche " +
        "Grundlage; beihilferechtlich kommen AGVO, AgrarGVO, De-minimis, der Agrarrahmen " +
        "oder eine Notifizierung in Betracht. Besteht kein Beihilfebezug, lassen Sie das " +
        "Feld leer.",
    },
  }];
}

/**
 * Die Höchstbeträge der De-minimis-Verordnungen.
 *
 * Aus dem Korpus belegt, nicht gesetzt: Die allgemeine Verordnung (EU) 2023/2831 nennt
 * 300 000 Euro in drei Jahren — so in der Musterrichtlinie, in der VV Vertragsnaturschutz
 * Wald, in der RL Jagdabgabe und in der Muster-Bescheinigung. Die Agrar-De-minimis-Verordnung
 * nennt 50 000 Euro, im Verordnungstext selbst.
 *
 * Das Formular unterscheidet die beiden nicht — es kennt eine Option „De-minimis". Welche
 * Verordnung gilt, hängt am Sektor und entscheidet das Fachreferat. Deshalb zwei Stufen:
 * über 300 000 ist es in jedem Fall zu viel, über 50 000 nur dann, wenn die Agrarverordnung
 * einschlägig ist — und das ist eine Frage, kein Befund.
 */
const DE_MINIMIS_ALLGEMEIN_EUR = 300_000;
const DE_MINIMIS_AGRAR_EUR = 50_000;

/**
 * Beihilferechtliche Obergrenzen gegen den angegebenen Höchstbetrag halten.
 *
 * Vier Regeln des Prozessmodells verlangen dasselbe (M28, M38, M51, M57): Die Festlegung der
 * Förderhöchstsätze hat die Schranken des Beihilferechts zu beachten. Geprüft wurde bisher
 * nur, ob der Fördersatz über 100 Prozent liegt und ob der kommunale Höchstsatz eingehalten
 * ist — die beihilferechtliche Grenze kannte das Werkzeug nicht.
 *
 * Für die AGVO steht hier KEINE Zahl. Ihre Beihilfeintensitäten hängen am einschlägigen
 * Artikel und schwanken zwischen den Fördertatbeständen; im Korpus steht keine allgemeine
 * Grenze, und eine geratene wäre schlimmer als keine. Geprüft wird dort nur, dass überhaupt
 * eine Obergrenze angegeben ist.
 */
export function pruefeBeihilfegrenzen(draft: RichtlinieDraft): Pruefergebnis[] {
  const raus: Pruefergebnis[] = [];
  const regime = draft.sections["4"]?.fields["aidRegime"]?.value;
  if (!Array.isArray(regime) || !regime.length) return raus;
  const hoechst = draft.sections["5"]?.fields["maximum"]?.value;
  const betrag = typeof hoechst === "number" ? hoechst : null;

  if (regime.includes("de-minimis")) {
    if (betrag !== null && betrag > DE_MINIMIS_ALLGEMEIN_EUR)
      raus.push({
        befund: {
          sectionId: "5", fieldId: "maximum", severity: "error",
          regel: "de_minimis_hoechstbetrag",
          rechtsstelle: "Artikel 3 Absatz 2 Verordnung (EU) 2023/2831",
          message:
            `Der Höchstbetrag von ${betrag.toLocaleString("de-DE")} Euro übersteigt die ` +
            `De-minimis-Grenze von ${DE_MINIMIS_ALLGEMEIN_EUR.toLocaleString("de-DE")} Euro ` +
            `je Unternehmen in drei Jahren.`,
        },
      });
    else if (betrag !== null && betrag > DE_MINIMIS_AGRAR_EUR)
      raus.push({
        befund: {
          sectionId: "5", fieldId: "maximum", severity: "warning",
          regel: "de_minimis_agrar_pruefen",
          rechtsstelle: "Artikel 3 Absatz 2 der Agrar-De-minimis-Verordnung",
          message:
            `Für Beihilfen im Agrarsektor gilt eine De-minimis-Grenze von ` +
            `${DE_MINIMIS_AGRAR_EUR.toLocaleString("de-DE")} Euro in drei Jahren. Der ` +
            `angegebene Höchstbetrag liegt darüber — bitte prüfen, welche Verordnung gilt.`,
        },
      });
  }

  // Freistellung ohne Obergrenze: Die Intensität steht im einschlägigen Artikel, hier fehlt
  // jede Angabe, an der sie sich messen ließe.
  const satz = draft.sections["5"]?.fields["fundingRate"]?.value;
  const freistellung = regime.includes("agvo") || regime.includes("agrar-gvo");
  if (freistellung && betrag === null && typeof satz !== "number")
    raus.push({
      befund: {
        sectionId: "5", fieldId: "maximum", severity: "warning",
        regel: "freistellung_ohne_obergrenze",
        rechtsstelle: "AGVO bzw. AgrarGVO, einschlägiger Artikel",
        message:
          "Bei einer Förderung nach AGVO oder AgrarGVO ist die zulässige Beihilfeintensität " +
          "des einschlägigen Artikels einzuhalten. Weder Fördersatz noch Höchstbetrag sind " +
          "angegeben — damit lässt sich das nicht beurteilen.",
      },
    });
  return raus;
}

/**
 * Ob überhaupt eine Beihilfe vorliegt, ist immer zu prüfen (M18).
 *
 * Das Prozessmodell notiert dazu: „ist immer gegeben (Art. 107 ist immer zu prüfen)". Das
 * Werkzeug hat die Frage bisher nur beantwortet, wenn jemand eine Grundlage eingetragen hat —
 * wer das Feld leer ließ, bekam gar nichts. Ein nicht geprüfter Beihilfebezug ist aber der
 * teurere Fehler: Er führt zur Rückforderung, nicht zu einer Nachfrage.
 *
 * Kein Befund, wenn das Fachreferat die Frage verneint hat — dafür ist `stateAid` im Profil da.
 */
export function pruefeBeihilfepruefung(draft: RichtlinieDraft): Pruefergebnis[] {
  if (!draft.profile.stateAid) return [];
  const grundlage = draft.sections["1"]?.fields["stateAidBasis"]?.value;
  const regime = draft.sections["4"]?.fields["aidRegime"]?.value;
  const hatGrundlage = typeof grundlage === "string" && grundlage.trim().length > 0;
  const hatRegime = Array.isArray(regime) && regime.length > 0;
  if (hatGrundlage || hatRegime) return [];
  return [{
    befund: {
      sectionId: "4", fieldId: "aidRegime", severity: "warning",
      regel: "beihilfepruefung_fehlt",
      rechtsstelle: "Artikel 107 AEUV",
      message:
        "Der Entwurf ist als beihilferelevant gekennzeichnet, nennt aber weder eine " +
        "beihilferechtliche Grundlage noch eine Einordnung. Ob eine Beihilfe vorliegt, ist " +
        "in jedem Verfahren zu prüfen.",
    },
  }];
}

/**
 * Bemessungsgrundlage und Finanzierungsart müssen zusammenpassen (M54, M60).
 *
 * Die Festbetragsfinanzierung fördert mit einem festen Betrag — eine Spitzabrechnung der
 * tatsächlich entstandenen Kosten widerspricht ihr. Umgekehrt braucht die Anteilfinanzierung
 * eine Bezugsgröße, an der der Anteil bemessen wird; feste Beträge sind keine.
 *
 * Ziff. 2.2.3 und 2.3 der VV zu § 44 LHO. Das Prozessmodell führt beides als eigene
 * Prüfpunkte, geprüft wurde bisher keiner von beiden.
 */
export function pruefeBemessungsgrundlage(draft: RichtlinieDraft): Pruefergebnis[] {
  const art = draft.sections["5"]?.fields["financingType"]?.value;
  const grundlage = draft.sections["5"]?.fields["eligibleBasis"]?.value;
  if (typeof art !== "string" || typeof grundlage !== "string" || !art || !grundlage)
    return [];
  const feste = grundlage.startsWith("fixed");
  const spitz = grundlage.startsWith("actual");
  if (art === "fixed" && spitz)
    return [{
      befund: {
        sectionId: "5", fieldId: "eligibleBasis", severity: "warning",
        regel: "bemessung_passt_nicht_zur_finanzierungsart",
        rechtsstelle: "Ziff. 2.2.3 der VV zu § 44 LHO",
        message:
          "Die Festbetragsfinanzierung gewährt einen festen Betrag. Eine Spitzabrechnung " +
          "der tatsächlich entstandenen Ausgaben passt dazu nicht — in Betracht kommen " +
          "feste Beträge.",
      },
    }];
  if (art === "share" && feste)
    return [{
      befund: {
        sectionId: "5", fieldId: "eligibleBasis", severity: "warning",
        regel: "bemessung_passt_nicht_zur_finanzierungsart",
        rechtsstelle: "Ziff. 2.2.1 und 2.3 der VV zu § 44 LHO",
        message:
          "Die Anteilfinanzierung bemisst die Zuwendung als Anteil der zuwendungsfähigen " +
          "Ausgaben. Feste Beträge geben dafür keine Bezugsgröße her.",
      },
    }];
  return [];
}

/**
 * Im Pilotumfang gibt es nur die Projektförderung (M20, M29).
 *
 * Das Prozessmodell hält fest: „Hier nur Projektförderung" und „Es ist immer eine
 * Projektförderung unter Ziffer 5.1 anzugeben". Die institutionelle Förderung nach Ziff. 2.1
 * der VV zu § 44 LHO ist etwas anderes — sie deckt den Betrieb einer Einrichtung und hat
 * eigene Regeln, die dieses Werkzeug nicht kennt.
 *
 * Erkannt wird sie an der Vollfinanzierung ohne wirtschaftliches Interesse: Das ist die
 * Konstellation, in der eine institutionelle Förderung verdeckt entsteht.
 */
export function pruefeZuwendungsart(draft: RichtlinieDraft): Pruefergebnis[] {
  if (draft.profile.fundingType === "project") return [];
  return [{
    befund: {
      sectionId: "5", fieldId: "financingType", severity: "warning",
      regel: "nur_projektfoerderung",
      rechtsstelle: "Ziff. 2.1 der VV zu § 44 LHO",
      message:
        "Das Werkzeug deckt im Pilotumfang nur die Projektförderung ab. Für eine " +
        "institutionelle Förderung gelten eigene Regeln, die hier nicht geprüft werden.",
    },
  }];
}

/**
 * Weiterleitung an Dritte zieht eine eigene Prüfung nach sich (M26).
 *
 * Das Prozessmodell notiert: „wenn LHO, dann Weiterleitung erlaubt? Dann Prüfung nach …".
 * Gemeint ist Nummer 12 der VV zu § 44 LHO — wer weiterleitet, muss die Weitergabe in der
 * Richtlinie regeln: an wen, zu welchem Zweck, mit welchen Pflichten. Ohne diese Regeln ist
 * die Weiterleitung zugelassen, aber nicht bestimmt.
 */
export function pruefeWeiterleitung(draft: RichtlinieDraft): Pruefergebnis[] {
  const erlaubt = draft.sections["3"]?.fields["forwarding"]?.value;
  if (erlaubt !== "yes") return [];
  const regeln = draft.sections["3"]?.fields["forwardingRules"]?.value;
  if (typeof regeln === "string" && regeln.trim().length > 0) return [];
  return [{
    befund: {
      sectionId: "3", fieldId: "forwardingRules", severity: "error",
      regel: "weiterleitung_ohne_regeln",
      rechtsstelle: "Nummer 12 der VV zu § 44 LHO",
      message:
        "Die Weiterleitung an Dritte ist zugelassen, aber nicht geregelt. Anzugeben sind " +
        "der Kreis der Letztempfangenden, der Zweck der Weitergabe und die Pflichten, die " +
        "die Zuwendungsempfangenden weiterzugeben haben.",
    },
  }];
}

/**
 * Der vorzeitige Vorhabenbeginn ist eine Abweichung und gehört begründet (M22).
 *
 * Variante 1 ist der Grundsatz des § 44 LHO: gefördert wird nur, was noch nicht begonnen hat.
 * Variante 2 lässt den Beginn mit der Antragstellung zu, ohne Genehmigung — das ist die
 * Ausnahme, und sie steht dem Grundsatz der Erforderlichkeit entgegen: Wer ohne Zuwendung
 * anfängt, zeigt, dass er sie nicht braucht.
 */
export function pruefeVorhabenbeginn(draft: RichtlinieDraft): Pruefergebnis[] {
  const wahl = draft.sections["7"]?.fields["earlyStart"]?.value;
  if (wahl !== "variant-2") return [];
  return [{
    befund: {
      sectionId: "7", fieldId: "earlyStart", severity: "warning",
      regel: "vorzeitiger_beginn_ohne_genehmigung",
      rechtsstelle: "Ziff. 1.3 der VV zu § 44 LHO",
      message:
        "Der Beginn mit der Antragstellung ohne Genehmigung weicht vom Grundsatz ab, dass " +
        "nur noch nicht begonnene Vorhaben gefördert werden. Die Abweichung ist zu begründen.",
    },
    vermerk: {
      adressat: "pruefvermerk", sectionId: "7",
      regel: "vorzeitiger_beginn_ohne_genehmigung",
      rechtsstelle: "Ziff. 1.3 der VV zu § 44 LHO",
      beurteilung:
        "Vorhabenbeginn mit Antragstellung zugelassen, ohne Genehmigung des vorzeitigen " +
        "Vorhabenbeginns.",
      status: "offen",
    },
  }];
}

/**
 * Beihilfen über 100 000 Euro sind zu veröffentlichen (M49).
 *
 * Das Prozessmodell nennt bei den zu beachtenden Vorschriften ausdrücklich die
 * „europarechtlichen Veröffentlichungspflichten". Sie treffen nicht das Verfahren, sondern
 * die Richtlinie: Wer eine Einzelbeihilfe oberhalb der Schwelle zulässt, muss sie in der
 * Transparenzdatenbank veröffentlichen, und darauf ist in Baustein 7 hinzuweisen.
 *
 * Die Schwelle steht in der AGVO und in den Agrarbeihilfevorschriften bei 100 000 Euro.
 * Geprüft wird deshalb nur, wo eine Freistellung gewählt UND ein Höchstbetrag darüber
 * angegeben ist — ohne Höchstbetrag ist nichts zu messen.
 */
const VEROEFFENTLICHUNG_AB_EUR = 100_000;

export function pruefeVeroeffentlichung(draft: RichtlinieDraft): Pruefergebnis[] {
  const regime = draft.sections["4"]?.fields["aidRegime"]?.value;
  if (!Array.isArray(regime) || !regime.some((r) => r === "agvo" || r === "agrar-gvo"))
    return [];
  const hoechst = draft.sections["5"]?.fields["maximum"]?.value;
  if (typeof hoechst !== "number" || hoechst <= VEROEFFENTLICHUNG_AB_EUR) return [];
  const vorschriften = draft.sections["6"]?.fields["otherConditions"]?.value;
  if (typeof vorschriften === "string" && /ver(ö|oe)ffentlich|transparenz/i.test(vorschriften))
    return [];
  return [{
    befund: {
      sectionId: "6", fieldId: "otherConditions", severity: "warning",
      regel: "veroeffentlichungspflicht_fehlt",
      rechtsstelle: "Artikel 9 AGVO bzw. Artikel 9 AgrarGVO",
      message:
        `Bei Einzelbeihilfen über ${VEROEFFENTLICHUNG_AB_EUR.toLocaleString("de-DE")} Euro ` +
        "bestehen europarechtliche Veröffentlichungspflichten. In den Zuwendungsbestimmungen " +
        "ist darauf hinzuweisen.",
    },
  }];
}

export function pruefeFachlich(draft: RichtlinieDraft): Pruefergebnis[] {
  const rgl = draft.sections["1"]?.fields["legalBasis"]?.value;
  const immer = [
    ...pruefeZuwendungsform(draft),
    ...pruefeEmpfaengerkreis(draft),
    ...pruefeBeihilfegrundlage(draft),
    // Die Regeln des Prozessmodells, die bis zum 09.10.2026 nur dort standen und nirgends
    // geprüft wurden — siehe 02_backend/regeln.yaml.
    ...pruefeBeihilfegrenzen(draft),
    ...pruefeBeihilfepruefung(draft),
    ...pruefeVeroeffentlichung(draft),
    ...pruefeBemessungsgrundlage(draft),
    ...pruefeZuwendungsart(draft),
    ...pruefeWeiterleitung(draft),
    ...pruefeVorhabenbeginn(draft),
  ];
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

/**
 * Die Sicht auf den Prüfvermerk, wie der Dienst sie liefert.
 *
 * `vollstaendig` ist die Aussage, auf die es ankommt: solange ein Eintrag offen oder
 * beantwortet-aber-unbestätigt ist, fehlt dem MdFE-Anschreiben eine Begründung — und ohne
 * die ist die Richtlinie nicht einreichungsreif.
 */
export interface VermerkSicht {
  eintraege: VermerkEintrag[];
  offen: number;
  unbestaetigt: number;
  vollstaendig: boolean;
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
