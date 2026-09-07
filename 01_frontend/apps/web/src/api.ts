import type {
  ChatReply,
  FieldProposal,
  FundingProfile,
  RichtlinieDraft,
  SectionData,
} from "@richtlinie/shared";
import { staticApi } from "./api-static";
async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "content-type": "application/json", ...init?.headers },
  });
  if (!res.ok) {
    const b = await res.json().catch(() => ({ message: "Unbekannter Fehler" }));
    throw new Error(b.message);
  }
  return res.json();
}
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
  confirm: (id: string, extractionId: string, proposals: FieldProposal[]) =>
    request<{ draft: RichtlinieDraft; nextQuestion: string }>(
      `/api/drafts/${id}/extractions/${extractionId}/confirm`,
      { method: "POST", body: JSON.stringify({ proposals }) },
    ),
  reject: (id: string, extractionId: string) =>
    request(`/api/drafts/${id}/extractions/${extractionId}/reject`, {
      method: "POST",
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
};
export const api =
  import.meta.env.VITE_STATIC === "true" ? staticApi : serverApi;
