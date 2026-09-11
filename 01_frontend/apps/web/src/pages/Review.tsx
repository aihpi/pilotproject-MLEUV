import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { sections as sectionDefinitions } from "@richtlinie/shared";
import { api } from "../api";
import { Alert, PageHeader, ProcessSteps } from "../components";

export function ReviewPage() {
  const { id = "" } = useParams();
  const { data: draft } = useQuery({
    queryKey: ["draft", id],
    queryFn: () => api.draft(id),
  });
  if (!draft) return <p role="status">Prüfung wird geladen …</p>;
  const errors = draft.validation.issues.filter(
    (issue) => issue.severity === "error",
  );
  const warnings = draft.validation.issues.filter(
    (issue) => issue.severity === "warning",
  );
  return (
    <>
      <ProcessSteps stage={1} />
      <PageHeader
        eyebrow="Abschluss · Stufe 1"
        title="Inhalte für den RL-Entwurf prüfen"
      >
        <p className="lead">
          Prüfen Sie offene Pflichtangaben. Anschließend erzeugt der Assistent
          einen nachvollziehbaren Richtlinienentwurf mit Fundstellen und
          Formulierungsbegründungen.
        </p>
      </PageHeader>
      {errors.length ? (
        <Alert kind="error" title={`${errors.length} Pflichtangaben fehlen`}>
          <p>
            Sie können fehlende Angaben jetzt ergänzen oder Stufe 2 als
            Arbeitsstand öffnen. Platzhalter bleiben dort deutlich
            gekennzeichnet.
          </p>
          <ul>
            {errors.map((issue, index) => (
              <li key={`${issue.fieldId}-${index}`}>
                <Link
                  to={`/entwurf/${id}/abschnitt/${issue.sectionId}#${issue.fieldId}`}
                >
                  {issue.message}
                </Link>
              </li>
            ))}
          </ul>
        </Alert>
      ) : (
        <Alert kind="success" title="Alle Pflichtangaben sind vorhanden">
          <p>
            Der konkrete RL-Entwurf kann jetzt erzeugt und redaktionell geprüft
            werden. Eine fachliche und rechtliche Freigabe ist weiterhin
            erforderlich.
          </p>
        </Alert>
      )}
      {warnings.length > 0 && (
        <Alert kind="warning" title="Fachliche Prüfhinweise">
          <ul>
            {warnings.map((issue, index) => (
              <li key={index}>
                {issue.message}
                {/* Ein Prüfhinweis ohne Rechtsstelle ist eine Meinung. Mit ihr ist er
                    nachprüfbar — und genau das erwartet eine Verwaltung. */}
                {(issue.rechtsstelle || issue.fundstelle) && (
                  <span className="befund__stelle">
                    {issue.rechtsstelle}
                    {issue.rechtsstelle && issue.fundstelle ? " · " : ""}
                    {issue.fundstelle}
                  </span>
                )}
                {issue.belegzitat && (
                  <span className="befund__stelle">
                    <q>{issue.belegzitat}</q>
                  </span>
                )}
              </li>
            ))}
          </ul>
        </Alert>
      )}
      <section>
        <h2>Was in Stufe 2 passiert</h2>
        <ol className="handoff-list">
          <li>
            <strong>Der Assistent formuliert</strong>
            <span>Alle elf Bausteine werden zu einem RL-Text zusammengesetzt.</span>
          </li>
          <li>
            <strong>Quellen bleiben sichtbar</strong>
            <span>
              Jeder Absatz zeigt Formulierungsgrund, RAG-Findings und
              Fundstellen.
            </span>
          </li>
          <li>
            <strong>Sie entscheiden</strong>
            <span>
              KI-Rückfragen und Vorschläge werden erst nach Ihrer begründeten
              Entscheidung in den RL-Text übernommen.
            </span>
          </li>
        </ol>
      </section>
      <div className="actions actions--between">
        <Link className="button button--secondary" to={`/entwurf/${id}`}>
          Zur Aufgabenliste
        </Link>
        <Link className="button button--primary" to={`/entwurf/${id}/redaktion`}>
          {errors.length
            ? "RL-Entwurf als Arbeitsstand öffnen"
            : "RL-Entwurf erzeugen und öffnen"}
        </Link>
      </div>
    </>
  );
}

type PreviewSection = {
  id: string;
  title: string;
  paragraphs: { label: string; value: unknown }[];
};
type EditorStatus =
  | "ai-draft"
  | "changed"
  | "checking"
  | "checked"
  | "needs-review";
