import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as usePartnerHooks from "../../hooks/usePartner";
import { renderWithProviders } from "../../test/renderWithProviders";
import type { PartnerEinnahme } from "../../types/partner";
import EinnahmenPanel from "./EinnahmenPanel";

vi.mock("../../hooks/usePartner", async () => {
  const actual = await vi.importActual<typeof usePartnerHooks>("../../hooks/usePartner");
  return {
    ...actual,
    useEinnahmen: vi.fn(),
    useCreerEinnahme: vi.fn(),
    useLoescheEinnahme: vi.fn(),
  };
});

const einnahme: PartnerEinnahme = {
  id: "e1",
  partner: "p1",
  datum: "2026-05-01",
  betrag: "500.00",
  art: "sponsoring",
  bezeichnung: "Jahressponsoring",
  projet: null,
  projet_titre: "",
  evenement: null,
  evenement_titre: "",
  created_at: "2026-05-01T10:00:00Z",
};

function mutation() {
  return { mutate: vi.fn(), isPending: false, isError: false, error: null };
}

describe("EinnahmenPanel", () => {
  const anlegen = mutation();
  const loeschen = mutation();

  beforeEach(() => {
    anlegen.mutate.mockClear();
    loeschen.mutate.mockClear();
    vi.mocked(usePartnerHooks.useCreerEinnahme).mockReturnValue(
      anlegen as unknown as ReturnType<typeof usePartnerHooks.useCreerEinnahme>,
    );
    vi.mocked(usePartnerHooks.useLoescheEinnahme).mockReturnValue(
      loeschen as unknown as ReturnType<typeof usePartnerHooks.useLoescheEinnahme>,
    );
    vi.mocked(usePartnerHooks.useEinnahmen).mockReturnValue({
      data: [einnahme],
      isLoading: false,
    } as unknown as ReturnType<typeof usePartnerHooks.useEinnahmen>);
  });

  it("listet Einnahmen mit Betrag und Art", () => {
    renderWithProviders(<EinnahmenPanel partnerId="p1" schreibbar={false} />);
    expect(screen.getByText("Jahressponsoring")).toBeInTheDocument();
    expect(screen.getByText(/500,00/)).toBeInTheDocument();
    expect(screen.getByText("einnahme_art_sponsoring")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "einnahme_hinzufuegen" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "entfernen" })).not.toBeInTheDocument();
  });

  it("erfasst eine Einnahme (Komma wird zum Punkt)", () => {
    renderWithProviders(<EinnahmenPanel partnerId="p1" schreibbar />);
    fireEvent.change(screen.getByLabelText("einnahme_betrag"), { target: { value: "250,50" } });
    fireEvent.change(screen.getByLabelText("einnahme_art"), { target: { value: "spende" } });
    fireEvent.change(screen.getByLabelText("einnahme_bezeichnung"), {
      target: { value: "Spende" },
    });
    fireEvent.click(screen.getByRole("button", { name: "einnahme_hinzufuegen" }));
    expect(anlegen.mutate).toHaveBeenCalledTimes(1);
    expect(anlegen.mutate.mock.calls[0][0]).toMatchObject({
      partner: "p1",
      betrag: "250.50",
      art: "spende",
      bezeichnung: "Spende",
    });
  });

  it("löscht eine Einnahme", () => {
    renderWithProviders(<EinnahmenPanel partnerId="p1" schreibbar />);
    fireEvent.click(screen.getByRole("button", { name: "entfernen" }));
    expect(loeschen.mutate).toHaveBeenCalledWith("e1");
  });

  it("zeigt einen Hinweis ohne Einnahmen", () => {
    vi.mocked(usePartnerHooks.useEinnahmen).mockReturnValue({
      data: [],
      isLoading: false,
    } as unknown as ReturnType<typeof usePartnerHooks.useEinnahmen>);
    renderWithProviders(<EinnahmenPanel partnerId="p1" schreibbar={false} />);
    expect(screen.getByText("keine_einnahmen")).toBeInTheDocument();
  });
});
