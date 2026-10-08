import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as useMembresHooks from "../../hooks/useMembres";
import { renderWithProviders } from "../../test/renderWithProviders";
import MembreImportPage from "./MembreImportPage";

vi.mock("../../hooks/useMembres", async () => {
  const actual = await vi.importActual<typeof useMembresHooks>("../../hooks/useMembres");
  return {
    ...actual,
    usePruefenImport: vi.fn(),
    useBestaetigenImport: vi.fn(),
  };
});

describe("MembreImportPage", () => {
  beforeEach(() => {
    const inaktiv = {
      mutate: vi.fn(),
      reset: vi.fn(),
      isPending: false,
      isError: false,
      data: undefined,
    };
    vi.mocked(useMembresHooks.usePruefenImport).mockReturnValue(
      inaktiv as unknown as ReturnType<typeof useMembresHooks.usePruefenImport>,
    );
    vi.mocked(useMembresHooks.useBestaetigenImport).mockReturnValue(
      inaktiv as unknown as ReturnType<typeof useMembresHooks.useBestaetigenImport>,
    );
  });

  it("zeigt beide Importe mit eigenem Assistenten", () => {
    renderWithProviders(<MembreImportPage />);

    expect(screen.getByText("import.titre")).toBeInTheDocument();
    expect(screen.getByText("import_historique.titre")).toBeInTheDocument();
    expect(screen.getByLabelText("import.choisir_fichier")).toBeInTheDocument();
    expect(screen.getByLabelText("import_historique.choisir_fichier")).toBeInTheDocument();
    expect(screen.getAllByText("import_pruefung.pruefen")).toHaveLength(2);
  });

  it("verwendet je Import die passende Art (membres / historique)", () => {
    renderWithProviders(<MembreImportPage />);

    expect(useMembresHooks.usePruefenImport).toHaveBeenCalledWith("membres");
    expect(useMembresHooks.usePruefenImport).toHaveBeenCalledWith("historique");
  });
});
