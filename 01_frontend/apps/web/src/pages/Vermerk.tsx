import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { sections, type VermerkEintrag } from "@richtlinie/shared";
import { api } from "../api";
import { Alert, PageHeader } from "../components";

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

function Eintrag({ id, e }: { id: string; e: VermerkEintrag }) {
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
              className="button--primary"
              disabled={e.status !== "beantwortet" || bestaetigen.isPending}
              onClick={() => bestaetigen.mutate()}
            >
              {bestaetigen.isPending ? "Wird bestätigt …" : "Begründung bestätigen"}
            </button>
          </div>
          {(begruenden.error || bestaetigen.error) && (
            <Alert kind="error" title="Das hat nicht geklappt">
              {String((begruenden.error ?? bestaetigen.error)?.message ?? "")}
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
  if (isLoading || !data) return <p role="status">Prüfvermerk wird geladen …</p>;

  const offene = data.eintraege.filter((e) => e.status !== "gegenstandslos");
  const erledigte = data.eintraege.filter((e) => e.status === "gegenstandslos");

  return (
    <>
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
          <Eintrag key={e.id} id={id} e={e} />
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
              <Eintrag key={e.id} id={id} e={e} />
            ))}
          </ul>
        </>
      )}
    </>
  );
}