type ParagraphOrigin = "template" | "rag" | "user" | "ai-suggestion";
type RagSource = {
  id: string;
  title: string;
  locator: string;
  excerpt: string;
  score: number;
};
type EditorParagraph = {
  id: string;
  label: string;
  text: string;
  rationale: string;
  origin: ParagraphOrigin;
  sources: RagSource[];
};
type SuggestionStatus = "question" | "ready" | "accepted" | "rejected";
type AiSuggestion = {
  id: string;
  title: string;
  finding: string;
  question: string;
  answer: string;
  proposedText: string;
  decisionReason: string;
  status: SuggestionStatus;
  sources: RagSource[];
};
type EditorSection = {
  id: string;
  title: string;
  paragraphs: EditorParagraph[];
  suggestions: AiSuggestion[];
  status: EditorStatus;
  issues: string[];
};

const statusLabels: Record<EditorStatus, string> = {
  "ai-draft": "KI-Entwurf",
  changed: "Von Ihnen geändert",
  checking: "KI prüft …",
  checked: "KI-geprüft",
  "needs-review": "Prüfhinweis",
};
const originLabels: Record<ParagraphOrigin, string> = {
  template: "Mustersatz",
  rag: "RAG-gestützt",
  user: "Aus Ihrer Angabe",
  "ai-suggestion": "Übernommener KI-Vorschlag",
};
const sectionRationales: Record<string, string> = {
  "0": "Der Titel und die Präambel schaffen den politischen und fachlichen Rahmen, ohne neue Fördervoraussetzungen einzuführen.",
  "1": "Förderziel und Zuwendungszweck werden getrennt. Der Ermessensvorbehalt folgt dem hinterlegten Mustersatz.",
  "2": "Die bestätigten Maßnahmen werden als bestimmbarer Fördergegenstand formuliert.",
  "3": "Die Zielgruppen werden nach Rechtsnatur und Förderberechtigung geordnet.",
  "4": "Die Voraussetzungen werden als kumulative Bedingungen formuliert; fachliche Entscheidungen werden nicht ergänzt.",
  "5": "Finanzierungsart, -form und Bemessungsgrundlage werden in einer einheitlichen Regelungslogik verbunden.",
  "6": "Nebenbestimmungen, Prüfrechte und Zweckbindung werden getrennt ausgewiesen, damit Abweichungen nachvollziehbar bleiben.",
  "7": "Antrag, Bewilligung, Auszahlung und Nachweis werden chronologisch geordnet.",
  "8": "Die bestätigten Daten werden ohne Schätzung als Inkraft- und Außerkrafttreten übernommen.",
  "9": "Optionale Inhalte werden nur verwendet, wenn hierfür bestätigte Angaben vorliegen.",
  "10": "Ort, Datum und zeichnende Stelle werden in eine formelle Schlussformel überführt.",
};
const openings: Record<string, string> = {
  "0": "Das Land erlässt folgende Richtlinie zur Gewährung von Zuwendungen.",
  "1": "Das Land gewährt Zuwendungen nach Maßgabe dieser Richtlinie und der einschlägigen haushaltsrechtlichen Bestimmungen. Ein Anspruch auf Gewährung der Zuwendung besteht nicht; die Bewilligungsbehörde entscheidet aufgrund pflichtgemäßen Ermessens im Rahmen der verfügbaren Haushaltsmittel.",
  "2": "Gegenstand der Förderung sind die nachfolgend bestimmten Maßnahmen und Vorhaben.",
  "3": "Zuwendungsempfangende im Sinne dieser Richtlinie sind die nachfolgend bestimmten Personen und Einrichtungen.",
  "4": "Eine Zuwendung kann nur gewährt werden, wenn die nachfolgenden Voraussetzungen erfüllt sind.",
  "5": "Die Zuwendung wird im Wege der Projektförderung nach den nachfolgenden Maßgaben gewährt.",
  "6": "Für die Bewilligung gelten die nachfolgend bestimmten Nebenbestimmungen und Nachweispflichten.",
  "7": "Für Antragstellung, Bewilligung, Auszahlung und Verwendungsnachweis gilt das nachfolgende Verfahren.",
  "8": "Diese Richtlinie tritt zu dem nachfolgend bestimmten Zeitpunkt in Kraft und außer Kraft.",
  "9": "Ergänzend gelten die nachfolgend aufgeführten Bestimmungen und Anlagen.",
  "10": "Diese Richtlinie wird durch die zuständige oberste Landesbehörde bekannt gegeben.",
};

function displayValue(value: unknown) {
  return Array.isArray(value) ? value.join(", ") : String(value ?? "");
}

