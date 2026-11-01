import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as communaute from "../../hooks/useCommunaute";
import * as rbac from "../../hooks/useRbac";
import { renderWithProviders } from "../../test/renderWithProviders";
import type { Album } from "../../types/communaute";
import FotoalbenKarte from "./FotoalbenKarte";

vi.mock("../../hooks/useRbac", async () => {
  const actual = await vi.importActual<typeof rbac>("../../hooks/useRbac");
  return { ...actual, useModuleOuvert: vi.fn() };
});
vi.mock("../../hooks/useCommunaute", async () => {
  const actual = await vi.importActual<typeof communaute>("../../hooks/useCommunaute");
  return { ...actual, useAlbums: vi.fn() };
});

function album(id: string, nom: string, fotos: number): Album {
  return {
    id,
    nom,
    nombre_photos: fotos,
    photo_couverture: fotos > 0 ? `https://cdn.example/${id}.jpg` : null,
  } as unknown as Album;
}

describe("FotoalbenKarte", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(rbac.useModuleOuvert).mockReturnValue({ ouvert: true, chargement: false });
  });

  it("zeigt Alben mit Fotos und verlinkt sie", () => {
    vi.mocked(communaute.useAlbums).mockReturnValue({
      data: { results: [album("1", "Dortmund", 42), album("2", "Leer", 0)] },
    } as unknown as ReturnType<typeof communaute.useAlbums>);
    renderWithProviders(<FotoalbenKarte />);

    expect(screen.getByRole("link", { name: /Dortmund/ })).toHaveAttribute("href", "/albums/1");
    expect(screen.queryByText("Leer")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /startseite.alben.alle/ })).toHaveAttribute(
      "href",
      "/albums",
    );
  });

  it("zeigt nichts ohne Alben oder bei geschlossenem Modul", () => {
    vi.mocked(communaute.useAlbums).mockReturnValue({
      data: { results: [] },
    } as unknown as ReturnType<typeof communaute.useAlbums>);
    expect(renderWithProviders(<FotoalbenKarte />).container).toBeEmptyDOMElement();

    vi.mocked(rbac.useModuleOuvert).mockReturnValue({ ouvert: false, chargement: false });
    vi.mocked(communaute.useAlbums).mockClear();
    expect(renderWithProviders(<FotoalbenKarte />).container).toBeEmptyDOMElement();
    expect(communaute.useAlbums).not.toHaveBeenCalled();
  });
});
