import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import type { FundingProfile } from "@richtlinie/shared";
import { api } from "../api";
import { Alert, PageHeader, Progress } from "../components";

export function Dashboard() {
  const {
    data = [],
    isLoading,
    error,
  } = useQuery({ queryKey: ["drafts"], queryFn: api.drafts });
  return (
    <>
      <PageHeader eyebrow="Arbeitsbereich" title="Förderrichtlinien erstellen">
        <p className="lead">
          Erheben Sie die Eckpunkte im geführten Chat und prüfen Sie
          anschließend jeden Abschnitt strukturiert.
        </p>
      </PageHeader>
      <Alert title="KI unterstützt – Sie entscheiden">
        <p>
          Vorschläge werden erst nach Ihrer Bestätigung übernommen. Der
          Generator ersetzt keine fachliche oder rechtliche Prüfung.
        </p>
      </Alert>
      <div className="actions">
        <Link className="button button--primary" to="/neu">
          Neue Richtlinie erstellen
        </Link>
      </div>
      <section aria-labelledby="drafts-title">
        <h2 id="drafts-title">Ihre Entwürfe</h2>
        {isLoading && <p role="status">Entwürfe werden geladen …</p>}
        {error && (
          <Alert kind="error" title="Entwürfe konnten nicht geladen werden">
            {error.message}
          </Alert>
        )}
        {!isLoading && !data.length && (
          <div className="empty">
            <h3>Noch keine Entwürfe</h3>
            <p>
              Beginnen Sie mit einer Förderidee. Sie können den Vorgang
              jederzeit unterbrechen.
            </p>
          </div>
        )}
        <div className="card-grid">
          {data.map((d) => (
            <article className="card" key={d.id}>
              <p className="eyebrow">
                Zuletzt gespeichert{" "}
                {new Date(d.updatedAt).toLocaleString("de-DE")}
              </p>
              <h3>
                <Link to={`/entwurf/${d.id}`}>{d.title}</Link>
              </h3>
              <p>{d.profile.gak ? "Bund/Land (GAK)" : "Land"}</p>
              <Progress
                value={Math.max(
                  0,
                  Math.round(
                    (1 -
                      d.validation.issues.filter((i) => i.severity === "error")
                        .length /
                        25) *
                      100,
                  ),
                )}
                label="Vollständigkeit"
              />
            </article>
          ))}
        </div>
      </section>
    </>
  );
}

export function NewDraft() {
  const nav = useNavigate();
  const [profile, setProfile] = useState<FundingProfile>({
    jurisdiction: "land",
    gak: false,
    stateAid: true,
    fundingType: "project",
  });
  const mutation = useMutation({
    mutationFn: () => api.create(profile),
    onSuccess: (d) => nav(`/entwurf/${d.id}/chat`),
  });
  return (
    <>
      <PageHeader eyebrow="Neue Förderrichtlinie" title="Rahmen der Förderung">
        <p className="lead">
          Die Finanzierungsquelle steuert, welche Mustersätze und Prüfhinweise
          später benötigt werden.
        </p>
      </PageHeader>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          mutation.mutate();
        }}
      >
        <fieldset>
          <legend>
            Aus welcher Finanzierungsquelle erfolgt die Förderung?
          </legend>
          <label className="choice">
            <input
              type="radio"
              name="funding-source"
              value="gak"
              checked={profile.gak}
              onChange={() =>
                setProfile({
                  ...profile,
                  jurisdiction: "mixed",
                  gak: true,
                  stateAid: true,
                })
              }
            />
            <span>
              <strong>Bund/Land (GAK)</strong>
              <small>
                Gemeinschaftsaufgabe „Verbesserung der Agrarstruktur und des
                Küstenschutzes“
              </small>
            </span>
          </label>
          <label className="choice">
            <input
              type="radio"
              name="funding-source"
              value="land"
              checked={!profile.gak}
              onChange={() =>
                setProfile({
                  ...profile,
                  jurisdiction: "land",
                  gak: false,
                  stateAid: true,
                })
              }
            />
            <span>
              <strong>Land</strong>
            </span>
          </label>
        </fieldset>
        <Alert kind="info" title="Beihilferechtliche Prüfung">
          <p>
            Der Beihilfebezug wird unabhängig von der Finanzierungsquelle im
            weiteren Ablauf geprüft.
          </p>
        </Alert>
        {mutation.error && (
          <Alert kind="error" title="Entwurf konnte nicht erstellt werden">
            {mutation.error.message}
          </Alert>
        )}
        <div className="actions">
          <button
            className="button button--primary"
            disabled={mutation.isPending}
          >
            {mutation.isPending ? "Wird angelegt …" : "Chat-Erhebung starten"}
          </button>
          <Link className="button button--secondary" to="/">
            Abbrechen
          </Link>
        </div>
      </form>
    </>
  );
}
