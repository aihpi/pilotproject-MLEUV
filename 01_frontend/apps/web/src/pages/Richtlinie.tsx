import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import {
  sections,
  textVeraltet,
  type RichtlinienAbschnitt,
} from "@richtlinie/shared";
import { api } from "../api";
import { Alert, PageHeader } from "../components";

/**
 * Die ausformulierte Richtlinie — das Arbeitsergebnis, um dessentwillen es das Werkzeug gibt.
 *
 * Bis hierher erhebt und prüft es nur; am Ende stand eine Liste von Feldwerten. Das
 * Prozessmodell endet dagegen mit „Erstellung der Richtlinie mit Begründungen je
 * Entscheidung, die in den Text einfloss".
 *
 * Genau diese Trennung trägt die Seite: links der Text, darunter je Abschnitt, woher jeder
 * Wert kam und welche Prüfung ihn berührt hat. Der Text ist formuliert, die Begründungen
 * sind gerechnet — und die Befunde stehen nicht am Ende, sondern über dem Abschnitt, zu dem
 * sie gehören. Ein Befund, den man erst nach dem Lesen findet, kommt zu spät.
 */
function Abschnitt({ a }: { a: RichtlinienAbschnitt }) {
  const def = sections.find((s) => s.id === String(a.nr));
  return (
    <section className="rl-abschnitt" aria-labelledby={`abschnitt-${a.nr}`}>
      <h2 id={`abschnitt-${a.nr}`}>
        {a.nr} {def?.title ?? ""}
      </h2>

      {a.uebersprungen ? (
        <Alert kind="info" title="Nicht erzeugt">
          {a.uebersprungen === "keine bestätigten Angaben"
            ? "Für diesen Abschnitt sind noch keine Angaben bestätigt. Ein Abschnitt allein aus Musterbausteinen wäre die Musterrichtlinie, nicht diese Richtlinie."
            : a.uebersprungen}
        </Alert>
      ) : a.fehler ? (
        <Alert kind="error" title="Der Abschnitt konnte nicht erzeugt werden">
          {a.fehler}
        </Alert>
      ) : (
        <>
          {a.befunde.length > 0 && (
            <Alert kind="warning" title={`${a.befunde.length} Befund${a.befunde.length > 1 ? "e" : ""} zu diesem Abschnitt`}>
              <ul>
                {a.befunde.map((b, i) => (
                  <li key={i}>{b}</li>
                ))}
              </ul>
            </Alert>
          )}
          <p className="rl-text">{a.text}</p>

          {a.begruendungen.length > 0 && (
            <details className="rl-begruendung">
              <summary>
                Woher die Angaben stammen ({a.begruendungen.length})
              </summary>
              <dl>
                {a.begruendungen.map((b) => (
                  <div key={b.feld}>
                    <dt>{b.feld}</dt>
                    <dd>
                      {b.herkunft === "user-chat"
                        ? "aus Ihrer Chat-Angabe"
                        : b.herkunft === "user-form"
                          ? "aus dem Formular"
                          : (b.herkunft ?? "Herkunft unbekannt")}
                      {b.musterbaustein && `, Satzrahmen aus Musterbaustein ${b.musterbaustein}`}
                      {b.fundstelle && `, belegt mit ${b.fundstelle}`}
                      {b.pruefungen.length > 0 && (
                        <span className="rl-geprueft">
                          {" "}· geprüft: {b.pruefungen.join(", ")}
                        </span>
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
            </details>
          )}
        </>
      )}
    </section>
  );
}

export function RichtlinienPage() {
  const { id = "" } = useParams();
  const qc = useQueryClient();
  const { data: d, isLoading } = useQuery({
    queryKey: ["draft", id],
    queryFn: () => api.draft(id),
  });
  const erzeugen = useMutation({
    mutationFn: () => api.richtlinieErzeugen(id),
    onSuccess: (draft) => qc.setQueryData(["draft", id], draft),
  });

  if (isLoading || !d) return <p role="status">Entwurf wird geladen …</p>;
  const text = d.richtlinientext;
  const veraltet = textVeraltet(d);

  return (
    <>
      <PageHeader eyebrow={`Entwurf · ${d.title}`} title="Richtlinientext">
        <p className="lead">
          Aus den bestätigten Angaben ausformuliert, je Abschnitt mit der Herkunft
          jeder Angabe. Ein Vorschlag zur Überarbeitung, keine fertige Richtlinie.
        </p>
      </PageHeader>
      <p>
        <Link to={`/entwurf/${id}`}>Zurück zur Übersicht</Link>
      </p>

      <div className="actions">
        <button
          className="button button--primary"
          disabled={erzeugen.isPending}
          onClick={() => erzeugen.mutate()}
        >
          {erzeugen.isPending
            ? "Wird erzeugt …"
            : text
              ? "Neu erzeugen"
              : "Richtlinientext erzeugen"}
        </button>
        {/*
          Zwei Dokumente, zwei Knöpfe. Die Richtlinie wird veröffentlicht, das Anschreiben
          geht ans MdFE — zusammen in einer Datei gibt irgendwann jemand das Falsche weiter.
          Beide enthalten KEINE Befunde und keine Herkunftsangaben; die gehören auf diese
          Seite, nicht in ein Dokument, das das Haus verlässt.
        */}
        {text && !veraltet && (
          <a
            className="button button--secondary"
            href={`/api/drafts/${id}/export`}
            download
          >
            Richtlinie als Word
          </a>
        )}
        {(d.vermerk ?? []).length > 0 && (
          <a
            className="button button--secondary"
            href={`/api/drafts/${id}/export/vermerk`}
            download
          >
            Prüfvermerk als Word
          </a>
        )}
      </div>

      {/* Ein Aufruf dauert mehrere Minuten — ohne diesen Hinweis wirkt die Seite hängend. */}
      {erzeugen.isPending && (
        <p className="typing" role="status">
          Je Abschnitt ein Modellaufruf, das dauert einige Minuten. Sie können das
          Fenster offen lassen.
        </p>
      )}
      {erzeugen.error && (
        <Alert kind="error" title="Der Text konnte nicht erzeugt werden">
          {String((erzeugen.error as Error).message)}
        </Alert>
      )}

      {!text && !erzeugen.isPending && (
        <Alert kind="info" title="Noch kein Text erzeugt">
          Der Text entsteht aus den bestätigten Angaben und den Musterbausteinen.
          Abschnitte ohne bestätigte Angaben bleiben leer.
        </Alert>
      )}

      {text && (
        <>
          {/*
            Ein Text, der zu geänderten Angaben nicht mehr passt, ist gefährlicher als
            keiner: er sieht fertig aus. Deshalb wird er nicht verworfen, sondern als
            veraltet ausgewiesen.
          */}
          {veraltet && (
            <Alert kind="warning" title="Der Text ist älter als der Entwurf">
              Seit der Erzeugung wurden Angaben geändert. Der Text unten zeigt den
              Stand von damals — erzeugen Sie ihn neu, bevor Sie ihn weitergeben.
            </Alert>
          )}
          {text.befunde.length > 0 && (
            <Alert kind="warning" title={`${text.befunde.length} Befunde insgesamt`}>
              Sie stehen jeweils über dem Abschnitt, zu dem sie gehören.
            </Alert>
          )}
          {text.abschnitte.map((a) => (
            <Abschnitt key={a.nr} a={a} />
          ))}
        </>
      )}
    </>
  );
}
