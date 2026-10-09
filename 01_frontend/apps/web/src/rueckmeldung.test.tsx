import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Die Geste muss bleiben, wie sie ist.
 *
 * Zuerst sendete ein Klick auf ein Wort sofort — die Bearbeiterin wollte aber erst ein Wort
 * wählen UND dann etwas schreiben. Genau das prüft dieser Test: Auswählen sendet nicht,
 * Absenden sendet alles zusammen, Abbrechen verwirft.
 */
const gesendet = vi.fn();
vi.mock("./api", () => ({
  api: {
    rueckmeldung: (id: string, eintrag: Record<string, unknown>) => {
      gesendet(id, eintrag);
      return Promise.resolve({ gespeichert: true });
    },
  },
}));

const { Rueckmeldung } = await import("./Rueckmeldung");

const zeigen = () =>
  render(
    <Rueckmeldung
      entwurf="d1"
      was="dem Fördersatz"
      bezug={{ ort: "fundstelle", baustein: "5", feld: "fundingRate",
               feldLabel: "Fördersatz in Prozent" }}
    />,
  );

const oeffnen = () => fireEvent.click(screen.getByRole("button", { name: /Rückmeldung/ }));

beforeEach(() => gesendet.mockClear());
afterEach(cleanup);

describe("Rückmeldung geben", () => {
  it("zeigt die Wörter des Ortes, nicht die eines anderen", () => {
    zeigen();
    oeffnen();
    expect(screen.getByRole("button", { name: "nichtssagend" })).toBeTruthy();
    // „Vorlagentext" gehört zum Feldwert, nicht zur Fundstelle.
    expect(screen.queryByRole("button", { name: "Vorlagentext" })).toBeNull();
  });

  it("ein Wort auszuwählen sendet nichts", () => {
    zeigen();
    oeffnen();
    fireEvent.click(screen.getByRole("button", { name: "nichtssagend" }));
    expect(gesendet).not.toHaveBeenCalled();
  });

  it("ein zweiter Klick nimmt die Auswahl zurück", async () => {
    zeigen();
    oeffnen();
    const wort = screen.getByRole("button", { name: "nichtssagend" });
    fireEvent.click(wort);
    fireEvent.click(wort);
    fireEvent.click(screen.getByRole("button", { name: "Absenden" }));
    // Ohne Auswahl und ohne Text ist „Absenden" gesperrt — es darf nichts ankommen.
    expect(gesendet).not.toHaveBeenCalled();
  });

  it("Absenden schickt Wort und beide Texte zusammen", async () => {
    zeigen();
    oeffnen();
    fireEvent.click(screen.getByRole("button", { name: "nichtssagend" }));
    fireEvent.change(screen.getByLabelText("Was stimmt nicht?"), {
      target: { value: "Der Satz steht in jeder Richtlinie." },
    });
    fireEvent.change(screen.getByLabelText("Wie wäre es richtig?"), {
      target: { value: "Gesucht ist der Name der Bewilligungsstelle." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Absenden" }));
    await waitFor(() => expect(gesendet).toHaveBeenCalledTimes(1));
    expect(gesendet.mock.calls[0]![0]).toBe("d1");
    expect(gesendet.mock.calls[0]![1]).toMatchObject({
      ort: "fundstelle",
      baustein: "5",
      feld: "fundingRate",
      urteil: "nichtssagend",
      text: "Der Satz steht in jeder Richtlinie.",
      besser: "Gesucht ist der Name der Bewilligungsstelle.",
    });
  });

  it("Text allein genügt, auch ohne Wort", async () => {
    zeigen();
    oeffnen();
    fireEvent.change(screen.getByLabelText("Was stimmt nicht?"), {
      target: { value: "Hier fehlt etwas." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Absenden" }));
    await waitFor(() => expect(gesendet).toHaveBeenCalledTimes(1));
    expect(gesendet.mock.calls[0]![1].urteil).toBeUndefined();
  });

  it("Abbrechen verwirft", () => {
    zeigen();
    oeffnen();
    fireEvent.change(screen.getByLabelText("Was stimmt nicht?"), {
      target: { value: "egal" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Abbrechen" }));
    expect(gesendet).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("Was stimmt nicht?")).toBeNull();
  });

  it("nach dem Absenden zeigt der Knopf, dass schon etwas gesagt wurde", async () => {
    zeigen();
    oeffnen();
    fireEvent.click(screen.getByRole("button", { name: "nichtssagend" }));
    fireEvent.click(screen.getByRole("button", { name: "Absenden" }));
    await waitFor(() => expect(screen.getByText("Danke, notiert.")).toBeTruthy());
    // Die Bestätigung verschwindet wieder, der Knopf trägt danach das Häkchen.
    await waitFor(
      () => expect(screen.getByRole("button", { name: /✓/ })).toBeTruthy(),
      { timeout: 4000 },
    );
  });
});
