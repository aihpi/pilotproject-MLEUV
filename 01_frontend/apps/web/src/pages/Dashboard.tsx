import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { vollstaendigkeit, type FundingProfile } from "@richtlinie/shared";
import { api } from "../api";
import { Alert, PageHeader, Progress } from "../components";

export function Dashboard() {
  const qc = useQueryClient();
  const {
    data = [],
    isLoading,
    error,
  } = useQuery({ queryKey: ["drafts"], queryFn: api.drafts });
  // Löschen ist endgültig und trifft Arbeit, die jemand geleistet hat. Deshalb eine
  // Rückfrage, die den Titel nennt — ein „Wirklich löschen?" ohne Gegenstand beantwortet
  // man zu leicht mit ja.
  const loeschen = useMutation({
    mutationFn: (id: string) => api.loeschen(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["drafts"] }),
  });
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
        {/*
          Der zweite Weg durch dasselbe Wissen: beim Erstellen wird aus Angaben ein Text,
          beim Prüfen aus einem Text wieder Angaben. Er gehört deshalb gleichrangig neben
          das Erstellen und nicht in ein Untermenü.
        */}
        <Link className="button button--secondary" to="/pruefen">
          Vorhandenen Entwurf prüfen
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
              <Progress value={vollstaendigkeit(d)} label="Vollständigkeit" />
              <div className="actions actions--karte">
                <button
                  className="button button--tertiary"
                  disabled={loeschen.isPending}
                  onClick={() => {
                    if (
                      window.confirm(
                        `„${d.title}" endgültig löschen? Das lässt sich nicht rückgängig machen.`,
                      )
                    )
                      loeschen.mutate(d.id);
                  }}
                >
                  Löschen
                </button>
              </div>
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
