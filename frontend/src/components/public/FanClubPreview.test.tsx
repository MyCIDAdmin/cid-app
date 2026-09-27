import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "../../test/renderWithProviders";
import * as useCommunauteHooks from "../../hooks/useCommunaute";
import FanClubPreview from "./FanClubPreview";

vi.mock("../../hooks/useCommunaute", async () => {
  const actual = await vi.importActual<typeof useCommunauteHooks>("../../hooks/useCommunaute");
  return { ...actual, useClassementLigue: vi.fn(), useCalendrierRencontres: vi.fn() };
});

function queryResult<T>(data: T) {
  return { data, isLoading: false, isError: false } as unknown as T;
}

describe("FanClubPreview", () => {
  it("affiche le classement par défaut puis bascule vers le calendrier", () => {
    vi.mocked(useCommunauteHooks.useClassementLigue).mockReturnValue(
      queryResult({ data: { count: 0, next: null, previous: null, results: [] } }) as never,
    );
    vi.mocked(useCommunauteHooks.useCalendrierRencontres).mockReturnValue(
      queryResult({ data: { count: 0, next: null, previous: null, results: [] } }) as never,
    );

    renderWithProviders(<FanClubPreview />);
    expect(screen.getByText("fanclub.titre")).toBeInTheDocument();

    fireEvent.click(screen.getByText("fanclub.onglet_calendrier"));
    fireEvent.click(screen.getByText("fanclub.onglet_classement"));
    // Ne vérifie pas le contenu de ClassementTab/CalendrierTab eux-mêmes (déjà couverts par
    // leurs propres tests dédiés) — seulement que la bascule ne casse rien ici.
  });
});
