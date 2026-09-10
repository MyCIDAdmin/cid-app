import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "../../test/renderWithProviders";
import * as membresApi from "../../api/membres";
import * as useMembresHooks from "../../hooks/useMembres";
import MembreImportPage from "./MembreImportPage";

vi.mock("../../api/membres", async () => {
  const actual = await vi.importActual<typeof membresApi>("../../api/membres");
  return {
    ...actual,
    telechargerTemplateImportMembres: vi.fn(),
  };
});

vi.mock("../../hooks/useMembres", async () => {
  const actual = await vi.importActual<typeof useMembresHooks>("../../hooks/useMembres");
  return {
    ...actual,
    useImporterMembres: vi.fn(),
  };
});

function fichierXlsx(nom = "membres.xlsx") {
  return new File(["contenu"], nom, {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

describe("MembreImportPage", () => {
  beforeEach(() => {
    window.URL.createObjectURL = vi.fn(() => "blob:mock-url");
    window.URL.revokeObjectURL = vi.fn();
    // jsdom tente une vraie navigation sur le clic d'un <a href="blob:...">
    // (non pertinent ici, on ne teste que le déclenchement du téléchargement).
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  });

  it("télécharge le template au clic", async () => {
    vi.mocked(membresApi.telechargerTemplateImportMembres).mockResolvedValue(
      new Blob(["contenu"]),
    );
    vi.mocked(useMembresHooks.useImporterMembres).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
      isError: false,
      data: undefined,
    } as unknown as ReturnType<typeof useMembresHooks.useImporterMembres>);

    renderWithProviders(<MembreImportPage />);

    fireEvent.click(screen.getByText("import.template_bouton"));

    await waitFor(() =>
      expect(membresApi.telechargerTemplateImportMembres).toHaveBeenCalledTimes(1),
    );
  });

  it("affiche une erreur locale si on importe sans fichier sélectionné", () => {
    vi.mocked(useMembresHooks.useImporterMembres).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
      isError: false,
      data: undefined,
    } as unknown as ReturnType<typeof useMembresHooks.useImporterMembres>);

    renderWithProviders(<MembreImportPage />);

    fireEvent.click(screen.getByText("import.importer"));

    expect(screen.getByText("import.aucun_fichier")).toBeInTheDocument();
  });

  it("soumet le fichier sélectionné et affiche le résultat", async () => {
    const mutate = vi.fn((_fichier, opts?: { onSuccess?: () => void }) => opts?.onSuccess?.());
    vi.mocked(useMembresHooks.useImporterMembres).mockReturnValue({
      mutate,
      isPending: false,
      isError: false,
      data: { total: 3, importes: 2, ignores: 1, erreurs: [{ ligne: 4, message: "CIN invalide" }] },
    } as unknown as ReturnType<typeof useMembresHooks.useImporterMembres>);

    renderWithProviders(<MembreImportPage />);

    const input = screen.getByLabelText("import.choisir_fichier") as HTMLInputElement;
    fireEvent.change(input, { target: { files: [fichierXlsx()] } });

    fireEvent.click(screen.getByText("import.importer"));

    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate.mock.calls[0][0]).toBeInstanceOf(File);

    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("CIN invalide")).toBeInTheDocument();
  });
});
