import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { dokumentUrl, sections, type VermerkEintrag } from "@richtlinie/shared";
import { api, type Vorbild } from "../api";
import { Alert, BelegPanel, PageHeader, type Beleg } from "../components";

/**
 * Der Prüfvermerk — das zweite Arbeitsergebnis neben der Richtlinie.
 *
 * Das Konzeptpapier verlangt je Baustein zwei Dinge: einen Formulierungsvorschlag UND einen
 * über die Bausteine mitwachsenden Vermerk. Der wurde bisher bei jeder Prüfung gefüllt,
 * über die Schnittstelle beantwortet und bestätigt — und war nirgends zu sehen.
 *
 * Adressat ist im Landesrecht das MdFE: die Unterschreitung der Bagatellgrenze und die
 * Vollfinanzierung verlangen beide eine fachliche Begründung im Anschreiben. Solange die
 * fehlt, ist die Richtlinie nicht einreichungsreif — deshalb steht die Vollständigkeit
 * oben und nicht am Ende.
 */
const ADRESSAT: Record<VermerkEintrag["adressat"], string> = {
  mdfe: "Anschreiben an das MdFE",
  pruefvermerk: "Prüfvermerk",
};

// Eigene Beschriftungen statt StatusBadge: dessen Wortschatz beschreibt die
// Vollständigkeit eines Formularabschnitts („Nicht begonnen", „Zu prüfen"). Hier geht es um
// den Bearbeitungsstand einer Begründung — andere Sache, andere Wörter.
const STATUS: Record<VermerkEintrag["status"], { text: string; art: string }> = {
  offen: { text: "Begründung fehlt", art: "warning" },
  beantwortet: { text: "begründet, nicht bestätigt", art: "suggested" },
  bestaetigt: { text: "bestätigt", art: "confirmed" },
  gegenstandslos: { text: "gegenstandslos", art: "empty" },
};

/**
 * Ein Vorbild als gekennzeichnetes Zitat an die Begründung anhängen.
 *
 * Vorher ersetzte der Knopf „In das Feld übernehmen" die Begründung durch den Wortlaut einer
 * FREMDEN Richtlinie — und tat damit genau das, was der Warntext zwei Zeilen darüber
 * ausschließt („Die Begründung schreiben Sie"). Wer ihn drückte und speicherte, hatte als
 * Begründung für seinen Fördersatz stehen, wie eine andere Richtlinie ihren staffelt. Das
 * begründet nichts, sieht aber ausgefüllt aus — und ein gefülltes Feld wird beim Gegenlesen
 * nicht mehr hinterfragt.
 *
 * Jetzt wird ANGEHÄNGT statt ersetzt, mit „Vergleiche" und der Fundstelle davor und in
 * Anführungszeichen. Damit steht im Feld sichtbar ein fremder Beleg und kein eigener Satz —
 * das Abtippen bleibt erspart, die Verwechslung nicht mehr möglich.
 */
export function zitatAnfuegen(
  vorher: string,
  v: { text: string; fundstelle: string },
): string {
  const zitat = `Vergleiche ${v.fundstelle}: „${v.text.trim()}“`;
  const davor = vorher.trimEnd();
  return davor ? `${davor}\n\n${zitat}` : zitat;
}

