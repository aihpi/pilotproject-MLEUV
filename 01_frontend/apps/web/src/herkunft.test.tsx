import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { ChatReply, RichtlinieDraft } from "@richtlinie/shared";
import { emptySections } from "@richtlinie/shared";

/**
 * Die Herkunft eines Vorschlags muss sichtbar sein.
 *
 * Vorher zeigte der Vorschlagskasten nur Beschriftung und Wert; Konfidenz, Deckung und
 * Beleg kamen an und wurden weggeworfen. Damit sah das Werkzeug aus wie ein beliebiger
 * Textgenerator — Nachvollziehbarkeit ist aber sein Zweck. Dieser Test hält fest, dass die
 * Angaben die Oberfläche erreichen.
 */
const entwurf: RichtlinieDraft = {
  id: "d1", ownerId: "u", title: "Test",
  profile: { jurisdiction: "land", gak: false, stateAid: false, fundingType: "project" },
  sections: emptySections(),
  validation: { valid: false, issues: [] },
  status: "draft", version: 1, createdAt: "", updatedAt: "",
};

const antwort: ChatReply = {
  message: "Ich habe Ihre Angabe zugeordnet.",
  extraction: {
    id: "e1", messageId: "m1", followUpQuestions: [], conflicts: [],
    proposals: [{
      sectionId: "1", fieldId: "goal", label: "Förderziel",
      value: "Verbesserung des Tierschutzes im Land Brandenburg",
      confidence: 0.95, evidence: "",
      deckung: "damit der Tierschutz verbessert wird",
      musterbaustein: "1.1",
      belegzitat: "Das Land Brandenburg gewährt nach Maßgabe dieser Richtlinie",
      fundstelle: "VV zu § 44 LHO, Nummer 1.1 (S. 2)",
    }],
  },
  progress: 33,
};

vi.mock("./api", () => ({
  api: {
    draft: vi.fn(async () => entwurf),
    chat: vi.fn(async () => antwort),
    confirm: vi.fn(),
  },
}));

const { ChatPage } = await import("./pages/Chat");

