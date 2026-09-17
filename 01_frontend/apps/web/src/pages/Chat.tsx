import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import {
  dokumentLink,
  nextChatStage,
  type ChatExtraction,
  type FieldProposal,
} from "@richtlinie/shared";
import { api } from "../api";
import { Alert, PageHeader, Progress } from "../components";
type Msg = { role: "assistant" | "user"; text: string };

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
/** Ein aufgeschlagener Beleg im Seitenbereich. */
type Beleg = { url: string; titel: string };

function Herkunft({ p, onBeleg }: { p: FieldProposal; onBeleg: (b: Beleg) => void }) {
  const nichts = !p.deckung && !p.belegzitat && !p.musterbaustein;
  if (nichts && p.confidence == null) return null;
  const grad = p.deckung
    ? "durch Ihre Angabe gedeckt"
    : "aus dem Regelfall abgeleitet — bitte besonders prüfen";
  return (
    <div className="herkunft">
      <p className="herkunft__grad">
        <strong>{grad}</strong>
        {p.confidence != null && (
          <span className="herkunft__zahl">
            {" "}
            (Konfidenz {Math.round(p.confidence * 100)} %)
          </span>
        )}
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
          {p.musterbaustein}
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
        text:
          nextChatStage(draft)?.question ??
          "Die geführte Erhebung ist abgeschlossen. Prüfen Sie nun den strukturierten Entwurf.",
      },
    ]);
  }, [draft, msgs.length]);
  const chat = useMutation({
    mutationFn: (m: string) => api.chat(id, m),
    onSuccess: (r) => {
      setMsgs((v) => [...v, { role: "assistant", text: r.message }]);
      setExtraction(r.extraction);
      setProgress(r.progress);
    },
  });
  const confirm = useMutation({
    mutationFn: () => api.confirm(id, extraction!.id, extraction!.proposals),
    onSuccess: (r) => {
      qc.setQueryData(["draft", id], r.draft);
      setMsgs((v) => [...v, { role: "assistant", text: r.nextQuestion }]);
      setExtraction(null);
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
        {chat.isPending && (
          <p className="typing" role="status">
            Antwort wird erstellt …
          </p>
        )}
      </section>
      {extraction && (
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
                  {p.value}
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
                    text: "Was soll ich an diesem Vorschlag korrigieren?",
                  },
                ]);
              }}
            >
              Korrigieren
            </button>
            <button
              className="button button--tertiary"
              onClick={() => setExtraction(null)}
            >
              Überspringen
            </button>
          </div>
        </section>
      )}
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
          disabled={!!extraction || chat.isPending}
          aria-describedby="chat-help"
        />
        <p id="chat-help" className="help">
          Mit Enter senden, mit Umschalt + Enter einen Absatz machen.
        </p>
        <button
          className="button button--primary"
          disabled={!input.trim() || !!extraction || chat.isPending}
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
      {beleg && (
        <aside className="beleg" aria-label={`Belegstelle ${beleg.titel}`}>
          <header className="beleg__kopf">
            <strong>{beleg.titel}</strong>
            <button
              type="button"
              className="button button--tertiary"
              onClick={() => setBeleg(null)}
            >
              Schließen
            </button>
          </header>
          <iframe className="beleg__rahmen" src={beleg.url} title={beleg.titel} />
          <p className="beleg__fuss">
            {/* Für den Fall, dass der eingebaute Betrachter streikt — etwa weil der
                Vorschlagsdienst nicht läuft. */}
            Zeigt der Bereich nichts,{" "}
            <a href={beleg.url} target="_blank" rel="noreferrer">
              öffnen Sie das Dokument in einem neuen Tab
            </a>
            .
          </p>
        </aside>
      )}
    </div>
  );
}
