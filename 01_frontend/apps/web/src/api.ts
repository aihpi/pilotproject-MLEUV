import type {
  ChatReply,
  FieldProposal,
  Fundstelle,
  FundingProfile,
  RichtlinieDraft,
  SectionData,
  VermerkEintrag,
  VermerkSicht,
} from "@richtlinie/shared";
import { staticApi } from "./api-static";
async function request<T>(url: string, init?: RequestInit): Promise<T> {
  // Die Kopfzeile nur setzen, wenn auch etwas im Rumpf steht. Ein POST ohne Rumpf, aber mit
  // `content-type: application/json`, lehnt Fastify ab: „Body cannot be empty when
  // content-type is set to 'application/json'". Genau das traf „Begründung bestätigen" —
  // der Schritt braucht keine Daten, nur die Adresse des Eintrags.
  const res = await fetch(url, {
    ...init,
    headers: init?.body
      ? { "content-type": "application/json", ...init?.headers }
      : { ...init?.headers },
  });
  if (!res.ok) {
    // Ein Fehler ohne Ursache ist keiner. „Unbekannter Fehler" stand hier für alles, was
    // nicht als JSON zurückkam — eine abgebrochene Weiterleitung sah damit aus wie ein
    // Fehler im Dienst, und die Suche ging an der falschen Stelle los.
    const b = await res.json().catch(() => null);
    throw new Error(
      b?.message ??
        `Der Dienst hat nicht wie erwartet geantwortet (HTTP ${res.status} ${res.statusText}). ` +
          "Bei langen Aufrufen kann die Verbindung abgebrochen sein.",
    );
  }
  return res.json();
}
/** Was der Prüf-Modus zurückgibt. Siehe pruefmodus.py — Struktur bewusst flach. */
/** Eine fremde Begründung mit Fundstelle. Unverändert aus dem Korpus, nicht formuliert. */
export type Vorbild = {
  fundstelle: string;
  text: string;
  datei?: string | null;
  seite?: number | null;
};

export type Pruefbericht = {
  abschnitte: Record<string, { titel: string; zeichen: number }>;
  befunde: { baustein: number; art: string; schwere: "fehler" | "hinweis"; text: string }[];
};

const serverApi = {
  session: () => request<{ user: { name: string } }>("/api/session"),
  drafts: () => request<RichtlinieDraft[]>("/api/drafts"),
  draft: (id: string) => request<RichtlinieDraft>(`/api/drafts/${id}`),
  create: (profile: FundingProfile) =>
    request<RichtlinieDraft>("/api/drafts", {
      method: "POST",
      body: JSON.stringify({ profile }),
    }),
  update: (
    id: string,
    patch: {
      title?: string;
      profile?: FundingProfile;
      sections?: Record<string, SectionData>;
      status?: RichtlinieDraft["status"];
      expectedVersion: number;
    },
  ) =>
    request<RichtlinieDraft>(`/api/drafts/${id}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),
  chat: (id: string, message: string) =>
    request<ChatReply>(`/api/drafts/${id}/chat/messages`, {
      method: "POST",
      body: JSON.stringify({ message }),
    }),
  // Ohne Nachricht: aus dem bisherigen Verlauf füllen, ohne dass die Bearbeiterin „wie oben"
  // tippen muss.
  chatAusVerlauf: (id: string) =>
    request<ChatReply>(`/api/drafts/${id}/chat/messages`, {
      method: "POST",
      body: JSON.stringify({}),
    }),
  confirm: (id: string, extractionId: string, proposals: FieldProposal[]) =>
    request<{ draft: RichtlinieDraft; nextQuestion: string }>(
      `/api/drafts/${id}/extractions/${extractionId}/confirm`,
      { method: "POST", body: JSON.stringify({ proposals }) },
    ),
  reject: (id: string, extractionId: string) =>
    request<{ ok: boolean; nextQuestion?: string }>(
      `/api/drafts/${id}/extractions/${extractionId}/reject`,
      { method: "POST" },
    ),
  // Vorschläge für einen Abschnitt, aus dem Formular heraus — derselbe Dienst wie im Chat.
  abschnittsvorschlag: (id: string, nr: string) =>
    request<{ proposals: FieldProposal[]; hinweis: string; fundstellen?: Fundstelle[] }>(
      `/api/drafts/${id}/abschnitt/${nr}/vorschlag`,
      { method: "POST" },
    ),
  /** Eine Rückmeldung ablegen. `gespeichert: false` heißt: Schreiben fehlgeschlagen. */
  rueckmeldung: (id: string, eintrag: Record<string, unknown>) =>
    request<{ gespeichert: boolean; grund?: string }>(
      `/api/drafts/${id}/rueckmeldung`,
      { method: "POST", body: JSON.stringify(eintrag) },
    ),
  /** Die Angaben freigeben — im Prozessmodell der Schritt vor dem Ausformulieren. */
  freigeben: (id: string, person: string) =>
    request<RichtlinieDraft>(`/api/drafts/${id}/freigabe`, {
      method: "POST",
      body: JSON.stringify({ person }),
    }),
  freigabeZuruecknehmen: (id: string) =>
    request<RichtlinieDraft>(`/api/drafts/${id}/freigabe`, { method: "DELETE" }),
  loeschen: (id: string) =>
    fetch(`/api/drafts/${id}`, { method: "DELETE" }).then((res) => {
      if (!res.ok) throw new Error("Der Entwurf konnte nicht gelöscht werden.");
    }),
  preview: (id: string) =>
    request<{
      title: string;
      sections: {
        id: string;
        title: string;
        paragraphs: { label: string; value: unknown }[];
      }[];
    }>(`/api/drafts/${id}/preview`),
  vermerk: (id: string) => request<VermerkSicht>(`/api/drafts/${id}/vermerk`),
  // Kein Entwurf im Spiel: ein fremdes Dokument wird geprüft und nicht gespeichert.
  pruefen: async (datei: File): Promise<Pruefbericht> => {
    const res = await fetch(`/api/pruefen?datei=${encodeURIComponent(datei.name)}`, {
      method: "POST",
      headers: { "content-type": datei.type || "application/octet-stream" },
      body: await datei.arrayBuffer(),
    });
    const daten = await res.json();
    if (!res.ok) throw new Error(daten.message ?? `HTTP ${res.status}`);
    return daten as Pruefbericht;
  },
  begruenden: (id: string, eintragId: string, begruendung: string) =>
    request<VermerkEintrag>(`/api/drafts/${id}/vermerk/${eintragId}/begruendung`, {
      method: "POST",
      body: JSON.stringify({ begruendung }),
    }),
  richtlinieErzeugen: (id: string) =>
    request<RichtlinieDraft>(`/api/drafts/${id}/richtlinie`, { method: "POST" }),
  /** Wie frühere Richtlinien dieselbe Abweichung begründet haben. Vorbilder, keine Vorlage. */
  vorbilder: (id: string, eintragId: string) =>
    request<{ vorbilder: Vorbild[] }>(
      `/api/drafts/${id}/vermerk/${eintragId}/vorbilder`,
      { method: "POST" },
    ),
  bestaetigen: (id: string, eintragId: string) =>
    request<VermerkEintrag>(`/api/drafts/${id}/vermerk/${eintragId}/bestaetigen`, {
      method: "POST",
    }),
};
export const api =
  import.meta.env.VITE_STATIC === "true" ? staticApi : serverApi;
