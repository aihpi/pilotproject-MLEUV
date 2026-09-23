import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  feldLeer,
  fieldVisible,
  sections,
  validateDraft,
  type FieldDefinition,
  type FieldProposal,
  type FieldValue,
  type RichtlinieDraft,
  type SectionData,
} from "@richtlinie/shared";
import { api } from "../api";
import { Alert, PageHeader, ProcessSteps, Progress, StatusBadge } from "../components";
function sectionStatus(d: RichtlinieDraft, id: string) {
  const section = sections.find((s) => s.id === id)!;
  const vals = d.sections[id]?.fields ?? {};
  // Mit den tatsächlichen Werten, nicht mit {}: sonst gilt ein bedingtes Pflichtfeld als
  // unsichtbar und der Abschnitt meldet "vollständig", obwohl es leer ist. Betrifft die
  // Antragsfrist und die Auswahlkriterien in Baustein 7.
  const werte = Object.fromEntries(
    Object.entries(vals).map(([k, v]) => [k, v.value]),
  );
  const visible = section.fields.filter((f) => fieldVisible(f, d.profile, werte));
  const required = visible.filter((f) => f.required);
  if (!Object.keys(vals).length) return "empty";
  if (required.some((f) => feldLeer(vals[f.id]?.value ?? null))) return "invalid";
  // Ein Regelverstoß macht den Abschnitt nicht vollständig.
  //
  // Gezählt wurden bis zum 22.09.2026 nur die Pflichtfelder. Baustein 8 stand deshalb auf
  // „Vollständig", während das Außerkrafttreten vor dem Inkrafttreten lag — beide Felder
  // waren gefüllt und bestätigt, die Sache war trotzdem falsch. In der Abschnittsliste sieht
  // man nur diesen Status, und ein Häkchen dort heißt: hier muss ich nicht mehr hinsehen.
  if (
    d.validation.issues.some(
      (i) => i.sectionId === section.id && i.severity === "error" && i.regel,
    )
  )
    return "invalid";
  if (
    Object.values(vals).some(
      (v) => v.status === "suggested" || !v.confirmedByUser,
    )
  )
    return "warning";
  return "confirmed";
}
export function TasksPage() {
  const { id = "" } = useParams();
  const { data: d, isLoading } = useQuery({
    queryKey: ["draft", id],
    queryFn: () => api.draft(id),
  });
  if (isLoading || !d) return <p role="status">Entwurf wird geladen …</p>;
  const complete = sections.filter(
    (s) => sectionStatus(d, s.id) === "confirmed",
  ).length;
  // Aus dem Entwurf gezählt statt über einen zweiten Abruf: der Vermerk hängt am Entwurf,
  // und eine eigene Anfrage nur für eine Zahl wäre eine Ladezeit mehr auf dieser Seite.
  const offeneVermerke = (d.vermerk ?? []).filter(
    (v) => v.status === "offen" || v.status === "beantwortet",
  ).length;
  return (
    <>
      <ProcessSteps stage={1} />
      <PageHeader eyebrow="Strukturierte Prüfung" title={d.title}>
        <p className="lead">
          Prüfen Sie die Angaben aus dem Chat und ergänzen Sie offene
          Pflichtfelder. Die Abschnitte können in beliebiger Reihenfolge
          bearbeitet werden.
        </p>
      </PageHeader>
      <div className="save-status" role="status">
        ✓ Zuletzt gespeichert:{" "}
        {new Date(d.updatedAt).toLocaleTimeString("de-DE")}
      </div>
      <Progress
        value={Math.round((complete / sections.length) * 100)}
        label={`${complete} von ${sections.length} Abschnitten vollständig`}
      />
      <ol className="tasklist">
        {sections.map((s) => (
          <li key={s.id}>
            <Link to={`/entwurf/${id}/abschnitt/${s.id}`}>
              <span className="task-number">{s.id}</span>
              <span>
                <strong>{s.title}</strong>
                <small>{s.description}</small>
              </span>
              <StatusBadge status={sectionStatus(d, s.id)} />
            </Link>
          </li>
        ))}
      </ol>
      <div className="actions actions--between">
        <Link className="button button--secondary" to={`/entwurf/${id}/chat`}>
          Zurück zum Chat
        </Link>
        {/*
          Der Prüfvermerk ist das zweite Arbeitsergebnis neben der Richtlinie und braucht
          einen eigenen Einstieg — bisher füllte er sich, ohne dass jemand ihn öffnen
          konnte. Die Zahl steht daneben, weil eine offene Begründung die Einreichung
          aufhält und nicht erst am Ende auffallen soll.
        */}
        <Link className="button button--secondary" to={`/entwurf/${id}/vermerk`}>
          Prüfvermerk{offeneVermerke > 0 ? ` (${offeneVermerke} offen)` : ""}
        </Link>
        {/*
          Der Richtlinientext ist das Arbeitsergebnis, um dessentwillen es das Werkzeug
          gibt — er braucht einen Einstieg, nicht nur einen Endpunkt.
        */}
        <Link className="button button--secondary" to={`/entwurf/${id}/richtlinie`}>
          Richtlinientext
        </Link>
        <Link className="button button--primary" to={`/entwurf/${id}/pruefen`}>
          Gesamtprüfung öffnen
        </Link>
      </div>
    </>
  );
}
function Input({
  field,
  value,
  onChange,
  error,
}: {
  field: FieldDefinition;
  value: unknown;
  onChange: (v: unknown) => void;
  error?: string;
}) {
  const described = `${field.id}-help${error ? ` ${field.id}-error` : ""}`;
  if (field.kind === "textarea")
    return (
      <>
        <textarea
          id={field.id}
          rows={5}
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value)}
          aria-describedby={described}
          aria-invalid={!!error}
        />
      </>
    );
  if (field.kind === "radio")
    return (
      <fieldset aria-describedby={described}>
        <legend>
          {field.label}
          {field.required && <span aria-hidden="true"> *</span>}
        </legend>
        {field.options?.map((o) => (
          <label className="choice" key={o.value}>
            <input
              type="radio"
              name={field.id}
              value={o.value}
              checked={value === o.value}
              onChange={() => onChange(o.value)}
            />
            <span>{o.label}</span>
          </label>
        ))}
      </fieldset>
    );
  if (field.kind === "checkbox") {
    const vals = Array.isArray(value) ? (value as string[]) : [];
    return (
      <fieldset aria-describedby={described}>
        <legend>
          {field.label}
          {field.required && <span aria-hidden="true"> *</span>}
        </legend>
        {field.options?.map((o) => (
          <label className="choice" key={o.value}>
            <input
              type="checkbox"
              checked={vals.includes(o.value)}
              onChange={(e) =>
                onChange(
                  e.target.checked
                    ? [...vals, o.value]
                    : vals.filter((v) => v !== o.value),
                )
              }
            />
            <span>{o.label}</span>
          </label>
        ))}
      </fieldset>
    );
  }
  return (
    <input
      id={field.id}
      type={field.kind}
      // Ein Datumsfeld nimmt sonst jedes Jahr an — im Probelauf ging der 31.03.222222
      // anstandslos durch. Eine Förderrichtlinie tritt weder vor der Landeshaushaltsordnung
      // in Kraft noch im sechsstelligen Jahr außer Kraft; der Browser weist es damit selbst
      // ab, bevor irgendeine Prüfung es sehen muss.
      {...(field.kind === "date" ? { min: "2000-01-01", max: "2099-12-31" } : {})}
      value={String(value ?? "")}
      onChange={(e) =>
        onChange(
          field.kind === "number"
            ? e.target.value
              ? Number(e.target.value)
              : ""
            : e.target.value,
        )
      }
      aria-describedby={described}
      aria-invalid={!!error}
    />
  );
}
export function SectionPage() {
  const { id = "", sectionId = "0" } = useParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const { data: d } = useQuery({
    queryKey: ["draft", id],
    queryFn: () => api.draft(id),
  });
  const def = sections.find((s) => s.id === sectionId);
  const [values, setValues] = useState<Record<string, unknown>>({});
  useEffect(() => {
    if (d)
      setValues(
        Object.fromEntries(
          Object.entries(d.sections[sectionId]?.fields ?? {}).map(([k, v]) => [
            k,
            v.value,
          ]),
        ),
      );
  }, [d, sectionId]);
  /**
   * Beanstandungen an den GERADE EINGETIPPTEN Werten, nicht am zuletzt gespeicherten Stand.
   *
   * Vorher kam die Rückmeldung erst nach dem Speichern und dem Zurückkehren in den
   * Abschnitt. Wer ein Außerkrafttreten vor das Inkrafttreten setzte, sah das erst zwei
   * Klicks später — und in der Zwischenzeit sah alles in Ordnung aus.
   *
   * Möglich, weil die Prüfungen reine Funktionen über dem Entwurf sind: kein Modellaufruf,
   * kein Netzzugriff, kein Zustand. Sie laufen hier über eine Kopie mit den Eingabewerten.
   */
  const errors = useMemo(() => {
    if (!d) return [];
    const probe: RichtlinieDraft = {
      ...d,
      sections: {
        ...d.sections,
        [sectionId]: {
          ...d.sections[sectionId],
          fields: Object.fromEntries(
            Object.entries(values).map(([k, wert]) => [
              k,
              {
                ...(d.sections[sectionId]?.fields[k] ?? {
                  status: "suggested" as const,
                  source: "user-form" as const,
                }),
                value: wert as FieldValue["value"],
              } as FieldValue,
            ]),
          ),
        },
      },
    };
    return validateDraft(probe).issues.filter((i) => i.sectionId === sectionId);
  }, [d, sectionId, values]);
  /**
   * Vorschläge für diesen Abschnitt holen — derselbe Dienst wie im Chat.
   *
   * Die Werte landen NUR im Formular, nicht im Entwurf: bestätigt wird erst beim Speichern,
   * wie bei allem anderen hier auch. Ein Knopf, der still etwas festschreibt, wäre das
   * Gegenteil dessen, wofür der Bestätigungsschritt da ist.
   *
   * Überschrieben wird nur, was leer ist. Wer schon etwas eingetippt hat, soll es nicht
   * durch einen Klick verlieren.
   */
  const [vorschlagHinweis, setVorschlagHinweis] = useState("");
  /**
   * Die Vorschläge des letzten Laufs, nach Feld — bis zum Speichern am Feld ausgewiesen.
   *
   * Nicht nur die Kennungen: die Bearbeiterin muss auch hier sehen, woher ein Wert kommt.
   * Im Chat steht das unter jedem Vorschlag, im Formular fehlte es — derselbe Wert sah
   * dort aus, als hätte sie ihn selbst eingetragen.
   */
  const [vorausgefuellt, setVorausgefuellt] = useState<Record<string, FieldProposal>>({});
  // Der Zustand aus der letzten Darstellung, für Code der IHN LESEN muss, statt ihn zu
  // ändern. Im Rückruf des Vorschlags stünde sonst der Stand vom Klick — und der ist nach
  // ein bis zwei Minuten Wartezeit womöglich überholt.
  const werteRef = useRef(values);
  useEffect(() => {
    werteRef.current = values;
  }, [values]);
  const vorschlag = useMutation({
    mutationFn: () => api.abschnittsvorschlag(id, sectionId),
    onSuccess: (r) => {
      // Erst rechnen, dann ändern. Vorher lief der Zähler INNERHALB der Zustandsänderung
      // mit — die führt React aber später aus, und die Meldung las ihn, solange er noch auf
      // null stand. Ergebnis: „nichts geändert" über zwei frisch gesetzten Häkchen.
      const aktuell = werteRef.current;
      const neueFelder = r.proposals.filter((p) =>
        feldLeer((aktuell[p.fieldId] ?? null) as FieldValue["value"]),
      );
      setValues((v) => ({
        ...v,
        ...Object.fromEntries(neueFelder.map((p) => [p.fieldId, p.value])),
      }));
      setVorausgefuellt(Object.fromEntries(neueFelder.map((p) => [p.fieldId, p])));
      const uebersprungen = r.proposals.length - neueFelder.length;
      setVorschlagHinweis(
        neueFelder.length
          ? `${neueFelder.length} Feld${neueFelder.length === 1 ? "" : "er"} vorausgefüllt ` +
            `(${neueFelder.map((p) => p.label).join(", ")}). Bitte prüfen — die Werte sind ` +
            "noch nicht gespeichert. " +
            (uebersprungen
              ? `${uebersprungen} Feld${uebersprungen === 1 ? "" : "er"} hatte schon einen Wert und blieb unverändert. `
              : "") +
            r.hinweis
          : r.proposals.length
            ? "Alle vorgeschlagenen Felder hatten schon einen Wert — nichts geändert. " + r.hinweis
            : r.hinweis || "Zu diesem Abschnitt konnte nichts vorgeschlagen werden.",
      );
    },
    onError: (e) => setVorschlagHinweis(e instanceof Error ? e.message : String(e)),
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!d || !def) throw new Error("Entwurf fehlt");
      const fields: Record<string, FieldValue> = {
        ...d.sections[sectionId]?.fields,
      };
      for (const [key, value] of Object.entries(values))
        fields[key] = {
          value: value as FieldValue["value"],
          status: "confirmed",
          source: "user-form",
          confirmedByUser: true,
        };
      const section: SectionData = { fields };
      return api.update(id, {
        sections: { [sectionId]: section },
        expectedVersion: d.version,
      });
    },
    onSuccess: (r) => {
      qc.setQueryData(["draft", id], r);
      nav(`/entwurf/${id}`);
    },
  });
  if (!d || !def) return <p role="status">Abschnitt wird geladen …</p>;
  const templateNotes: Partial<Record<string, { title: string; text: string }>> = {
    "1": {
      title: "Mustersatz zum Rechtsanspruch",
      text: "Ein Rechtsanspruch besteht nicht. Der dafür vorgesehene Mustersatz wird bei der späteren Richtlinienerstellung automatisch ergänzt.",
    },
    "6": {
      title: "Mustersätze werden automatisch ergänzt",
      text: "Prüfrechte und Zweckbindungsfrist werden anhand der Finanzierungsquelle aus der Musterrichtlinie übernommen. Hier erfassen Sie nur die fachlich erforderlichen Angaben.",
    },
    "7": {
      title: "Verfahrenstexte aus der Musterrichtlinie",
      text: "Antrags- und Bewilligungsverfahren, Verwendungsnachweis sowie die zu beachtenden Vorschriften werden später aus den passenden Mustersätzen erzeugt. Ihre Auswahl steuert die benötigte Variante.",
    },
  };
  const templateNote = templateNotes[sectionId];
  return (
    <>
      <PageHeader eyebrow={`Abschnitt ${def.id} von 10`} title={def.title}>
        <p className="lead">{def.description}</p>
      </PageHeader>
      {templateNote && (
        <Alert kind="info" title={templateNote.title}>
          <p>{templateNote.text}</p>
        </Alert>
      )}
      {errors.length > 0 && (
        <Alert
          kind="error"
          title={`${errors.length} offene ${errors.length === 1 ? "Angabe" : "Angaben"}`}
        >
          <ul>
            {errors.map((e) => (
              <li key={e.fieldId}>
                <a href={`#${e.fieldId}`}>{e.message}</a>
              </li>
            ))}
          </ul>
        </Alert>
      )}
      <div className="actions">
        <button
          type="button"
          className="button button--secondary"
          disabled={vorschlag.isPending}
          onClick={() => {
            setVorschlagHinweis("");
            vorschlag.mutate();
          }}
        >
          {vorschlag.isPending ? "Wird gesucht …" : "Vorschlag holen"}
        </button>
      </div>
      {vorschlag.isPending && (
        <p role="status">
          Der Dienst sucht im Regelwerk und in früheren Verfahren. Das dauert ein bis zwei
          Minuten.
        </p>
      )}
      {vorschlagHinweis && (
        <Alert
          kind={vorschlag.isError ? "error" : "info"}
          title="Vorschlag"
        >
          <p>{vorschlagHinweis}</p>
        </Alert>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        {def.fields
          .filter((f) => fieldVisible(f, d.profile, values))
          .map((field) => {
            const error = errors.find((e) => e.fieldId === field.id)?.message;
            /*
              Woher der Wert in diesem Feld kommt, muss am Feld stehen — nicht nur in einer
              Meldung darüber. Nach dem Vorschlag sahen sechs Felder gleich aus, und welche
              zwei davon gerade vom Werkzeug gefüllt worden waren, stand als Satz weiter
              oben. Wer nach unten scrollt, hat ihn nicht mehr.

              Die Marke steht UNTER der Beschriftung, nicht darüber: oben sah sie aus, als
              gehörte sie zum vorigen Feld.
            */
            const p = vorausgefuellt[field.id];
            const marke = p ? (
              <p className="feld-marke">
                <strong>Vorschlag — noch nicht gespeichert.</strong>{" "}
                {p.deckung
                  ? `Gedeckt durch Ihre Angabe: „${p.deckung}"`
                  : "Aus dem Regelfall abgeleitet, nicht durch Ihre Angaben gedeckt — bitte besonders prüfen."}
                {p.musterbaustein && ` Satzrahmen: Musterbaustein ${p.musterbaustein}.`}
                {p.fundstelle && ` Vorbild: ${p.fundstelle}.`}
              </p>
            ) : null;
            if (field.kind === "radio" || field.kind === "checkbox")
              return (
                <div className="field" key={field.id}>
                  <Input
                    field={field}
                    value={values[field.id]}
                    onChange={(v) => setValues({ ...values, [field.id]: v })}
                    error={error}
                  />
                  {marke}
                  {field.help && (
                    <p id={`${field.id}-help`} className="help">
                      {field.help}
                    </p>
                  )}
                  {error && (
                    <p id={`${field.id}-error`} className="error">
                      {error}
                    </p>
                  )}
                </div>
              );
            return (
              <div className="field" key={field.id}>
                <label htmlFor={field.id}>
                  {field.label}
                  {field.required && <span aria-hidden="true"> *</span>}
                </label>
                {marke}
                {field.help && (
                  <p id={`${field.id}-help`} className="help">
                    {field.help}
                  </p>
                )}
                <Input
                  field={field}
                  value={values[field.id]}
                  onChange={(v) => setValues({ ...values, [field.id]: v })}
                  error={error}
                />
                {error && (
                  <p id={`${field.id}-error`} className="error">
                    {error}
                  </p>
                )}
              </div>
            );
          })}
        {save.error && (
          <Alert kind="error" title="Speichern fehlgeschlagen">
            {save.error.message}
          </Alert>
        )}
        <p className="required-note">
          Mit * gekennzeichnete Felder sind Pflichtfelder.
        </p>
        <div className="actions actions--between">
          <Link className="button button--secondary" to={`/entwurf/${id}`}>
            Abbrechen
          </Link>
          <button className="button button--primary" disabled={save.isPending}>
            {save.isPending ? "Speichert …" : "Speichern und zurück"}
          </button>
        </div>
      </form>
    </>
  );
}