function sourcesFor(sectionId: string, label: string): RagSource[] {
  const sourceMap: Record<string, [string, string, string]> = {
    "0": ["Redaktionsleitfaden für Förderrichtlinien", "Teil A, Nr. 1.1", "Titel und Präambel sollen Regelungsgegenstand und politisches Ziel eindeutig benennen."],
    "1": ["Musterförderrichtlinie Projektförderung", "Baustein 1.1–1.3", "Förderziel, Zuwendungszweck und Ermessensvorbehalt sind getrennt und nachvollziehbar darzustellen."],
    "2": ["Fachkonzept zur Fördermaßnahme", "Kapitel 3 · Fördergegenstand", "Förderfähige Maßnahmen müssen abschließend oder durch überprüfbare Merkmale bestimmbar sein."],
    "3": ["Prüfschema Zuwendungsempfangende", "Prüffeld 2.1", "Der persönliche Anwendungsbereich ist nach Rechtsnatur, Größe und wirtschaftlicher Tätigkeit abzugrenzen."],
    "4": ["Fachliche Förderkonzeption", "Kapitel 4 · Voraussetzungen", "Voraussetzungen müssen zum Zeitpunkt der Bewilligung objektiv feststellbar sein."],
    "5": ["Musterförderrichtlinie Projektförderung", "Baustein 5.1–5.7", "Finanzierungsart, Finanzierungsform, Bemessungsgrundlage und Höchstbetrag sind konsistent festzulegen."],
    "6": ["Mustersammlung Nebenbestimmungen", "Baustein 6.2 · Zweckbindung", "Für langlebige Investitionen ist eine angemessene Zweckbindungsfrist festzulegen und zu überwachen."],
    "7": ["Verfahrensleitfaden Zuwendungen", "Kapitel 7 · Bewilligungsverfahren", "Antrag, Auswahl, Bewilligung, Auszahlung und Verwendungsnachweis sollen chronologisch geregelt werden."],
    "8": ["Redaktionsleitfaden für Förderrichtlinien", "Teil C, Nr. 8", "Inkrafttreten und Befristung sind mit eindeutigen Kalenderdaten auszuweisen."],
    "9": ["Anlagenverzeichnis Musterrichtlinie", "Gliederungspunkt 9", "Technische Anforderungen und Berechnungsmethoden können in eindeutig bezeichnete Anlagen ausgelagert werden."],
    "10": ["Formalia für Verwaltungsvorschriften", "Schlussformel 2", "Schlussformel, Ort, Datum und zeichnende Stelle müssen die Bekanntgabe eindeutig abschließen."],
  };
  const [title, locator, excerpt] = sourceMap[sectionId] ?? sourceMap["0"]!;
  return [
    {
      id: `${sectionId}-${label}-primary`,
      title,
      locator,
      excerpt,
      score: 0.94,
    },
    {
      id: `${sectionId}-${label}-input`,
      title: "Bestätigte Angaben aus Stufe 1",
      locator: `Feld „${label}“`,
      excerpt: "Vom Fachbereich bestätigt und für die Formulierung freigegeben.",
      score: 1,
    },
  ];
}

function sectionSixSuggestions(): AiSuggestion[] {
  const source = sourcesFor("6", "Zweckbindungsfrist")[0]!;
  return [
    {
      id: "purpose-period",
      title: "Zweckbindungsfrist konkretisieren",
      finding:
        "RAG-Finding: Der Fördergegenstand enthält langlebige bauliche Anlagen. Im aktuellen RL-Text fehlt eine konkrete Zweckbindungsfrist.",
      question:
        "Welche Zweckbindungsfrist soll für bauliche Anlagen und technische Einrichtungen gelten?",
      answer: "Zwölf Jahre ab Abschlusszahlung.",
      proposedText:
        "Die geförderten baulichen Anlagen und technischen Einrichtungen sind ab dem Zeitpunkt der Abschlusszahlung mindestens zwölf Jahre zweckentsprechend zu nutzen.",
      decisionReason: "",
      status: "ready",
      sources: [source],
    },
    {
      id: "monitoring-report",
      title: "Nachweis zum Monitoring ergänzen",
      finding:
        "RAG-Finding: Die Erfolgskontrolle nennt messbare Wirkungsindikatoren, Abschnitt 6 enthält aber noch keine Berichtspflicht.",
      question:
        "In welchem Rhythmus sollen Zuwendungsempfangende die Wirkungsindikatoren melden?",
      answer: "",
      proposedText:
        "Die Zuwendungsempfangenden legen der Bewilligungsbehörde jährlich einen Bericht zu den festgelegten Wirkungsindikatoren vor.",
      decisionReason: "",
      status: "question",
      sources: [
        {
          ...source,
          id: "6-monitoring-primary",
          title: "Prüfschema Erfolgskontrolle",
          locator: "Prüffeld 6.4 · Berichtspflichten",
          excerpt:
            "Messbare Wirkungsindikatoren benötigen einen festgelegten Erhebungs- und Berichtszyklus.",
          score: 0.89,
        },
      ],
    },
  ];
}

