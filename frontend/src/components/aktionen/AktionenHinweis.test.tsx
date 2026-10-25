import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "../../test/renderWithProviders";
import * as useCotisationsHooks from "../../hooks/useCotisations";
import type { ArticleCatalogue, Cotisation } from "../../types/cotisation";
import AktionenHinweis from "./AktionenHinweis";

vi.mock("../../hooks/useCotisations", async () => {
  const actual = await vi.importActual<typeof useCotisationsHooks>("../../hooks/useCotisations");
  return { ...actual, useArticlesCatalogue: vi.fn(), useMesCotisations: vi.fn() };
});

function art(o: Partial<ArticleCatalogue> = {}): ArticleCatalogue {
  return {
    id: "a1",
    libelle: "Spende Bus",
    montant: "10.00",
    actif: true,
    type_fixe: null,
    beschreibung: "",
    dringend: false,
    frist: null,
    zielbetrag: null,
    oeffentlich: false,
    erinnerungen: false,
    gesammelt: "0.00",
    beitragende: 0,
    fortschritt: null,
    abgelaufen: false,
    created_at: "2026-10-01T10:00:00Z",
    updated_at: "2026-10-01T10:00:00Z",
    ...o,
  };
}

function setze(artikel: ArticleCatalogue[], meine: Array<Partial<Cotisation>> = []) {
  vi.mocked(useCotisationsHooks.useArticlesCatalogue).mockReturnValue({
    data: { next: null, previous: null, results: artikel },
  } as unknown as ReturnType<typeof useCotisationsHooks.useArticlesCatalogue>);
  vi.mocked(useCotisationsHooks.useMesCotisations).mockReturnValue({
    data: { next: null, previous: null, results: meine },
  } as unknown as ReturnType<typeof useCotisationsHooks.useMesCotisations>);
}

describe("AktionenHinweis", () => {
  beforeEach(() => vi.clearAllMocks());

  it("zeigt nichts ohne dringende Aktion", () => {
    setze([art()]);
    renderWithProviders(<AktionenHinweis />);
    expect(screen.queryByTestId("aktionen-hinweis")).not.toBeInTheDocument();
  });

  it("verlinkt eine dringende Aktion auf den Bezahlvorgang", () => {
    setze([art({ dringend: true })]);
    renderWithProviders(<AktionenHinweis />);
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/mon-adhesion?aktion=a1");
    expect(link).toHaveTextContent("aktion.hinweis.dringend");
  });

  it("weist auf eine Aktion hin, die ihr Ziel fast erreicht hat", () => {
    setze([art({ zielbetrag: "100.00", gesammelt: "85.00", fortschritt: 85 })]);
    renderWithProviders(<AktionenHinweis />);
    expect(screen.getByRole("link")).toHaveTextContent("aktion.hinweis.ziel_fast");
  });

  it("blendet Aktionen aus, zu denen schon beigetragen wurde (bezahlt oder offen)", () => {
    setze(
      [art({ dringend: true }), art({ id: "a2", dringend: true, libelle: "Zweite" })],
      [
        { article_catalogue: "a1", statut: "payee" },
        { article_catalogue: "a2", statut: "en_attente" },
      ],
    );
    renderWithProviders(<AktionenHinweis />);
    expect(screen.queryByTestId("aktionen-hinweis")).not.toBeInTheDocument();
  });

  it("zeigt keine abgelaufenen oder deaktivierten Aktionen", () => {
    setze([
      art({ dringend: true, abgelaufen: true }),
      art({ id: "a3", dringend: true, actif: false }),
    ]);
    renderWithProviders(<AktionenHinweis />);
    expect(screen.queryByTestId("aktionen-hinweis")).not.toBeInTheDocument();
  });
});