function Eintrag({
  id,
  e,
  onBeleg,
}: {
  id: string;
  e: VermerkEintrag;
  onBeleg: (b: Beleg) => void;
}) {
  const qc = useQueryClient();
  const [text, setText] = useState(e.begruendung ?? "");
  const frisch = () => qc.invalidateQueries({ queryKey: ["vermerk", id] });
  const begruenden = useMutation({
    mutationFn: () => api.begruenden(id, e.id, text),
    onSuccess: frisch,
  });
  const bestaetigen = useMutation({
    mutationFn: () => api.bestaetigen(id, e.id),
    onSuccess: frisch,
  });
  /**
   * „Vorformulierte Begründung abfragen" aus dem Prozessmodell.
   *
   * Vorbilder, keine Vorlage: gesucht wird, wie frühere Richtlinien dieselbe Abweichung
   * begründet haben, und was gefunden wird, steht unverändert mit Fundstelle da. Kein
   * Modellaufruf — eine erzeugte Begründung läse sich fertig und würde durchgewunken.
   *
   * Übernehmen hängt den Text ins Feld, ohne zu speichern. Wer ihn unverändert abschickt,
   * hat eine fremde Begründung unterschrieben; das soll man sehen, bevor es passiert.
   */
  const [vorbilder, setVorbilder] = useState<Vorbild[] | null>(null);
  const suchen = useMutation({
    mutationFn: () => api.vorbilder(id, e.id),
    onSuccess: (r) => setVorbilder(r.vorbilder),
  });
  const abschnitt = sections.find((s) => s.id === e.sectionId);
  const erledigt = e.status === "bestaetigt" || e.status === "gegenstandslos";

  return (
    <li className="vermerk__eintrag">
      <div className="vermerk__kopf">
        <h3>
          Baustein {e.sectionId}
          {abschnitt ? ` — ${abschnitt.title}` : ""}
        </h3>
        <span className={`badge badge--${STATUS[e.status].art}`}>
          {STATUS[e.status].text}
        </span>
      </div>
      <p className="vermerk__beurteilung">{e.beurteilung}</p>
      {e.rechtsstelle && (
        <p className="vermerk__stelle">
          <span className="vermerk__marke">Rechtsstelle</span>
          {e.rechtsstelle}
        </p>
      )}
      {e.belegzitat && (
        <p className="vermerk__stelle">
          <span className="vermerk__marke">Beleg</span>
          <q>{e.belegzitat}</q>
          {e.fundstelle && <span className="vermerk__quelle"> — {e.fundstelle}</span>}
        </p>
      )}

      {/*
        Eine gegenstandslose Feststellung bleibt lesbar, wird aber nicht mehr bearbeitet:
        der Vermerk ist ein Nachweis darüber, was geprüft wurde, und eine schon eingeholte
        Begründung darf nicht stillschweigend verschwinden.
      */}
      {e.status === "gegenstandslos" ? (
        <p className="vermerk__hinweis">
          Der auslösende Wert wurde geändert; die Feststellung gilt nicht mehr. Sie bleibt
          als Nachweis stehen.
          {e.begruendung && ` Eingeholte Begründung: „${e.begruendung}“`}
        </p>
      ) : (
        <>
          <label className="vermerk__feld">
            <span>Fachliche Begründung</span>
            <textarea
              rows={3}
              value={text}
              disabled={erledigt}
              onChange={(ev) => setText(ev.target.value)}
              placeholder="Warum weicht die Richtlinie hier ab?"
            />
          </label>
          <div className="vermerk__knoepfe">
            <button
              type="button"
              className="button--secondary"
              disabled={erledigt || !text.trim() || begruenden.isPending}
              onClick={() => begruenden.mutate()}
            >
              {begruenden.isPending ? "Wird gespeichert …" : "Begründung speichern"}
            </button>
            {/*
              Getrennte Schritte, und das ist Absicht: das Fachreferat begründet, jemand
              anderes bestätigt. Deshalb ist Bestätigen ohne gespeicherte Begründung
              gesperrt — der Dienst weist es ohnehin ab.
            */}
            <button
              type="button"
              className="button--secondary"
              disabled={erledigt || suchen.isPending}
              onClick={() => suchen.mutate()}
            >
              {suchen.isPending
                ? "Wird gesucht …"
                : "Wie ist das anderswo geregelt?"}
            </button>
            <button
              type="button"
              className="button--primary"
              disabled={e.status !== "beantwortet" || bestaetigen.isPending}
              onClick={() => bestaetigen.mutate()}
            >
              {bestaetigen.isPending ? "Wird bestätigt …" : "Begründung bestätigen"}
            </button>
          </div>
          {vorbilder !== null && (
            <div className="vorbilder">
              {vorbilder.length ? (
                <>
                  {/*
                    Beschriftung nach dem ersten Durchlauf korrigiert. Vorher stand hier „So
                    haben andere Richtlinien das begründet" — gefunden werden aber
                    REGELUNGEN, keine Begründungen. Die stehen im Anschreiben ans MdFE, und
                    das liegt nicht im Korpus. Ein Versprechen, das der Inhalt nicht hält,
                    ist schlimmer als gar keines.
                  */}
                  <p className="vorbilder__kopf">
                    <strong>So ist das in anderen Richtlinien geregelt.</strong> Keine
                    Begründung und kein Vorschlag für Ihren Fall, sondern ein Präzedenzfall
                    zum Vergleichen. Die Begründung schreiben Sie — unter dem Anschreiben ans
                    MdFE steht Ihre Unterschrift.
                  </p>
                  <ul>
                    {vorbilder.map((v, i) => (
                      <li key={i}>
                        <blockquote>{v.text}</blockquote>
                        <p className="vorbilder__quelle">
                          {/* `dokumentLink` erwartet undefined, der Dienst liefert null. */}
                          {/* Anklickbar wie überall: eine Fundstelle ohne Weg zum Dokument
                              ist eine Behauptung. */}
                          {dokumentUrl(v.datei, v.seite) ? (
                            <a
                              href={
                                dokumentUrl(v.datei, v.seite)!
                              }
                              onClick={(ev) => {
                                ev.preventDefault();
                                onBeleg({
                                  url: dokumentUrl(v.datei, v.seite)!,
                                  titel: v.fundstelle,
                                });
                              }}
                            >
                              {v.fundstelle}
                            </a>
                          ) : (
                            v.fundstelle
                          )}
                          {!erledigt && (
                            <button
                              type="button"
                              className="button--tertiary"
                              onClick={() => setText((vorher) => zitatAnfuegen(vorher, v))}
                            >
                              Als Zitat einfügen
                            </button>
                          )}
                        </p>
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <p>
                  Zu dieser Abweichung findet sich in früheren Richtlinien nichts
                  Vergleichbares.
                </p>
              )}
            </div>
          )}
          {(begruenden.error || bestaetigen.error || suchen.error) && (
            <Alert kind="error" title="Das hat nicht geklappt">
              {String(
                (begruenden.error ?? bestaetigen.error ?? suchen.error)?.message ?? "",
              )}
            </Alert>
          )}
        </>
      )}
    </li>
  );
}

export function VermerkPage() {
  const { id = "" } = useParams();
  const { data, isLoading } = useQuery({
    queryKey: ["vermerk", id],
    queryFn: () => api.vermerk(id),
  });
  const [beleg, setBeleg] = useState<Beleg | null>(null);
  if (isLoading || !data) return <p role="status">Prüfvermerk wird geladen …</p>;

  const offene = data.eintraege.filter((e) => e.status !== "gegenstandslos");
  const erledigte = data.eintraege.filter((e) => e.status === "gegenstandslos");

  return (
    // Dokument neben dem Vermerk, wie im Chat und im Formular.
    <div className={beleg ? "mit-beleg" : undefined}>
      <div className="mit-beleg__inhalt">
      <PageHeader eyebrow={ADRESSAT.mdfe} title="Prüfvermerk">
        <p>
          Die begründungspflichtigen Abweichungen dieser Richtlinie. Sie wachsen mit jeder
          Prüfung mit und gehören in das Anschreiben an das MdFE.
        </p>
      </PageHeader>
      <p>
        <Link to={`/entwurf/${id}`}>Zurück zur Übersicht</Link>
      </p>

      {data.eintraege.length === 0 ? (
        <Alert kind="info" title="Noch keine Einträge">
          Sobald eine Prüfung eine begründungspflichtige Abweichung feststellt — etwa eine
          Bagatellgrenze unterhalb der Regelgrenze oder eine Vollfinanzierung —, erscheint
          sie hier.
        </Alert>
      ) : data.vollstaendig ? (
        <Alert kind="success" title="Alle Abweichungen sind begründet und bestätigt">
          Dem Anschreiben an das MdFE fehlt nichts mehr.
        </Alert>
      ) : (
        <Alert kind="warning" title="Es fehlen Begründungen">
          {data.offen > 0 && `${data.offen} ohne Begründung. `}
          {data.unbestaetigt > 0 && `${data.unbestaetigt} begründet, aber nicht bestätigt. `}
          Solange etwas offen ist, ist die Richtlinie nicht einreichungsreif.
        </Alert>
      )}

      <ul className="vermerk">
        {offene.map((e) => (
          <Eintrag key={e.id} id={id} e={e} onBeleg={setBeleg} />
        ))}
      </ul>

      {erledigte.length > 0 && (
        <>
          <h2>Nicht mehr einschlägig</h2>
          <p className="vermerk__hinweis">
            Feststellungen, deren auslösender Wert später geändert wurde. Sie werden nicht
            gelöscht — der Vermerk weist nach, was geprüft wurde.
          </p>
          <ul className="vermerk">
            {erledigte.map((e) => (
              <Eintrag key={e.id} id={id} e={e} onBeleg={setBeleg} />
            ))}
          </ul>
        </>
      )}
      </div>
      {beleg && <BelegPanel beleg={beleg} onClose={() => setBeleg(null)} />}
    </div>
  );
}