function makeEditorSections(preview: PreviewSection[]): EditorSection[] {
  const byId = new Map(preview.map((section) => [section.id, section]));
  return sectionDefinitions.map((definition) => {
    const source = byId.get(definition.id) ?? {
      id: definition.id,
      title: definition.title,
      paragraphs: [],
    };
    const valueParagraphs: EditorParagraph[] = source.paragraphs
      .filter((paragraph) => paragraph.value !== "" && paragraph.value != null)
      .map((paragraph, index) => ({
        id: `${definition.id}-field-${index}`,
        label: paragraph.label,
        text: `${paragraph.label}: ${displayValue(paragraph.value)}.`,
        rationale: `Die bestätigte Angabe „${paragraph.label}“ wurde in eine eindeutige, prüfbare Satzform überführt. Inhaltliche Begriffe wurden nicht erweitert.`,
        origin: "rag",
        sources: sourcesFor(definition.id, paragraph.label),
      }));
    const paragraphs: EditorParagraph[] = [
      {
        id: `${definition.id}-opening`,
        label: "Einleitender Mustersatz",
        text: openings[definition.id] ?? "",
        rationale:
          sectionRationales[definition.id] ??
          "Der Absatz strukturiert die bestätigten Angaben.",
        origin: "template",
        sources: sourcesFor(definition.id, "Einleitender Mustersatz").slice(0, 1),
      },
      ...(valueParagraphs.length
        ? valueParagraphs
        : [
            {
              id: `${definition.id}-missing`,
              label: "Offene fachliche Angabe",
              text: "[Ergänzung erforderlich: Für diesen Abschnitt liegen noch keine bestätigten Angaben vor.]",
              rationale:
                "Der Agent hat keine belastbare Angabe gefunden und erzeugt deshalb bewusst keinen Regelungsinhalt.",
              origin: "user" as ParagraphOrigin,
              sources: [],
            },
          ]),
    ];
    return {
      id: definition.id,
      title: definition.title,
      paragraphs,
      suggestions: definition.id === "6" ? sectionSixSuggestions() : [],
      status: "ai-draft",
      issues: [],
    };
  });
}

