import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { VermerkEintrag, VermerkSicht } from "@richtlinie/shared";

/**
 * Der Prüfvermerk muss sichtbar und bearbeitbar sein.
 *
 * Er füllte sich seit Tagen bei jeder Prüfung, ließ sich über drei Endpunkte beantworten
 * und bestätigen — und hatte keine Oberfläche. Das Konzeptpapier verlangt ihn als zweites
 * Arbeitsergebnis neben der Richtlinie; unsichtbar ist er keines.
 */
const eintrag = (teil: Partial<VermerkEintrag> = {}): VermerkEintrag => ({
  id: "5:bagatellgrenze",
  adressat: "mdfe",
  sectionId: "5",
  regel: "bagatellgrenze",
  rechtsstelle: "Ziff. 1.5 VV zu § 44 LHO",
  beurteilung: "Bagatellgrenze 1000 Euro, abweichend von 2500 Euro.",
  status: "offen",
  ...teil,
});

const sicht = (eintraege: VermerkEintrag[]): VermerkSicht => ({
  eintraege,
  offen: eintraege.filter((e) => e.status === "offen").length,
  unbestaetigt: eintraege.filter((e) => e.status === "beantwortet").length,
  vollstaendig: eintraege.every(
    (e) => e.status === "bestaetigt" || e.status === "gegenstandslos",
  ),
});

vi.mock("./api", () => ({
  api: {
    vermerk: vi.fn(),
    begruenden: vi.fn(),
    bestaetigen: vi.fn(),
  },
}));

const { VermerkPage } = await import("./pages/Vermerk");

function zeichnen() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={["/entwurf/d1/vermerk"]}>
        <Routes>
          <Route path="/entwurf/:id/vermerk" element={<VermerkPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

async function mit(eintraege: VermerkEintrag[]) {
  const { api } = await import("./api");
  vi.mocked(api.vermerk).mockResolvedValue(sicht(eintraege));
  return api;
}

describe("Prüfvermerk", () => {
  beforeEach(() => cleanup());

  it("zeigt Feststellung und Rechtsstelle", async () => {
    await mit([eintrag()]);
    const { container } = zeichnen();
    await waitFor(() => expect(screen.getByText(/Bagatellgrenze 1000/)).toBeInTheDocument());
    expect(container.textContent).toContain("Ziff. 1.5 VV zu § 44 LHO");
    expect(container.textContent).toContain("Baustein 5");
  });

  it("sagt, dass die Richtlinie nicht einreichungsreif ist", async () => {
    await mit([eintrag()]);
    const { container } = zeichnen();
    await waitFor(() => expect(screen.getByText(/Es fehlen Begründungen/)).toBeInTheDocument());
    expect(container.textContent).toContain("nicht einreichungsreif");
  });

  it("bestätigen ist gesperrt, solange keine Begründung gespeichert ist", async () => {
    await mit([eintrag()]);
    zeichnen();
    await waitFor(() => expect(screen.getByText(/Bagatellgrenze 1000/)).toBeInTheDocument());
    // Getrennte Schritte: erst begründen, dann bestätigen — der Dienst weist es sonst ab.
    expect(screen.getByRole("button", { name: "Begründung bestätigen" })).toBeDisabled();
  });

  it("speichert eine eingegebene Begründung", async () => {
    const api = await mit([eintrag()]);
    vi.mocked(api.begruenden).mockResolvedValue(
      eintrag({ status: "beantwortet", begruendung: "Kleinteilige Förderung." }),
    );
    zeichnen();
    await waitFor(() => expect(screen.getByText(/Bagatellgrenze 1000/)).toBeInTheDocument());
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "Kleinteilige Förderung." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Begründung speichern" }));
    await waitFor(() =>
      expect(api.begruenden).toHaveBeenCalledWith("d1", "5:bagatellgrenze", "Kleinteilige Förderung."),
    );
  });

  it("meldet Vollständigkeit, wenn alles bestätigt ist", async () => {
    await mit([eintrag({ status: "bestaetigt", begruendung: "x" })]);
    zeichnen();
    await waitFor(() =>
      expect(screen.getByText(/Alle Abweichungen sind begründet/)).toBeInTheDocument(),
    );
  });

  it("zeigt gegenstandslose Feststellungen getrennt und ohne Eingabefeld", async () => {
    // Sie werden nicht gelöscht: der Vermerk weist nach, was geprüft wurde.
    await mit([eintrag({ status: "gegenstandslos", begruendung: "früher erklärt" })]);
    const { container } = zeichnen();
    await waitFor(() =>
      expect(screen.getByText("Nicht mehr einschlägig")).toBeInTheDocument(),
    );
    expect(container.textContent).toContain("früher erklärt");
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("ohne Einträge bleibt es bei einem Hinweis", async () => {
    await mit([]);
    zeichnen();
    await waitFor(() => expect(screen.getByText("Noch keine Einträge")).toBeInTheDocument());
  });
});
