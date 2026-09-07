import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { staticApi } from "./api-static";
vi.stubGlobal(
  "fetch",
  vi.fn(
    async () =>
      new Response(JSON.stringify([]), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
  ),
);
describe("App", () => {
  it("renders accessible dashboard heading", async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <App />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(
      await screen.findByRole("heading", {
        name: "Förderrichtlinien erstellen",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Zum Inhalt springen" }),
    ).toBeInTheDocument();
  });
  it("uses the revised funding-source question", async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={["/neu"]}>
          <App />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(
      await screen.findByRole("group", {
        name: "Aus welcher Finanzierungsquelle erfolgt die Förderung?",
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Bund\/Land \(GAK\)/ })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Land" })).toBeInTheDocument();
    expect(screen.queryByText("Weitere Förderkontexte")).not.toBeInTheDocument();
  });
  it("renders the second-stage guideline editor", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          title: "Richtlinie für nachhaltige Vorhaben",
          sections: [
            {
              id: "0",
              title: "Titel und Präambel",
              paragraphs: [
                { label: "Titel", value: "Nachhaltige Vorhaben" },
              ],
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={["/entwurf/demo/redaktion"]}>
          <App />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(
      await screen.findByRole("heading", {
        name: "Richtlinie für nachhaltige Vorhaben",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("navigation", { name: "Erstellungsprozess" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "Änderungen von KI prüfen lassen",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("Begründung des Agenten")).toBeInTheDocument();
    expect(screen.getByText("RAG-Findings und Fundstellen")).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", {
        name: /2 offene KI-Rückfragen und Vorschläge/,
      }),
    );
    expect(
      screen.getByRole("heading", { name: "KI-Rückfragen und Vorschläge" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "Begründet in RL-Text übernehmen",
      }),
    ).toBeDisabled();
  });
  it("seeds complete example drafts in the offline mockup", async () => {
    localStorage.removeItem("richtliniengenerator-offline-drafts");
    const drafts = await staticApi.drafts();
    expect(drafts).toHaveLength(2);
    for (const draft of drafts) {
      expect(draft.validation.valid).toBe(true);
      expect(Object.keys(draft.sections)).toHaveLength(11);
      expect(
        Object.values(draft.sections).every(
          (section) => Object.keys(section.fields).length > 0,
        ),
      ).toBe(true);
    }
  });
});
