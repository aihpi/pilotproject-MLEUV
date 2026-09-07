import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { nextChatStage, type ChatExtraction } from "@richtlinie/shared";
import { api } from "../api";
import { Alert, PageHeader, Progress } from "../components";
type Msg = { role: "assistant" | "user"; text: string };
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
                <dd>{p.value}</dd>
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
