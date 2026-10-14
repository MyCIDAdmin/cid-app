import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as hooks from "../../hooks/useRegionen";
import { renderWithProviders } from "../../test/renderWithProviders";
import type { Beitrag } from "../../types/regionen";
import BeitraegeBereich from "./BeitraegeBereich";

vi.mock("../../hooks/useRegionen", () => ({
  useBeitraege: vi.fn(),
  useBeitragAnlegen: vi.fn(),
  useBeitragAendern: vi.fn(),
  useBeitragLoeschen: vi.fn(),
  useBeitragBildHochladen: vi.fn(),
  useBeitragBildEntfernen: vi.fn(),
  useBeitragAusblenden: vi.fn(),
  useReaktionSetzen: vi.fn(),
}));

function beitrag(o: Partial<Beitrag> = {}): Beitrag {
  return {
    id: "b1",
    titel: "Rückblick Hamburg",
    text: "Ein toller Abend.",
    bild_url: null,
    autor_name: "Alex",
    created_at: "2026-10-10T18:00:00Z",
    ausgeblendet: false,
    ausgeblendet_grund: "",
    reaktionen: [
      { art: "daumen", anzahl: 0, meine: false },
      { art: "herz", anzahl: 3, meine: true },
      { art: "feier", anzahl: 0, meine: false },
      { art: "applaus", anzahl: 0, meine: false },
      { art: "staunen", anzahl: 0, meine: false },
    ],
    darf_bearbeiten: false,
    darf_ausblenden: false,
    ...o,
  };
}

const m = {
  anlegen: vi.fn(),
  reagieren: vi.fn(),
  ausblenden: vi.fn(),
  loeschen: vi.fn(),
};

function mock(ergebnisse: Beitrag[], gesamt = ergebnisse.length) {
  vi.mocked(hooks.useBeitraege).mockReturnValue({
    data: { gesamt, ergebnisse },
    isLoading: false,
    isError: false,
  } as unknown as ReturnType<typeof hooks.useBeitraege>);
  const mut = (fn: ReturnType<typeof vi.fn>) => ({ mutate: fn, isPending: false }) as never;
  vi.mocked(hooks.useBeitragAnlegen).mockReturnValue(mut(m.anlegen));
  vi.mocked(hooks.useReaktionSetzen).mockReturnValue(mut(m.reagieren));
  vi.mocked(hooks.useBeitragAusblenden).mockReturnValue(mut(m.ausblenden));
  vi.mocked(hooks.useBeitragLoeschen).mockReturnValue(mut(m.loeschen));
  vi.mocked(hooks.useBeitragAendern).mockReturnValue(mut(vi.fn()));
  vi.mocked(hooks.useBeitragBildHochladen).mockReturnValue(mut(vi.fn()));
  vi.mocked(hooks.useBeitragBildEntfernen).mockReturnValue(mut(vi.fn()));
}

describe("BeitraegeBereich", () => {
  beforeEach(() => vi.clearAllMocks());

  it("zeigt Beiträge und keinen Editor für Lesende", () => {
    mock([beitrag()]);
    renderWithProviders(<BeitraegeBereich slug="nord" darfSchreiben={false} />);
    expect(screen.getByText("Rückblick Hamburg")).toBeInTheDocument();
    expect(screen.getByText(/Alex/)).toBeInTheDocument();
    expect(screen.queryByText("beitrag_veroeffentlichen")).not.toBeInTheDocument();
    expect(screen.queryByText("beitrag_bearbeiten")).not.toBeInTheDocument();
    expect(screen.queryByText("beitrag_ausblenden")).not.toBeInTheDocument();
  });

  it("setzt und entfernt Reaktionen", () => {
    mock([beitrag()]);
    renderWithProviders(<BeitraegeBereich slug="nord" darfSchreiben={false} />);
    const herz = screen.getByRole("button", { name: "reaktion_herz" });
    expect(herz).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(herz);
    expect(m.reagieren).toHaveBeenCalledWith(
      { slug: "nord", id: "b1", art: "herz", aktiv: false },
      expect.any(Object),
    );
    fireEvent.click(screen.getByRole("button", { name: "reaktion_feier" }));
    expect(m.reagieren).toHaveBeenLastCalledWith(
      { slug: "nord", id: "b1", art: "feier", aktiv: true },
      expect.any(Object),
    );
  });

  it("legt einen Beitrag an", () => {
    mock([]);
    renderWithProviders(<BeitraegeBereich slug="nord" darfSchreiben />);
    expect(screen.getByText("keine_beitraege")).toBeInTheDocument();
    const knopf = screen.getByText("beitrag_veroeffentlichen");
    expect(knopf).toBeDisabled();
    fireEvent.change(screen.getByPlaceholderText("beitrag_titel"), { target: { value: " Neu " } });
    fireEvent.change(screen.getByPlaceholderText("beitrag_text"), { target: { value: "Hallo" } });
    fireEvent.click(knopf);
    expect(m.anlegen).toHaveBeenCalledWith(
      { slug: "nord", titel: "Neu", text: "Hallo", bild: null },
      expect.any(Object),
    );
  });

  it("blendet nur mit Grund aus", () => {
    mock([beitrag({ darf_bearbeiten: true, darf_ausblenden: true })]);
    renderWithProviders(<BeitraegeBereich slug="nord" darfSchreiben />);
    fireEvent.click(screen.getByText("beitrag_ausblenden"));
    const senden = screen.getByText("beitrag_ausblenden_bestaetigen");
    expect(senden).toBeDisabled();
    fireEvent.change(screen.getByLabelText("beitrag_grund"), { target: { value: "Werbung" } });
    fireEvent.click(senden);
    expect(m.ausblenden).toHaveBeenCalledWith(
      { slug: "nord", id: "b1", ausgeblendet: true, grund: "Werbung" },
      expect.any(Object),
    );
  });

  it("markiert ausgeblendete Beiträge und bietet Einblenden an", () => {
    mock([beitrag({ ausgeblendet: true, ausgeblendet_grund: "Werbung", darf_ausblenden: true })]);
    renderWithProviders(<BeitraegeBereich slug="nord" darfSchreiben={false} />);
    expect(screen.getByText(/beitrag_ausgeblendet/)).toBeInTheDocument();
    fireEvent.click(screen.getByText("beitrag_einblenden"));
    expect(m.ausblenden).toHaveBeenCalledWith(
      { slug: "nord", id: "b1", ausgeblendet: false },
      expect.any(Object),
    );
  });

  it("Verantwortliche ohne Ausblenden-Recht sehen nur Bearbeiten und Löschen", () => {
    mock([beitrag({ darf_bearbeiten: true })]);
    renderWithProviders(<BeitraegeBereich slug="nord" darfSchreiben />);
    expect(screen.getByText("beitrag_bearbeiten")).toBeInTheDocument();
    expect(screen.queryByText("beitrag_ausblenden")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("beitrag_loeschen"));
    expect(m.loeschen).toHaveBeenCalledWith({ slug: "nord", id: "b1" }, expect.any(Object));
  });

  it("lädt ältere Beiträge nach", () => {
    mock([beitrag()], 25);
    renderWithProviders(<BeitraegeBereich slug="nord" darfSchreiben={false} />);
    expect(hooks.useBeitraege).toHaveBeenLastCalledWith("nord", 10);
    fireEvent.click(screen.getByText("mehr_beitraege"));
    expect(hooks.useBeitraege).toHaveBeenLastCalledWith("nord", 20);
  });
});
