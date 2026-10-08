import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as membresApi from "../../api/membres";
import * as useMembresHooks from "../../hooks/useMembres";
import { renderWithProviders } from "../../test/renderWithProviders";
import type { ImportErgebnis, ImportPruefung } from "../../types/membre";
import ImportAssistent from "./ImportAssistent";

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
    usePruefenImport: vi.fn(),
    useBestaetigenImport: vi.fn(),
  };
});

type PruefenHook = ReturnType<typeof useMembresHooks.usePruefenImport>;
type BestaetigenHook = ReturnType<typeof useMembresHooks.useBestaetigenImport>;

function mutation(overrides: Record<string, unknown> = {}) {
  return {
    mutate: vi.fn(),
    reset: vi.fn(),
    isPending: false,
    isError: false,
    data: undefined,
    ...overrides,
  };
}

const PRUEFUNG: ImportPruefung = {
  total: 4,
  zaehler: { neu: 1, dublette: 2, unveraendert: 0, fehler: 1 },
  zeilen: [
    {
      ligne: 2,
      status: "neu",
      grund: "Neues Mitglied",
      ueberschreibbar: false,
      anzeige: { prenom: "Neu", nom: "Person", email: "neu@example.de" },
      existant: null,
      aenderungen: [],
    },
    {
      ligne: 3,
      status: "dublette",
      grund: "Dublette von CA-2020-001",
      ueberschreibbar: true,
      anzeige: { prenom: "Dora", nom: "Dublette", email: "dora@example.de" },
      existant: {
        id: "1",
        numero_membre: "CA-2020-001",
        prenom: "Dora",
        nom: "Dublette",
        email: "dora@example.de",
        a_un_compte: false,
      },
      aenderungen: [
        { champ: "telephone", label: "Telefon", alt: "+49 1", neu: "+49 2", art: "abweichend" },
      ],
    },
    {
      ligne: 4,
      status: "dublette",
      grund: "Dublette von CA-2020-002",
      ueberschreibbar: true,
      anzeige: { prenom: "Dan", nom: "Zwei", email: "dan@example.de" },
      existant: null,
      aenderungen: [
        { champ: "ville_de", label: "Stadt", alt: "Bonn", neu: "Köln", art: "abweichend" },
      ],
    },
    {
      ligne: 5,
      status: "fehler",
      grund: "Pflichtfeld fehlt: nom",
      ueberschreibbar: false,
      anzeige: {},
      existant: null,
      aenderungen: [],
    },
  ],
};

const ERGEBNIS: ImportErgebnis = {
  total: 4,
  zaehler: {
    importiert: 1,
    ueberschrieben: 1,
    teilweise: 0,
    uebersprungen: 1,
    unveraendert: 0,
    fehler: 1,
  },
  zeilen: [
    { ligne: 2, ergebnis: "importiert", status: "Importiert", grund: "Neues Mitglied angelegt" },
    { ligne: 5, ergebnis: "fehler", status: "Fehler", grund: "Pflichtfeld fehlt: nom" },
  ],
  bericht: { dateiname: "liste_bericht.xlsx", inhalt_base64: btoa("xlsx-bytes") },
};