function DraftWorkspace({
  id,
  title,
  preview,
}: {
  id: string;
  title: string;
  preview: PreviewSection[];
}) {
  const storageKey = `rl-editor-v2-${id}`;
  const generated = useMemo(() => makeEditorSections(preview), [preview]);
  const [items, setItems] = useState<EditorSection[]>(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      return saved ? JSON.parse(saved) : generated;
    } catch {
      return generated;
    }
  });
  const [selected, setSelected] = useState(items[0]?.id ?? "0");
  const [activeParagraphId, setActiveParagraphId] = useState(
    items[0]?.paragraphs[0]?.id ?? "",
  );
  const [announcement, setAnnouncement] = useState(
    "Entwurf mit Begründungen und RAG-Fundstellen wurde erzeugt.",
  );
  const current =
    items.find((section) => section.id === selected) ?? items[0]!;
  const currentIndex = items.indexOf(current);
  const activeParagraph =
    current.paragraphs.find(
      (paragraph) => paragraph.id === activeParagraphId,
    ) ?? current.paragraphs[0]!;
  const changed = items.filter(
    (section) => section.status === "changed",
  ).length;
  const checked = items.filter(
    (section) => section.status === "checked",
  ).length;
  const hints = items.filter(
    (section) => section.status === "needs-review",
  ).length;
  const openSuggestions = items.flatMap((section) =>
    section.suggestions.filter(
      (suggestion) =>
        suggestion.status === "question" || suggestion.status === "ready",
    ),
  ).length;

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(items));
  }, [items, storageKey]);

  function selectSection(sectionId: string) {
    const section = items.find((item) => item.id === sectionId);
    setSelected(sectionId);
    setActiveParagraphId(section?.paragraphs[0]?.id ?? "");
  }

  function patchCurrent(patch: Partial<EditorSection>) {
    setItems((all) =>
      all.map((section) =>
        section.id === current.id ? { ...section, ...patch } : section,
      ),
    );
  }

  function patchParagraph(paragraphId: string, text: string) {
    patchCurrent({
      paragraphs: current.paragraphs.map((paragraph) =>
        paragraph.id === paragraphId
          ? { ...paragraph, text, origin: "user" }
          : paragraph,
      ),
      status: "changed",
      issues: [],
    });
  }

  function patchSuggestion(
    suggestionId: string,
    patch: Partial<AiSuggestion>,
  ) {
    patchCurrent({
      suggestions: current.suggestions.map((suggestion) =>
        suggestion.id === suggestionId
          ? { ...suggestion, ...patch }
          : suggestion,
      ),
    });
  }

  function answerSuggestion(suggestion: AiSuggestion) {
    if (!suggestion.answer.trim()) return;
    patchSuggestion(suggestion.id, { status: "ready" });
    setAnnouncement(
      `Antwort zur KI-Rückfrage „${suggestion.title}“ gespeichert. Der Formulierungsvorschlag ist bereit.`,
    );
  }

  function decideSuggestion(
    suggestion: AiSuggestion,
    decision: "accepted" | "rejected",
  ) {
    if (!suggestion.decisionReason.trim()) return;
    if (decision === "rejected") {
      patchSuggestion(suggestion.id, { status: "rejected" });
      setAnnouncement(`KI-Vorschlag „${suggestion.title}“ begründet abgelehnt.`);
      return;
    }
    const paragraph: EditorParagraph = {
      id: `accepted-${suggestion.id}`,
      label: suggestion.title,
      text: suggestion.proposedText,
      rationale: `Der KI-Vorschlag wurde nach fachlicher Prüfung übernommen. Dokumentierte Begründung: ${suggestion.decisionReason}`,
      origin: "ai-suggestion",
      sources: suggestion.sources,
    };
    patchCurrent({
      paragraphs: [...current.paragraphs, paragraph],
      suggestions: current.suggestions.map((item) =>
        item.id === suggestion.id
          ? { ...item, status: "accepted" }
          : item,
      ),
      status: "changed",
    });
    setActiveParagraphId(paragraph.id);
    setAnnouncement(
      `KI-Vorschlag „${suggestion.title}“ wurde als neuer Absatz in den RL-Text übernommen.`,
    );
  }

  function finishCheck(section: EditorSection): EditorSection {
    const hasPlaceholder = section.paragraphs.some((paragraph) =>
      paragraph.text.includes("[Ergänzung erforderlich"),
    );
    const issues = hasPlaceholder
      ? [
          "Der Abschnitt enthält noch einen Ergänzungsplatzhalter.",
          "Vor der Freigabe ist eine fachliche Angabe erforderlich.",
        ]
      : [];
    return {
      ...section,
      status: issues.length ? "needs-review" : "checked",
      issues,
    };
  }

  function checkOne() {
    const target = current.id;
    setItems((all) =>
      all.map((section) =>
        section.id === target
          ? { ...section, status: "checking", issues: [] }
          : section,
      ),
    );
    setAnnouncement(`Abschnitt ${target} wird durch die KI geprüft.`);
    window.setTimeout(() => {
      setItems((all) =>
        all.map((section) =>
          section.id === target ? finishCheck(section) : section,
        ),
      );
      setAnnouncement(`KI-Prüfung für Abschnitt ${target} abgeschlossen.`);
    }, 850);
  }

  function checkAll() {
    setItems((all) =>
      all.map((section) => ({ ...section, status: "checking", issues: [] })),
    );
    setAnnouncement("Der gesamte RL-Entwurf wird durch die KI geprüft.");
    window.setTimeout(() => {
      setItems((all) => all.map(finishCheck));
      setAnnouncement(
        "Gesamtprüfung abgeschlossen. Prüfpunkte sind an den Abschnitten markiert.",
      );
    }, 1100);
  }

  return (
    <>
      <ProcessSteps stage={2} />
      <PageHeader eyebrow="Stufe 2 · Evidence-to-Text" title={title}>
        <p className="lead">
          Prüfen Sie Richtlinientext, Formulierungsgrund und Fundstellen
          absatzweise. KI-Vorschläge werden erst nach Ihrer dokumentierten
          Entscheidung übernommen.
        </p>
      </PageHeader>
      <Alert kind="warning" title="RAG-Fundstellen im Mockup">
        <p>
          Die angezeigten Dokumente, Trefferwerte und Textauszüge sind
          realistische Demo-Daten. In der Produktivversion werden sie durch
          versionierte Fundstellen aus der freigegebenen Wissensbasis ersetzt.
        </p>
      </Alert>
      <div className="review-summary" aria-label="Bearbeitungsstatus">
        <div><strong>{items.length}</strong><span>RL-Abschnitte</span></div>
        <div><strong>{changed}</strong><span>geändert</span></div>
        <div><strong>{checked}</strong><span>KI-geprüft</span></div>
        <div><strong>{hints}</strong><span>mit Prüfhinweis</span></div>
        <div><strong>{openSuggestions}</strong><span>offene KI-Punkte</span></div>
        <button
          className="button button--primary"
          onClick={checkAll}
          disabled={items.some((section) => section.status === "checking")}
        >
          Gesamten Entwurf durch KI prüfen
        </button>
      </div>
      {openSuggestions > 0 && selected !== "6" && (
        <button className="suggestion-jump" onClick={() => selectSection("6")}>
          <strong>{openSuggestions} offene KI-Rückfragen und Vorschläge</strong>
          <span>In Abschnitt 6 ansehen →</span>
        </button>
      )}
      <div className="origin-legend" aria-label="Herkunft der Formulierungen">
        <strong>Herkunft im RL-Text:</strong>
        {(Object.keys(originLabels) as ParagraphOrigin[]).map((origin) => (
          <span className={`origin origin--${origin}`} key={origin}>
            {originLabels[origin]}
          </span>
        ))}
      </div>
      <p className="sr-status" role="status" aria-live="polite">
        {announcement}
      </p>
      <div className="editor-layout editor-layout--evidence">
        <aside className="section-nav">
          <h2>Abschnitte der Richtlinie</h2>
          <ol>
            {items.map((section) => {
              const suggestions = section.suggestions.filter(
                (suggestion) =>
                  suggestion.status === "question" ||
                  suggestion.status === "ready",
              ).length;
              return (
                <li key={section.id}>
                  <button
                    className={
                      section.id === current.id
                        ? "section-nav__item section-nav__item--current"
                        : "section-nav__item"
                    }
                    onClick={() => selectSection(section.id)}
                    aria-current={
                      section.id === current.id ? "true" : undefined
                    }
                  >
                    <span>
                      <strong>{section.id}. {section.title}</strong>
                      <small>
                        {statusLabels[section.status]}
                        {suggestions > 0 && ` · ${suggestions} KI-Punkte`}
                      </small>
                    </span>
                    <span
                      className={`status-dot status-dot--${section.status}`}
                      aria-hidden="true"
                    />
                  </button>
                </li>
              );
            })}
          </ol>
        </aside>
        <section className="editor-panel" aria-labelledby="editor-title">
          <header className="editor-panel__header">
            <div>
              <p className="eyebrow">Abschnitt {current.id} von 10</p>
              <h2 id="editor-title">{current.title}</h2>
            </div>
            <span className={`badge editor-badge badge--${current.status}`}>
              {statusLabels[current.status]}
            </span>
          </header>
          {current.issues.length > 0 && (
            <Alert
              kind="warning"
              title={`${current.issues.length} ${current.issues.length === 1 ? "Prüfpunkt" : "Prüfpunkte"}`}
            >
              <ul>
                {current.issues.map((issue) => <li key={issue}>{issue}</li>)}
              </ul>
            </Alert>
          )}
          {current.suggestions.length > 0 && (
            <section className="ai-review" aria-labelledby="ai-review-title">
              <header>
                <div>
                  <p className="eyebrow">Ergebnis der Backend-Prüfung</p>
                  <h3 id="ai-review-title">KI-Rückfragen und Vorschläge</h3>
                </div>
                <span className="badge badge--warning">
                  {current.suggestions.filter((suggestion) =>
                    suggestion.status === "question" ||
                    suggestion.status === "ready"
                  ).length} offen
                </span>
              </header>
              {current.suggestions.map((suggestion) => (
                <article className="ai-suggestion" key={suggestion.id}>
                  <div className="ai-suggestion__heading">
                    <div>
                      <span className="origin origin--ai-suggestion">
                        {suggestion.status === "question"
                          ? "Rückfrage"
                          : suggestion.status === "ready"
                            ? "Formulierungsvorschlag"
                            : suggestion.status === "accepted"
                              ? "Übernommen"
                              : "Abgelehnt"}
                      </span>
                      <h4>{suggestion.title}</h4>
                    </div>
                  </div>
                  <p className="finding"><strong>Finding:</strong> {suggestion.finding.replace("RAG-Finding: ", "")}</p>
                  <p><strong>Rückfrage der KI:</strong> {suggestion.question}</p>
                  {(suggestion.status === "question" || suggestion.status === "ready") && (
                    <div className="field compact-field">
                      <label htmlFor={`answer-${suggestion.id}`}>Ihre fachliche Antwort</label>
                      <textarea
                        id={`answer-${suggestion.id}`}
                        rows={2}
                        value={suggestion.answer}
                        onChange={(event) =>
                          patchSuggestion(suggestion.id, {
                            answer: event.target.value,
                          })
                        }
                      />
                      {suggestion.status === "question" && (
                        <button
                          className="button button--secondary"
                          disabled={!suggestion.answer.trim()}
                          onClick={() => answerSuggestion(suggestion)}
                        >
                          Antwort speichern und Vorschlag erzeugen
                        </button>
                      )}
                    </div>
                  )}
                  {suggestion.status === "ready" && (
                    <>
                      <div className="proposed-copy">
                        <strong>Vorgeschlagene Formulierung für den RL-Text</strong>
                        <p>{suggestion.proposedText}</p>
                      </div>
                      <div className="field compact-field">
                        <label htmlFor={`reason-${suggestion.id}`}>
                          Begründung Ihrer Entscheidung <span aria-hidden="true">*</span>
                        </label>
                        <p className="help" id={`reason-${suggestion.id}-help`}>
                          Dokumentieren Sie, warum der Vorschlag übernommen oder abgelehnt wird.
                        </p>
                        <textarea
                          id={`reason-${suggestion.id}`}
                          rows={2}
                          aria-describedby={`reason-${suggestion.id}-help`}
                          value={suggestion.decisionReason}
                          onChange={(event) =>
                            patchSuggestion(suggestion.id, {
                              decisionReason: event.target.value,
                            })
                          }
                        />
                      </div>
                      <div className="suggestion-actions">
                        <button
                          className="button button--primary"
                          disabled={!suggestion.decisionReason.trim()}
                          onClick={() => decideSuggestion(suggestion, "accepted")}
                        >
                          Begründet in RL-Text übernehmen
                        </button>
                        <button
                          className="button button--secondary"
                          disabled={!suggestion.decisionReason.trim()}
                          onClick={() => decideSuggestion(suggestion, "rejected")}
                        >
                          Begründet ablehnen
                        </button>
                      </div>
                    </>
                  )}
                  {(suggestion.status === "accepted" || suggestion.status === "rejected") && (
                    <p className={`decision decision--${suggestion.status}`}>
                      <strong>
                        {suggestion.status === "accepted"
                          ? "✓ In den RL-Text übernommen"
                          : "× Vorschlag abgelehnt"}
                      </strong><br />
                      Begründung: {suggestion.decisionReason}
                    </p>
                  )}
                </article>
              ))}
            </section>
          )}
          <div className="paragraph-workspace">
            <section className="paragraph-list" aria-labelledby="rl-text-title">
              <div className="paragraph-list__heading">
                <h3 id="rl-text-title">Richtlinientext</h3>
                <span>{current.paragraphs.length} Absätze</span>
              </div>
              <p className="help">
                Absatz fokussieren oder mit der Maus berühren, um
                Formulierungsgrund und Fundstellen anzuzeigen.
              </p>
              {current.paragraphs.map((paragraph, index) => (
                <article
                  className={
                    paragraph.id === activeParagraph.id
                      ? `rl-paragraph rl-paragraph--${paragraph.origin} rl-paragraph--active`
                      : `rl-paragraph rl-paragraph--${paragraph.origin}`
                  }
                  key={paragraph.id}
                  onMouseEnter={() => setActiveParagraphId(paragraph.id)}
                  onFocus={() => setActiveParagraphId(paragraph.id)}
                >
                  <header>
                    <span className="paragraph-number">Absatz {index + 1}</span>
                    <span className={`origin origin--${paragraph.origin}`}>
                      {originLabels[paragraph.origin]}
                    </span>
                  </header>
                  <label htmlFor={`paragraph-${paragraph.id}`}>
                    {paragraph.label}
                  </label>
                  <textarea
                    id={`paragraph-${paragraph.id}`}
                    rows={Math.max(3, Math.ceil(paragraph.text.length / 90))}
                    value={paragraph.text}
                    onChange={(event) =>
                      patchParagraph(paragraph.id, event.target.value)
                    }
                  />
                  <button
                    className="evidence-trigger"
                    onClick={() => setActiveParagraphId(paragraph.id)}
                    aria-pressed={paragraph.id === activeParagraph.id}
                  >
                    Warum diese Formulierung? · {paragraph.sources.length} Fundstellen
                  </button>
                </article>
              ))}
            </section>
            <aside className="evidence-panel" aria-labelledby="evidence-title">
              <p className="eyebrow">Aktiver Absatz</p>
              <h3 id="evidence-title">Begründung des Agenten</h3>
              <p className="evidence-label">{activeParagraph.label}</p>
              <span className={`origin origin--${activeParagraph.origin}`}>
                {originLabels[activeParagraph.origin]}
              </span>
              <h4>Warum diese Formulierung?</h4>
              <p>{activeParagraph.rationale}</p>
              <h4>RAG-Findings und Fundstellen</h4>
              {activeParagraph.sources.length ? (
                <ol className="source-list">
                  {activeParagraph.sources.map((source) => (
                    <li key={source.id}>
                      <div className="source-list__meta">
                        <strong>{source.title}</strong>
                        <span>{Math.round(source.score * 100)} % Treffer</span>
                      </div>
                      <p className="source-locator">{source.locator}</p>
                      <blockquote>{source.excerpt}</blockquote>
                      <span className="demo-source">Demo-RAG-Fundstelle</span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="empty-evidence">
                  Keine Fundstelle: Dieser Absatz enthält eine offene oder
                  ausschließlich von Ihnen eingegebene Formulierung.
                </p>
              )}
            </aside>
          </div>
          <div className="editor-actions">
            <button
              className="button button--secondary"
              onClick={() => {
                patchCurrent({ status: "changed" });
                setAnnouncement(`Änderungen in Abschnitt ${current.id} gespeichert.`);
              }}
            >
              Änderungen speichern
            </button>
            <button
              className="button button--primary"
              onClick={checkOne}
              disabled={current.status === "checking"}
            >
              {current.status === "checking"
                ? "KI prüft Abschnitt …"
                : "Änderungen von KI prüfen lassen"}
            </button>
          </div>
          <nav className="section-pager" aria-label="Zwischen Abschnitten wechseln">
            <button
              className="button button--tertiary"
              disabled={currentIndex === 0}
              onClick={() => selectSection(items[currentIndex - 1]!.id)}
            >
              ← Vorheriger Abschnitt
            </button>
            <button
              className="button button--tertiary"
              disabled={currentIndex === items.length - 1}
              onClick={() => selectSection(items[currentIndex + 1]!.id)}
            >
              Nächster Abschnitt →
            </button>
          </nav>
        </section>
      </div>
      <div className="actions actions--between">
        <Link className="button button--secondary" to={`/entwurf/${id}/pruefen`}>
          Zurück zu Stufe 1
        </Link>
        <Link className="button button--primary" to={`/entwurf/${id}/vorschau`}>
          Dokumentansicht und Export
        </Link>
      </div>
    </>
  );
}

export function DraftEditorPage() {
  const { id = "" } = useParams();
  const { data: preview, isLoading } = useQuery({
    queryKey: ["preview", id],
    queryFn: () => api.preview(id),
  });
  if (isLoading || !preview)
    return <p role="status">RL-Entwurf wird formuliert …</p>;
  return <DraftWorkspace id={id} title={preview.title} preview={preview.sections} />;
}

export function PreviewPage() {
  const { id = "" } = useParams();
  const { data, isLoading } = useQuery({
    queryKey: ["preview", id],
    queryFn: () => api.preview(id),
  });
  if (isLoading || !data)
    return <p role="status">Vorschau wird erstellt …</p>;
  const offline = import.meta.env.VITE_STATIC === "true";
  let edited: EditorSection[] = [];
  try {
    edited = JSON.parse(localStorage.getItem(`rl-editor-v2-${id}`) ?? "[]");
  } catch {
    edited = [];
  }
  return (
    <>
      <ProcessSteps stage={2} />
      <PageHeader eyebrow="Dokumentansicht · Stufe 2" title={data.title}>
        <p className="lead">
          Die Dokumentansicht enthält den aktuellen Redaktionsstand
          einschließlich begründet übernommener KI-Vorschläge.
        </p>
      </PageHeader>
      <Alert kind="warning" title="Entwurfsfassung">
        <p>Eine fachliche und rechtliche Freigabe ist weiterhin erforderlich.</p>
      </Alert>
      <article className="document">
        {(edited.length ? edited : data.sections).map((section) => (
          <section key={section.id}>
            <h2>{section.id}. {section.title}</h2>
            {"paragraphs" in section && section.paragraphs.map((paragraph, index) => {
              const isEdited = "text" in paragraph;
              return (
                <div key={isEdited ? paragraph.id : index}>
                  <h3>{isEdited ? paragraph.label : paragraph.label}</h3>
                  <p>{isEdited ? paragraph.text : displayValue(paragraph.value)}</p>
                </div>
              );
            })}
          </section>
        ))}
      </article>
      <div className="actions actions--between">
        <Link className="button button--secondary" to={`/entwurf/${id}/redaktion`}>
          Zurück zur Redaktion
        </Link>
        <a
          className="button button--primary"
          href={`/api/drafts/${id}/export`}
          onClick={async (event) => {
            event.preventDefault();
            if (offline) {
              const article =
                document.querySelector("article.document")?.outerHTML ?? "";
              const html = `<!doctype html><html lang="de"><meta charset="utf-8"><title>${data.title}</title><body><h1>${data.title}</h1>${article}</body></html>`;
              const blob = new Blob([html], { type: "text/html;charset=utf-8" });
              const url = URL.createObjectURL(blob);
              const link = document.createElement("a");
              link.href = url;
              link.download = "foerderrichtlinie.html";
              link.click();
              URL.revokeObjectURL(url);
              return;
            }
            const response = await fetch(`/api/drafts/${id}/export`, {
              method: "POST",
            });
            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = "foerderrichtlinie.docx";
            link.click();
            URL.revokeObjectURL(url);
          }}
        >
          {offline ? "Redaktionsstand als HTML" : "Zwischenstand als DOCX"}
        </a>
      </div>
    </>
  );
}
