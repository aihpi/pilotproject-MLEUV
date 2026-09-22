import type {
  ChatReply,
  FieldProposal,
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
    const b = await res.json().catch(() => ({ message: "Unbekannter Fehler" }));
    throw new Error(b.message);
  }
  return res.json();
}
/** Was der Prüf-Modus zurückgibt. Siehe pruefmodus.py — Struktur bewusst flach. */
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
  bestaetigen: (id: string, eintragId: string) =>
    request<VermerkEintrag>(`/api/drafts/${id}/vermerk/${eintragId}/bestaetigen`, {
      method: "POST",
    }),
};
export const api =
  import.meta.env.VITE_STATIC === "true" ? staticApi : serverApi;