function zeichnen() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={["/entwurf/d1/chat"]}>
        <Routes>
          <Route path="/entwurf/:id/chat" element={<ChatPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("Herkunft im Vorschlagskasten", () => {
  beforeEach(async () => {
    // Ohne aktivierte Globals räumt testing-library nicht von selbst auf; sonst stehen
    // zwei Darstellungen im DOM und jede Abfrage findet zwei Treffer.
    cleanup();
    const { api } = await import("./api");
    // Auch den Zähler zurücksetzen, nicht nur die Antwort — sonst zählt ein Test die
    // Aufrufe der vorherigen mit.
    vi.mocked(api.chat).mockClear();
    vi.mocked(api.chat).mockResolvedValue(antwort);
  });

  it("zeigt Deckung, Musterbaustein und Beleg", async () => {
    const { container } = zeichnen();
    const eingabe = await screen.findByLabelText("Ihre Antwort");
    fireEvent.change(eingabe, { target: { value: "Tierheime fördern" } });
    fireEvent.click(screen.getByRole("button", { name: "Antwort senden" }));

    await waitFor(() => expect(screen.getByText("Das habe ich verstanden")).toBeInTheDocument());
    const text = container.textContent ?? "";
    expect(text).toContain("durch Ihre Angabe gedeckt");
    expect(text).toContain("damit der Tierschutz verbessert wird");
    expect(text).toContain("1.1");
    expect(text).toContain("VV zu § 44 LHO, Nummer 1.1 (S. 2)");
    expect(text).toContain("95 %");
  });

  it("markiert einen Vorschlag ohne Deckung als abgeleitet", async () => {
    const { api } = await import("./api");
    vi.mocked(api.chat).mockResolvedValue({
      ...antwort,
      extraction: {
        ...antwort.extraction,
        proposals: [{
          ...antwort.extraction.proposals[0]!,
          deckung: undefined, confidence: 0.4,
        }],
      },
    });
    const { container } = zeichnen();
    const eingabe = await screen.findByLabelText("Ihre Antwort");
    fireEvent.change(eingabe, { target: { value: "x y z" } });
    fireEvent.click(screen.getByRole("button", { name: "Antwort senden" }));

    await waitFor(() => expect(screen.getByText("Das habe ich verstanden")).toBeInTheDocument());
    const text = container.textContent ?? "";
    expect(text).toContain("aus dem Regelfall abgeleitet");
    expect(text).toContain("40 %");
  });

  // Das Prozessmodell trennt Fund und Vorschlag. Sähe eine Anlehnung an eine fremde
  // Richtlinie aus wie eine Fundstelle in der VV, würde sie für eine Rechtsgrundlage
  // gehalten — der teuerste Fehler, den die Darstellung machen kann.
  it("weist ein Vorbild aus einer fremden Richtlinie als solches aus", async () => {
    const { api } = await import("./api");
    vi.mocked(api.chat).mockResolvedValue({
      ...antwort,
      extraction: {
        ...antwort.extraction,
        proposals: [{
          ...antwort.extraction.proposals[0]!,
          vorbild: true,
          fundstelle: "Richtlinie Tierheimförderung, Nummer 4.1",
        }],
      },
    });
    const { container } = zeichnen();
    const eingabe = await screen.findByLabelText("Ihre Antwort");
    fireEvent.change(eingabe, { target: { value: "Voraussetzungen?" } });
    fireEvent.click(screen.getByRole("button", { name: "Antwort senden" }));

    await waitFor(() => expect(screen.getByText("Das habe ich verstanden")).toBeInTheDocument());
    const text = container.textContent ?? "";
    expect(text).toContain("Vorbild");
    expect(text).toContain("so geregelt in");
    expect(text).toContain("Keine Rechtsgrundlage");
    expect(screen.queryByText("Dazu gefunden")).toBeNull();
  });

  it("Enter sendet, Umschalt+Enter macht einen Absatz", async () => {
    // Der Hilfetext versprach das Senden per Tastatur, bevor es jemand gebaut hatte.
    const { api } = await import("./api");
    zeichnen();
    const eingabe = await screen.findByLabelText("Ihre Antwort");
    fireEvent.change(eingabe, { target: { value: "Tierheime fördern" } });
    fireEvent.keyDown(eingabe, { key: "Enter", shiftKey: true });
    expect(api.chat).not.toHaveBeenCalled();
    fireEvent.keyDown(eingabe, { key: "Enter" });
    await waitFor(() => expect(api.chat).toHaveBeenCalledWith("d1", "Tierheime fördern"));
  });

  it("ein Klick auf die Fundstelle öffnet den Beleg daneben, nicht in einem neuen Tab", async () => {
    // Beim Prüfen lautet die Frage „steht das da wirklich so" — dafür muss man Vorschlag
    // und Beleg gleichzeitig sehen.
    const { api } = await import("./api");
    vi.mocked(api.chat).mockResolvedValue({
      ...antwort,
      extraction: {
        ...antwort.extraction,
        proposals: [{
          ...antwort.extraction.proposals[0]!,
          belegdatei: "RL Tierheimförderung_16.pdf",
          belegseite: 3,
        }],
      },
    });
    zeichnen();
    const eingabe = await screen.findByLabelText("Ihre Antwort");
    fireEvent.change(eingabe, { target: { value: "Tierheime fördern" } });
    fireEvent.click(screen.getByRole("button", { name: "Antwort senden" }));
    await waitFor(() => expect(screen.getByText("Das habe ich verstanden")).toBeInTheDocument());

    expect(screen.queryByRole("complementary")).toBeNull();
    fireEvent.click(screen.getByRole("link", { name: /VV zu § 44 LHO/ }));

    const panel = await screen.findByRole("complementary");
    expect(panel).toBeInTheDocument();
    const rahmen = panel.querySelector("iframe");
    expect(rahmen?.getAttribute("src")).toContain("#page=3");
    expect(rahmen?.getAttribute("src")).toContain("RL%20Tierheimf%C3%B6rderung_16.pdf");

    fireEvent.click(screen.getByRole("button", { name: "Schließen" }));
    await waitFor(() => expect(screen.queryByRole("complementary")).toBeNull());
  });

  it("ohne Vorbild heißt es „Dazu gefunden“, nicht „Beleg“", async () => {
    // Gemessen: die Fundstelle verankert das Modell (88 % gegen 76 % Regeltreue), sie
    // belegt den Wert aber nicht. „Beleg" versprach mehr, als dahintersteht.
    const { container } = zeichnen();
    const eingabe = await screen.findByLabelText("Ihre Antwort");
    fireEvent.change(eingabe, { target: { value: "Tierheime fördern" } });
    fireEvent.click(screen.getByRole("button", { name: "Antwort senden" }));

    await waitFor(() => expect(screen.getByText("Das habe ich verstanden")).toBeInTheDocument());
    expect(screen.getByText("Dazu gefunden")).toBeInTheDocument();
    expect(screen.queryByText("Vorbild")).toBeNull();
    // Der Zusatz ist wichtiger als die Marke: ohne ihn liest man auch dies als Bestätigung.
    expect(container.textContent).toContain("Kein Nachweis für diesen Wert");
  });
});
