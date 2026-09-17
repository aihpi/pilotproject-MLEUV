import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../api";
import { Alert, PageHeader } from "../components";
import type { Pruefbericht } from "../api";

/**
 * Prüf-Modus — Phase 2 der Vereinbarung.
 *
 * Ein fertiger Entwurf wird hochgeladen und gegen die Musterstruktur gehalten. Anders als
 * die geführte Erstellung hängt das an keinem Entwurf im Werkzeug: man bekommt eine
 * Auskunft, und nichts wird gespeichert. Die hochgeladene Datei liegt während der Prüfung
 * in einem temporären Verzeichnis und wird danach gelöscht.
 *
 * Zwei Stufen, beide ohne Modell: zerlegen und Vollständigkeit. Deshalb dauert die Prüfung
 * Sekunden und nicht Minuten — und deshalb ist sie wiederholbar.
 */
export function PruefenPage() {
  const [datei, setDatei] = useState<File | null>(null);
  const pruefen = useMutation<Pruefbericht, Error, File>({
    mutationFn: (f) => api.pruefen(f),
  });
  const bericht = pruefen.data;
  const fehler = bericht?.befunde.filter((b) => b.schwere === "fehler") ?? [];
  const hinweise = bericht?.befunde.filter((b) => b.schwere === "hinweis") ?? [];

  return (
    <>
      <PageHeader eyebrow="Prüf-Modus" title="Entwurf prüfen">
        <p className="lead">
          Laden Sie einen fertigen Richtlinienentwurf hoch. Er wird gegen die
          Musterstruktur gehalten — welche Bausteine fehlen und welche
          Gliederungspunkte der Musterrichtlinie nicht abgedeckt sind.
        </p>
      </PageHeader>
      <p>
        <Link to="/">Zur Übersicht</Link>
      </p>

      <Alert kind="info" title="Der Entwurf wird nicht gespeichert">
        Die Datei wird für die Prüfung gelesen und danach gelöscht. Sie erscheint in
        keiner Entwurfsliste.
      </Alert>

      <div className="field">
        <label htmlFor="entwurf">Richtlinienentwurf (PDF oder DOCX)</label>
        <input
          id="entwurf"
          type="file"
          accept=".pdf,.docx"
          onChange={(e) => {
            setDatei(e.target.files?.[0] ?? null);
            pruefen.reset();
          }}
        />
      </div>
      <div className="actions">
        <button
          className="button button--primary"
          disabled={!datei || pruefen.isPending}
          onClick={() => datei && pruefen.mutate(datei)}
        >
          {pruefen.isPending ? "Wird geprüft …" : "Entwurf prüfen"}
        </button>
      </div>

      {pruefen.error && (
        <Alert kind="error" title="Die Prüfung ist fehlgeschlagen">
          {pruefen.error.message}
        </Alert>
      )}

      {bericht && (
        <>
          <h2>
            {Object.keys(bericht.abschnitte).length} von 8 Bausteinen gefunden
          </h2>
          <ol className="tasklist">
            {Object.entries(bericht.abschnitte).map(([nr, a]) => (
              <li key={nr}>
                <span className="pruef-zeile">
                  <span className="task-number">{nr}</span>
                  <span>
                    <strong>{a.titel}</strong>
                    <small>{a.zeichen.toLocaleString("de-DE")} Zeichen</small>
                  </span>
                </span>
              </li>
            ))}
          </ol>

          {fehler.length === 0 && hinweise.length === 0 && (
            <Alert kind="success" title="Keine Beanstandungen">
              Alle acht Bausteine sind vorhanden, und zu jedem Gliederungspunkt der
              Musterrichtlinie findet sich etwas im Entwurf.
            </Alert>
          )}

          {fehler.map((b, i) => (
            <Alert key={i} kind="error" title="Fehlt">
              {b.text}
            </Alert>
          ))}

          {hinweise.length > 0 && (
            <Alert kind="warning" title={`${hinweise.length} offene Gliederungspunkte`}>
              <ul>
                {hinweise.map((b, i) => (
                  <li key={i}>{b.text}</li>
                ))}
              </ul>
              {/*
                Ohne diesen Zusatz liest man die Liste als Mängelliste. Sie ist ein
                Wortvergleich: ein Punkt kann der Sache nach geregelt sein, ohne die
                Wörter der Vorlage zu benutzen.
              */}
              <p>
                <strong>Hinweise, keine Feststellungen.</strong> Verglichen werden
                Wörter — ein Punkt kann der Sache nach geregelt sein, ohne die
                Begriffe der Musterrichtlinie zu verwenden.
              </p>
            </Alert>
          )}
        </>
      )}
    </>
  );
}
