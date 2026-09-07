import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  fieldVisible,
  sections,
  type FieldDefinition,
  type FieldValue,
  type RichtlinieDraft,
  type SectionData,
} from "@richtlinie/shared";
import { api } from "../api";
import { Alert, PageHeader, ProcessSteps, Progress, StatusBadge } from "../components";
function sectionStatus(d: RichtlinieDraft, id: string) {
  const section = sections.find((s) => s.id === id)!;
  const vals = d.sections[id]?.fields ?? {};
  const visible = section.fields.filter((f) => fieldVisible(f, d.profile, {}));
  const required = visible.filter((f) => f.required);
  if (!Object.keys(vals).length) return "empty";
  if (required.some((f) => !vals[f.id]?.value)) return "invalid";
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
  const errors = useMemo(
    () => d?.validation.issues.filter((i) => i.sectionId === sectionId) ?? [],
    [d, sectionId],
  );
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
            if (field.kind === "radio" || field.kind === "checkbox")
              return (
                <div className="field" key={field.id}>
                  <Input
                    field={field}
                    value={values[field.id]}
                    onChange={(v) => setValues({ ...values, [field.id]: v })}
                    error={error}
                  />
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
