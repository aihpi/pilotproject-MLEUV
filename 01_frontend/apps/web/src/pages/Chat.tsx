import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import {
  chatStages,
  dokumentLink,
  naechsteFrage,
  nextChatStage,
  sections,
  type ChatExtraction,
  type FieldProposal,
  musterbausteinText,
} from "@richtlinie/shared";
import { api } from "../api";
import { Alert, BelegPanel, PageHeader, Progress, type Beleg } from "../components";
type Msg = { role: "assistant" | "user"; text: string };

/**
 * Der Wert, wie ihn ein Mensch lesen kann.
 *
 * Auswahlfelder tragen intern eine Kennung — `municipal`, `actual`, `share`. Die stand bis
 * hierher wörtlich im Bestätigen-Dialog, und die Bearbeiterin sollte etwas freigeben, das
 * sie nicht lesen kann. Die Beschriftung steht in der Abschnittsdefinition; gibt es dort
 * keine, bleibt die Kennung sichtbar statt zu verschwinden.
 */
function wertText(p: FieldProposal): string {
  const feld = sections
    .find((s) => s.id === p.sectionId)
    ?.fields.find((f) => f.id === p.fieldId);
  const beschriftung = (v: unknown) =>
    feld?.options?.find((o) => o.value === String(v))?.label ?? String(v);
  if (Array.isArray(p.value)) return p.value.map(beschriftung).join(", ");
  if (p.value === null) return "";
  return beschriftung(p.value);
}

/**
 * Woher ein Vorschlag kommt — der eigentliche Unterschied zu einem beliebigen Textgenerator.
 *
 * Getrennt dargestellt, weil es zwei verschiedene Dinge sind: die DECKUNG ist die Stelle der
 * eigenen Angabe, die den Wert trägt, der BELEG die Regel, nach der formuliert wurde. Ein
 * Vorschlag ohne Deckung ist aus dem Regelfall abgeleitet, und das soll man sehen können.
 *
 * Der Grad wird aus den vorliegenden Angaben benannt, nicht aus der Zahl abgelesen: „durch
 * Ihre Angabe gedeckt" sagt mehr als „95 Prozent".
 */
