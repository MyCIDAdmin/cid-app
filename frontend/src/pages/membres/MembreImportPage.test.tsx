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
    telechargerTemplateImportHistorique: vi.fn(),
  };
});

vi.mock("../../hooks/useMembres", async () => {
  const actual = await vi.importActual<typeof useMembresHooks>("../../hooks/useMembres");
  return {
    ...actual,
    useImporterMembres: vi.fn(),
    useImporterHistoriqueStatuts: vi.fn(),
  };
});

/** Valeur par défaut (mutation inactive) — les deux hooks d'import partagent cette forme. */
function mutationInactive<T>() {
  return {
    mutate: vi.fn(),
    isPending: false,
    isError: false,
    data: undefined,
  } as unknown as T;
}

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
    // Les deux sections de la page appellent chacune leur hook de mutation au rendu — on leur
    // donne une valeur inactive par défaut, que chaque test peut écraser pour la section testée.
    vi.mocked(useMembresHooks.useImporterMembres).mockReturnValue(
      mutationInactive<ReturnType<typeof useMembresHooks.useImporterMembres>>(),
    );
    vi.mocked(useMembresHooks.useImporterHistoriqueStatuts).mockReturnValue(
      mutationInactive<ReturnType<typeof useMembresHooks.useImporterHistoriqueStatuts>>(),
    );
  });

  it("télécharge le template au clic", async () => {
    vi.mocked(membresApi.telechargerTemplateImportMembres).mockResolvedValue(
      new Blob(["contenu"]),
    );

    renderWithProviders(<MembreImportPage />);

    fireEvent.click(screen.getByText("import.template_bouton"));

    await waitFor(() =>
      expect(membresApi.telechargerTemplateImportMembres).toHaveBeenCalledTimes(1),
    );
  });

  it("affiche une erreur locale si on importe sans fichier sélectionné", () => {
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

  it("télécharge le template historique au clic", async () => {
    vi.mocked(membresApi.telechargerTemplateImportHistorique).mockResolvedValue(
      new Blob(["contenu"]),
    );

    renderWithProviders(<MembreImportPage />);

    fireEvent.click(screen.getByText("import_historique.template_bouton"));

    await waitFor(() =>
      expect(membresApi.telechargerTemplateImportHistorique).toHaveBeenCalledTimes(1),
    );
  });

  it("affiche une erreur locale si on importe l'historique sans fichier sélectionné", () => {
    renderWithProviders(<MembreImportPage />);

    fireEvent.click(screen.getByText("import_historique.importer"));

    expect(screen.getByText("import_historique.aucun_fichier")).toBeInTheDocument();
  });

  it("soumet le fichier historique sélectionné et affiche le résultat", async () => {
    const mutate = vi.fn((_fichier, opts?: { onSuccess?: () => void }) => opts?.onSuccess?.());
    vi.mocked(useMembresHooks.useImporterHistoriqueStatuts).mockReturnValue({
      mutate,
      isPending: false,
      isError: false,
      data: {
        total: 5,
        lignes_traitees: 4,
        entrees_importees: 3,
        lignes_ignorees: 1,
        erreurs: [{ ligne: 2, message: "Membre introuvable" }],
      },
    } as unknown as ReturnType<typeof useMembresHooks.useImporterHistoriqueStatuts>);

    renderWithProviders(<MembreImportPage />);

    const input = screen.getByLabelText(
      "import_historique.choisir_fichier",
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { files: [fichierXlsx("historique.xlsx")] } });

    fireEvent.click(screen.getByText("import_historique.importer"));

    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate.mock.calls[0][0]).toBeInstanceOf(File);

    expect(screen.getByText("5")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("Membre introuvable")).toBeInTheDocument();
  });
});
