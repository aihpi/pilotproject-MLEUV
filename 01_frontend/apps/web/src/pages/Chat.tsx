import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import {
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
function Herkunft({ p }: { p: FieldProposal }) {
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
        Vorbild und Beleg sind verschiedene Dinge, und der Unterschied ist haftungsrelevant.
        Ein BELEG ist die Regel, nach der formuliert werden musste. Ein VORBILD ist eine
        frühere Richtlinie, in der etwas Ähnliches geregelt wurde — bindend ist daran
        nichts. Sähe beides gleich aus, würde eine Anlehnung für eine Rechtsgrundlage
        gehalten. Das Prozessmodell trennt die beiden Abfragesorten genau deshalb.
      */}
      {p.belegzitat && (
        <p className={p.vorbild ? "herkunft__vorbild" : undefined}>
          <span className="herkunft__marke">{p.vorbild ? "Vorbild" : "Beleg"}</span>
          <q>{p.belegzitat}</q>
          {p.fundstelle && (
            <span className="herkunft__quelle">
              {p.vorbild ? " — so geregelt in " : " — "}
              {p.fundstelle}
            </span>
          )}
          {p.vorbild && (
            <span className="herkunft__warnung">
              {" "}
              Keine Rechtsgrundlage, sondern bisherige Praxis. Bitte fachlich bestätigen.
            </span>
          )}
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
    <>
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
                  <Herkunft p={p} />
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
          disabled={!!extraction || chat.isPending}
          aria-describedby="chat-help"
        />
        <p id="chat-help" className="help">
          Sie können mehrere Sätze schreiben. Mit Strg + Enter senden Sie
          ebenfalls.
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
    </>
  );
}