function Herkunft({ p, onBeleg }: { p: FieldProposal; onBeleg: (b: Beleg) => void }) {
  const nichts = !p.deckung && !p.belegzitat && !p.musterbaustein;
  if (nichts && p.confidence == null) return null;
  const grad = p.deckung
    ? "durch Ihre Angabe gedeckt"
    : "aus dem Regelfall abgeleitet — bitte besonders prüfen";
  return (
    <div className="herkunft">
      {/*
        Die Zahl stand hier bis zum 22.09.2026 und ist absichtlich weg.

        Sie misst, wie gut der Wert von der EINGABE gedeckt ist — nicht, wie gut er fachlich
        ist. Bei einem wörtlich übernommenen Satz stand deshalb „Konfidenz 100 %" an einem
        Wert, den niemand geprüft hatte. Über sieben beobachtete Felder lag sie zwischen 94
        und 100 Prozent: eine Zahl, die kaum streut, trennt nichts und suggeriert Messung.

        Der Grad darüber sagt dasselbe in Worten und ohne falsche Genauigkeit — und er ist
        die Unterscheidung, auf die es ankommt: gedeckt oder abgeleitet.
      */}
      <p className="herkunft__grad">
        <strong>{grad}</strong>
      </p>
      {p.deckung && (
        <p>
          <span className="herkunft__marke">Ihre Angabe</span>
          <q>{p.deckung}</q>
        </p>
      )}
      {p.musterbaustein && (
        <p>
          <span className="herkunft__marke">Musterbaustein</span>
          {musterbausteinText(p.musterbaustein)}
        </p>
      )}
      {/*
        Die Marke hieß bis zuletzt „Beleg", und das versprach mehr, als dahintersteht.
        Gemessen am 17.09.2026: mit Fundstellen arbeitet das Werkzeug zu 88 Prozent
        regeltreu, ohne zu 76 — die Fundstelle VERANKERT das Modell, sie BELEGT den Wert
        aber nicht. Das Zitat selbst ist echt und wird zeichengenau gegen die Quelle
        geprüft; ungeprüft bleibt, ob es diesen Wert stützt.

        „Vorbild" bleibt davon unberührt: bei den Vorschlagsfeldern ist die fremde
        Richtlinie tatsächlich die Vorlage, und diese Unterscheidung ist haftungsrelevant.
        Sähe beides gleich aus, würde eine Anlehnung für eine Rechtsgrundlage gehalten.
      */}
      {p.belegzitat && (
        <p className={p.vorbild ? "herkunft__vorbild" : undefined}>
          <span className="herkunft__marke">
            {p.vorbild ? "Vorbild" : "Dazu gefunden"}
          </span>
          <q>{p.belegzitat}</q>
          {p.fundstelle && (
            <span className="herkunft__quelle">
              {p.vorbild ? " — so geregelt in " : " — "}
              {/*
                Die Fundstelle führt ins Dokument, aufgeschlagen an der richtigen Seite.
                Ohne das ist sie eine Behauptung, die nur nachprüfen kann, wer den
                Datenordner kennt — und bei 60 von 101 Dokumenten ist der angezeigte
                Kurzname eine Setzung, die noch niemand bestätigt hat.
              */}
              {dokumentLink(p) ? (
                <a
                  href={dokumentLink(p)!}
                  onClick={(e) => {
                    // Kein neues Fenster: Beleg und Vorschlag will man nebeneinander
                    // sehen, nicht abwechselnd. Der href bleibt trotzdem stehen —
                    // Mittelklick und „In neuem Tab öffnen" sollen weiter gehen, und
                    // ohne Javascript ist der Verweis immer noch ein Verweis.
                    e.preventDefault();
                    onBeleg({ url: dokumentLink(p)!, titel: p.fundstelle! });
                  }}
                >
                  {p.fundstelle}
                </a>
              ) : (
                p.fundstelle
              )}
            </span>
          )}
          {/*
            Der Zusatz ist wichtiger als die Marke. Ohne ihn liest man auch „Dazu gefunden"
            noch als Bestätigung des Wertes — und genau das ist es nicht.
          */}
          <span className="herkunft__warnung">
            {p.vorbild
              ? " Keine Rechtsgrundlage, sondern bisherige Praxis. Bitte fachlich bestätigen."
              : " Kein Nachweis für diesen Wert — die Stelle gehört zum Thema, mehr nicht."}
          </span>
        </p>
      )}
      {nichts && (
        <p className="herkunft__leer">
          Für diesen Wert liegt kein Beleg vor. Prüfen Sie ihn selbst.
        </p>
      )}
    </div>
  );
}
export function ChatPage() {
  const { id = "" } = useParams();
  const qc = useQueryClient();
  const { data: draft } = useQuery({
    queryKey: ["draft", id],
    queryFn: () => api.draft(id),
  });
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [extraction, setExtraction] = useState<ChatExtraction | null>(null);
  const [progress, setProgress] = useState(0);
  const [beleg, setBeleg] = useState<Beleg | null>(null);
  useEffect(() => {
    if (!draft || msgs.length) return;
    setMsgs([
      {
        role: "assistant",
        text: naechsteFrage(draft),
      },
    ]);
    // Fortschritt aus dem Entwurf, nicht aus der letzten Antwort. Beim Neuladen stand der
    // Balken sonst wieder auf 0 %, obwohl fünf Bausteine erhoben waren — er maß den Verlauf
    // dieses Fensters statt den Stand der Arbeit.
    const naechste = nextChatStage(draft);
    setProgress(
      naechste
        ? Math.round((chatStages.indexOf(naechste) / chatStages.length) * 100)
        : 100,
    );
  }, [draft, msgs.length]);
  const chat = useMutation({
    mutationFn: (m: string) => api.chat(id, m),
    onSuccess: (r) => {
      setMsgs((v) => [...v, { role: "assistant", text: r.message }]);
      setExtraction(r.extraction);
      setProgress(r.progress);
    },
  });
  /**
   * Nach jedem Schritt zuerst im Verlauf nachsehen, statt zu fragen.
   *
   * Wer seine Förderidee am Stück erzählt, hat die nächsten drei Stufen oft schon
   * beantwortet — und wurde bis hierher trotzdem danach gefragt. „Wie oben" zu tippen
   * genügte, das Werkzeug fand es dann; es hätte nur von selbst nachsehen müssen.
   *
   * Der Aufruf kostet dasselbe wie dieses „wie oben": einen Modellaufruf. Bleibt er ohne
   * Ergebnis, steht die Frage da wie vorher — verloren ist dann nur Wartezeit, und die
   * hätte das Tippen auch gekostet.
   */
  /**
   * Die Frage wartet, bis der Blick in den Verlauf zurück ist.
   *
   * Zuerst zu fragen und den Fund nachzuschieben, war die falsche Reihenfolge: die
   * Bearbeiterin liest die Frage, fängt an zu tippen, und darunter erscheint eine Antwort,
   * die es schon gab. Die Frage kommt deshalb erst, wenn im Verlauf nichts steht.
   */
  const [offeneFrage, setOffeneFrage] = useState<string | null>(null);
  const ausVerlauf = useMutation({
    mutationFn: () => api.chatAusVerlauf(id),
    onSuccess: (r) => {
      /*
        Die Frage wird GESTELLT, auch wenn ein Vorschlag vorliegt.

        Bis zum 09.10.2026 ersetzte der Vorschlag die Frage: Wer den Titel bestätigt hatte,
        bekam sofort einen Vorschlag für Förderziel und Zuwendungszweck — abgeleitet aus dem
        Titel, denn mehr stand nicht im Verlauf — und wurde nie gefragt, was er erreichen
        will. Im Durchlauf desselben Tages bestätigte die Bearbeiterin diesen Vorschlag, trug
        ihre eigentliche Zielaussage danach nach, und das Feld war schon besetzt. Ihre Angabe
        war verloren, ohne dass es jemand sah.

        Reihenfolge: erst die Frage, dann der Vorschlag. Wer eine Antwort hat, schreibt sie;
        wer keine hat, nimmt den Vorschlag. Vorher gab es diese Wahl nicht.
      */
      const frage = offeneFrage;
      setMsgs((v) => [
        ...v,
        ...(frage ? [{ role: "assistant" as const, text: frage }] : []),
        ...(r.extraction.proposals.length
          ? [{ role: "assistant" as const, text: r.message }]
          : []),
      ]);
      if (r.extraction.proposals.length) setExtraction(r.extraction);
      setOffeneFrage(null);
      setProgress(r.progress);
    },
    // Fällt der Dienst aus, darf die Frage nicht verschwinden — sonst steht das Gespräch.
    onError: () => {
      if (offeneFrage) setMsgs((v) => [...v, { role: "assistant", text: offeneFrage }]);
      setOffeneFrage(null);
    },
  });

  function weiter(naechsteFrageText: string) {
    setExtraction(null);
    setOffeneFrage(naechsteFrageText);
    ausVerlauf.mutate();
  }

  const confirm = useMutation({
    mutationFn: () => api.confirm(id, extraction!.id, extraction!.proposals),
    onSuccess: (r) => {
      qc.setQueryData(["draft", id], r.draft);
      weiter(r.nextQuestion);
    },
  });
  // Überspringen ist eine Entscheidung und muss beim Entwurf ankommen. Wurde der Kasten nur
  // lokal geschlossen, stellte das Gespräch beim nächsten Zug dieselbe Frage — und bei einem
  // Feld, das aus der Eingabe nicht zu füllen war, endlos.
  const skip = useMutation({
    mutationFn: () => api.reject(id, extraction!.id),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["draft", id] });
      weiter(r.nextQuestion ?? "Übersprungen.");
    },
  });
  function send() {
    const value = input.trim();
    if (!value) return;
    setMsgs((v) => [...v, { role: "user", text: value }]);
    setInput("");
    chat.mutate(value);
  }
  return (
    <div className={beleg ? "mit-beleg" : undefined}>
      <div className="mit-beleg__inhalt">
      <PageHeader
        eyebrow={`Entwurf · ${draft?.title ?? "wird geladen"}`}
        title="Geführte Erhebung"
      >
        <p className="lead">
          Antworten Sie frei. Der Chat ordnet Ihre Angaben Feldern zu, übernimmt
          sie aber nur nach Ihrer Bestätigung.
        </p>
      </PageHeader>
      <Progress value={progress} label="Chat-Erhebung" />
      <Alert kind="warning" title="Keine vertraulichen personenbezogenen Daten">
        <p>
          Geben Sie nur Informationen ein, die für die Richtlinienerstellung
          erforderlich sind.
        </p>
      </Alert>
      <section className="chat" aria-label="Chatverlauf" aria-live="polite">
        {msgs.map((m, i) => (
          <article key={i} className={`message message--${m.role}`}>
            <strong>
              {m.role === "assistant" ? "Richtlinien-Assistent" : "Sie"}
            </strong>
            <p>{m.text}</p>
          </article>
        ))}
        {/*
          Beide Wartezeiten sichtbar machen, aber unterscheidbar: beim Blick in den Verlauf
          hat die Bearbeiterin nichts geschrieben und würde ein „Antwort wird erstellt" auf
          sich beziehen.
        */}
        {(chat.isPending || ausVerlauf.isPending) && (
          <p className="typing" role="status">
            {chat.isPending
              ? "Antwort wird erstellt …"
              : "Ich sehe nach, ob Ihre bisherigen Angaben das schon abdecken …"}
          </p>
        )}
      </section>
      {/*
        Ohne Vorschläge kein Kasten. „Das habe ich verstanden" über einer leeren Liste, mit
        „Vorschlag übernehmen" darunter, ist eine Aufforderung, nichts zu bestätigen — im
        Durchlauf vom 22.09.2026 stand er dreimal so da. Die Nachricht daneben sagt bereits,
        dass sich nichts ableiten ließ.
      */}
      {extraction?.proposals.length ? (
        <section className="proposal" aria-labelledby="understood">
          <h2 id="understood">Das habe ich verstanden</h2>
          <p>
            Quelle: Ihre letzte Chat-Antwort. KI-Vorschlag – noch nicht
            übernommen.
          </p>
          <dl>
            {extraction.proposals.map((p) => (
              <div key={p.fieldId}>
                <dt>{p.label}</dt>
                <dd>
                  {wertText(p)}
                  <Herkunft p={p} onBeleg={setBeleg} />
                </dd>
              </div>
            ))}
          </dl>
          <div className="actions">
            <button
              className="button button--primary"
              onClick={() => confirm.mutate()}
            >
              Vorschlag übernehmen
            </button>
            <button
              className="button button--secondary"
              onClick={() => {
                setExtraction(null);
                setMsgs((v) => [
                  ...v,
                  {
                    role: "assistant",
                    text: "Was soll ich ändern oder ergänzen?",
                  },
                ]);
              }}
            >
              {/*
                „Korrigieren" allein unterschlägt den häufigeren Fall: der Vorschlag ist
                richtig, es fehlt nur noch etwas. Wer nichts zu korrigieren hat, klickt sonst
                „Übernehmen" und trägt den Rest gar nicht nach.
              */}
              Korrigieren oder ergänzen
            </button>
            <button
              className="button button--tertiary"
              disabled={skip.isPending}
              onClick={() => skip.mutate()}
            >
              Überspringen
            </button>
          </div>
        </section>
      ) : null}
      <form
        className="composer"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <label htmlFor="chat-input">Ihre Antwort</label>
        <textarea
          id="chat-input"
          rows={4}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            // Enter sendet, Umschalt+Enter macht einen Absatz. Der Hilfetext hat das
            // vorher versprochen, ohne dass es jemand gebaut hatte.
            //
            // `isComposing` ausnehmen: wer über eine Eingabemethode schreibt, schließt
            // mit Enter ein Wort ab und will nicht senden.
            if (e.key !== "Enter" || e.shiftKey || e.nativeEvent.isComposing) return;
            e.preventDefault();
            send();
          }}
          disabled={!!extraction || chat.isPending || ausVerlauf.isPending}
          aria-describedby="chat-help"
        />
        <p id="chat-help" className="help">
          Mit Enter senden, mit Umschalt + Enter einen Absatz machen.
        </p>
        <button
          className="button button--primary"
          disabled={!input.trim() || !!extraction || chat.isPending || ausVerlauf.isPending}
        >
          Antwort senden
        </button>
      </form>
      <div className="actions actions--between">
        <Link className="button button--secondary" to="/">
          Zur Übersicht
        </Link>
        <Link className="button button--primary" to={`/entwurf/${id}`}>
          Strukturierten Entwurf prüfen
        </Link>
      </div>
      </div>

      {/*
        Der Beleg neben dem Vorschlag, nicht an seiner Stelle. Ein eingebetteter Betrachter
        statt eines neuen Fensters: die Frage beim Prüfen lautet „steht das da wirklich so",
        und dafür muss man beides gleichzeitig sehen.

        Ein <iframe> auf das PDF, weil jeder Browser einen Betrachter mitbringt und `#page=N`
        versteht. Ein eigener Betrachter im Bündel wäre mehrere hundert Kilobyte für eine
        Anzeige, die das Betriebssystem schon kann.
      */}
      {beleg && <BelegPanel beleg={beleg} onClose={() => setBeleg(null)} />}
    </div>
  );
}