function fichierXlsx(nom = "membres.xlsx") {
  return new File(["contenu"], nom, {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

describe("ImportAssistent", () => {
  beforeEach(() => {
    window.URL.createObjectURL = vi.fn(() => "blob:mock-url");
    window.URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    vi.mocked(useMembresHooks.usePruefenImport).mockReturnValue(
      mutation() as unknown as PruefenHook,
    );
    vi.mocked(useMembresHooks.useBestaetigenImport).mockReturnValue(
      mutation() as unknown as BestaetigenHook,
    );
  });

  it("télécharge le bon template selon l'import", async () => {
    vi.mocked(membresApi.telechargerTemplateImportHistorique).mockResolvedValue(
      new Blob(["contenu"]),
    );

    renderWithProviders(<ImportAssistent art="historique" />);
    fireEvent.click(screen.getByText("import_historique.template_bouton"));

    await waitFor(() =>
      expect(membresApi.telechargerTemplateImportHistorique).toHaveBeenCalledTimes(1),
    );
    expect(membresApi.telechargerTemplateImportMembres).not.toHaveBeenCalled();
  });

  it("affiche une erreur locale si on vérifie sans fichier", () => {
    renderWithProviders(<ImportAssistent art="membres" />);

    fireEvent.click(screen.getByText("import_pruefung.pruefen"));

    expect(screen.getByText("import.aucun_fichier")).toBeInTheDocument();
  });

  it("envoie le fichier choisi à la vérification (sans rien importer)", () => {
    const pruefen = mutation();
    const bestaetigen = mutation();
    vi.mocked(useMembresHooks.usePruefenImport).mockReturnValue(pruefen as unknown as PruefenHook);
    vi.mocked(useMembresHooks.useBestaetigenImport).mockReturnValue(
      bestaetigen as unknown as BestaetigenHook,
    );

    renderWithProviders(<ImportAssistent art="membres" />);
    fireEvent.change(screen.getByLabelText("import.choisir_fichier"), {
      target: { files: [fichierXlsx()] },
    });
    fireEvent.click(screen.getByText("import_pruefung.pruefen"));

    expect(pruefen.mutate).toHaveBeenCalledTimes(1);
    expect(pruefen.mutate.mock.calls[0][0]).toBeInstanceOf(File);
    expect(bestaetigen.mutate).not.toHaveBeenCalled();
  });

  describe("liste de contrôle", () => {
    function rendreAvecPruefung() {
      const pruefen = mutation({ data: PRUEFUNG });
      const bestaetigen = mutation();
      vi.mocked(useMembresHooks.usePruefenImport).mockReturnValue(
        pruefen as unknown as PruefenHook,
      );
      vi.mocked(useMembresHooks.useBestaetigenImport).mockReturnValue(
        bestaetigen as unknown as BestaetigenHook,
      );
      renderWithProviders(<ImportAssistent art="membres" />);
      // Le fichier doit être mémorisé pour pouvoir être renvoyé à la confirmation.
      fireEvent.change(screen.getByLabelText("import.choisir_fichier"), {
        target: { files: [fichierXlsx()] },
      });
      return { pruefen, bestaetigen };
    }

    it("affiche les lignes, les motifs et les différences ; case à cocher seulement pour les doublons", () => {
      rendreAvecPruefung();

      expect(screen.getByText("Neues Mitglied")).toBeInTheDocument();
      expect(screen.getByText("Pflichtfeld fehlt: nom")).toBeInTheDocument();
      expect(screen.getByText("Telefon:")).toBeInTheDocument();
      expect(screen.getByText("+49 2")).toBeInTheDocument();
      expect(screen.getAllByRole("checkbox")).toHaveLength(2);
    });

    it("confirme avec uniquement les lignes cochées", () => {
      const { bestaetigen } = rendreAvecPruefung();

      fireEvent.click(screen.getByLabelText("import_pruefung.ueberschreiben_zeile 4"));
      fireEvent.click(screen.getByText("import_pruefung.bestaetigen"));

      expect(bestaetigen.mutate).toHaveBeenCalledTimes(1);
      const arg = bestaetigen.mutate.mock.calls[0][0];
      expect(arg.fichier).toBeInstanceOf(File);
      expect(arg.ueberschreiben).toEqual([4]);
    });

    it("sans sélection, rien n'est écrasé", () => {
      const { bestaetigen } = rendreAvecPruefung();

      fireEvent.click(screen.getByText("import_pruefung.bestaetigen"));

      expect(bestaetigen.mutate.mock.calls[0][0].ueberschreiben).toEqual([]);
    });

    it("« tout sélectionner » puis « désélectionner »", () => {
      const { bestaetigen } = rendreAvecPruefung();

      fireEvent.click(screen.getByText("import_pruefung.alle_waehlen"));
      expect(screen.getByLabelText("import_pruefung.ueberschreiben_zeile 3")).toBeChecked();
      expect(screen.getByLabelText("import_pruefung.ueberschreiben_zeile 4")).toBeChecked();

      fireEvent.click(screen.getByText("import_pruefung.auswahl_aufheben"));
      expect(screen.getByLabelText("import_pruefung.ueberschreiben_zeile 3")).not.toBeChecked();

      fireEvent.click(screen.getByText("import_pruefung.alle_waehlen"));
      fireEvent.click(screen.getByText("import_pruefung.bestaetigen"));
      expect(bestaetigen.mutate.mock.calls[0][0].ueberschreiben).toEqual([3, 4]);
    });

    it("filtre la liste par statut", () => {
      rendreAvecPruefung();

      fireEvent.click(screen.getByRole("button", { name: /import_pruefung\.status\.fehler/ }));

      expect(screen.getByText("Pflichtfeld fehlt: nom")).toBeInTheDocument();
      expect(screen.queryByText("Neues Mitglied")).not.toBeInTheDocument();
    });

    it("annuler remet l'assistant à zéro", () => {
      const { pruefen, bestaetigen } = rendreAvecPruefung();

      fireEvent.click(screen.getByText("import_pruefung.abbrechen"));

      expect(pruefen.reset).toHaveBeenCalled();
      expect(bestaetigen.reset).toHaveBeenCalled();
      expect(bestaetigen.mutate).not.toHaveBeenCalled();
    });
  });

  describe("résultat", () => {
    function rendreAvecErgebnis() {
      vi.mocked(useMembresHooks.usePruefenImport).mockReturnValue(
        mutation({ data: PRUEFUNG }) as unknown as PruefenHook,
      );
      vi.mocked(useMembresHooks.useBestaetigenImport).mockReturnValue(
        mutation({ data: ERGEBNIS }) as unknown as BestaetigenHook,
      );
      renderWithProviders(<ImportAssistent art="membres" />);
    }

    it("affiche les compteurs et les lignes importées / en erreur", () => {
      rendreAvecErgebnis();

      expect(screen.getByText("import_pruefung.ergebnis_titre")).toBeInTheDocument();
      expect(screen.getByText("Neues Mitglied angelegt")).toBeInTheDocument();
      const zeile = screen.getByText("Pflichtfeld fehlt: nom").closest("tr") as HTMLElement;
      expect(within(zeile).getByText("import_pruefung.ergebnis.fehler")).toBeInTheDocument();
    });

    it("télécharge le rapport Excel avec le nom fourni par le serveur", () => {
      const lien = vi.spyOn(document, "createElement");
      rendreAvecErgebnis();

      fireEvent.click(screen.getByText("import_pruefung.bericht_herunterladen"));

      expect(window.URL.createObjectURL).toHaveBeenCalledTimes(1);
      const blob = vi.mocked(window.URL.createObjectURL).mock.calls[0][0] as Blob;
      expect(blob.size).toBe("xlsx-bytes".length);
      const anker = lien.mock.results
        .map((r) => r.value)
        .find((el) => el instanceof HTMLAnchorElement) as HTMLAnchorElement;
      expect(anker.download).toBe("liste_bericht.xlsx");
    });
  });
});
