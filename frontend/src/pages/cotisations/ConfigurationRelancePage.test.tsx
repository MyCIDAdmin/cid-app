import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "../../test/renderWithProviders";
import * as useCotisationsHooks from "../../hooks/useCotisations";
import * as useMembresHooks from "../../hooks/useMembres";
import type { ConfigurationRelance } from "../../types/cotisation";
import ConfigurationRelancePage from "./ConfigurationRelancePage";

vi.mock("../../hooks/useCotisations", async () => {
  const actual = await vi.importActual<typeof useCotisationsHooks>("../../hooks/useCotisations");
  return {
    ...actual,
    useConfigurationsRelance: vi.fn(),
    useCreerConfigurationRelance: vi.fn(),
    useModifierConfigurationRelance: vi.fn(),
    useSupprimerConfigurationRelance: vi.fn(),
  };
});

vi.mock("../../hooks/useMembres", async () => {
  const actual = await vi.importActual<typeof useMembresHooks>("../../hooks/useMembres");
  return {
    ...actual,
    useMembre: vi.fn(),
  };
});

function configurationRelance(overrides: Partial<ConfigurationRelance> = {}): ConfigurationRelance {
  return {
    id: "conf-2027",
    annee: 2027,
    date_echeance: "2027-01-01",
    modifie_par: "m-dg",
    created_at: "2026-09-01T10:00:00Z",
    updated_at: "2026-09-01T10:00:00Z",
    ...overrides,
  };
}

describe("ConfigurationRelancePage", () => {
  beforeEach(() => {
    vi.mocked(useMembresHooks.useMembre).mockReturnValue({
      data: { id: "m-dg", prenom: "Sami", nom: "Trabelsi" },
      isLoading: false,
    } as unknown as ReturnType<typeof useMembresHooks.useMembre>);
    vi.mocked(useCotisationsHooks.useCreerConfigurationRelance).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
      isError: false,
    } as unknown as ReturnType<typeof useCotisationsHooks.useCreerConfigurationRelance>);
    vi.mocked(useCotisationsHooks.useModifierConfigurationRelance).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
      isError: false,
    } as unknown as ReturnType<typeof useCotisationsHooks.useModifierConfigurationRelance>);
    vi.mocked(useCotisationsHooks.useSupprimerConfigurationRelance).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
      isError: false,
    } as unknown as ReturnType<typeof useCotisationsHooks.useSupprimerConfigurationRelance>);
  });

  it("affiche un message quand aucune échéance n'est configurée", () => {
    vi.mocked(useCotisationsHooks.useConfigurationsRelance).mockReturnValue({
      data: { next: null, previous: null, results: [] },
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCotisationsHooks.useConfigurationsRelance>);

    renderWithProviders(<ConfigurationRelancePage />);

    expect(screen.getByText("configuration_relance.aucune")).toBeInTheDocument();
  });

  it("affiche l'année, la date d'échéance et l'auteur de la dernière modification", () => {
    vi.mocked(useCotisationsHooks.useConfigurationsRelance).mockReturnValue({
      data: { next: null, previous: null, results: [configurationRelance()] },
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCotisationsHooks.useConfigurationsRelance>);

    renderWithProviders(<ConfigurationRelancePage />);

    expect(screen.getByText("2027")).toBeInTheDocument();
    expect(screen.getByTestId("configuration-relance-date-2027")).toHaveValue("2027-01-01");
    expect(screen.getByText("Sami Trabelsi")).toBeInTheDocument();
  });

  it("crée une nouvelle échéance via le formulaire d'ajout", () => {
    const mutate = vi.fn();
    vi.mocked(useCotisationsHooks.useCreerConfigurationRelance).mockReturnValue({
      mutate,
      isPending: false,
      isError: false,
    } as unknown as ReturnType<typeof useCotisationsHooks.useCreerConfigurationRelance>);
    vi.mocked(useCotisationsHooks.useConfigurationsRelance).mockReturnValue({
      data: { next: null, previous: null, results: [] },
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCotisationsHooks.useConfigurationsRelance>);

    renderWithProviders(<ConfigurationRelancePage />);

    fireEvent.change(screen.getByLabelText("configuration_relance.champ_annee"), {
      target: { value: "2028" },
    });
    fireEvent.change(screen.getByLabelText("configuration_relance.champ_date_echeance"), {
      target: { value: "2028-02-15" },
    });
    fireEvent.click(screen.getByText("configuration_relance.ajouter"));

    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate.mock.calls[0][0]).toEqual({ annee: 2028, date_echeance: "2028-02-15" });
  });

  it("modifie la date d'échéance d'une année existante", () => {
    const mutate = vi.fn();
    vi.mocked(useCotisationsHooks.useModifierConfigurationRelance).mockReturnValue({
      mutate,
      isPending: false,
      isError: false,
    } as unknown as ReturnType<typeof useCotisationsHooks.useModifierConfigurationRelance>);
    vi.mocked(useCotisationsHooks.useConfigurationsRelance).mockReturnValue({
      data: { next: null, previous: null, results: [configurationRelance()] },
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCotisationsHooks.useConfigurationsRelance>);

    renderWithProviders(<ConfigurationRelancePage />);

    fireEvent.change(screen.getByTestId("configuration-relance-date-2027"), {
      target: { value: "2027-03-15" },
    });
    fireEvent.click(screen.getByText("configuration_relance.enregistrer"));

    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate.mock.calls[0][0]).toEqual({
      id: "conf-2027",
      payload: { date_echeance: "2027-03-15" },
    });
  });

  it("le bouton enregistrer reste désactivé tant que la date n'a pas changé", () => {
    vi.mocked(useCotisationsHooks.useConfigurationsRelance).mockReturnValue({
      data: { next: null, previous: null, results: [configurationRelance()] },
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCotisationsHooks.useConfigurationsRelance>);

    renderWithProviders(<ConfigurationRelancePage />);

    expect(screen.getByText("configuration_relance.enregistrer")).toBeDisabled();
  });

  it("supprime une échéance après confirmation", () => {
    const mutate = vi.fn();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.mocked(useCotisationsHooks.useSupprimerConfigurationRelance).mockReturnValue({
      mutate,
      isPending: false,
      isError: false,
    } as unknown as ReturnType<typeof useCotisationsHooks.useSupprimerConfigurationRelance>);
    vi.mocked(useCotisationsHooks.useConfigurationsRelance).mockReturnValue({
      data: { next: null, previous: null, results: [configurationRelance()] },
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCotisationsHooks.useConfigurationsRelance>);

    renderWithProviders(<ConfigurationRelancePage />);
    fireEvent.click(screen.getByText("configuration_relance.supprimer"));

    expect(mutate).toHaveBeenCalledWith("conf-2027");
  });

  it("ne supprime pas si la confirmation est refusée", () => {
    const mutate = vi.fn();
    vi.spyOn(window, "confirm").mockReturnValue(false);
    vi.mocked(useCotisationsHooks.useSupprimerConfigurationRelance).mockReturnValue({
      mutate,
      isPending: false,
      isError: false,
    } as unknown as ReturnType<typeof useCotisationsHooks.useSupprimerConfigurationRelance>);
    vi.mocked(useCotisationsHooks.useConfigurationsRelance).mockReturnValue({
      data: { next: null, previous: null, results: [configurationRelance()] },
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useCotisationsHooks.useConfigurationsRelance>);

    renderWithProviders(<ConfigurationRelancePage />);
    fireEvent.click(screen.getByText("configuration_relance.supprimer"));

    expect(mutate).not.toHaveBeenCalled();
  });
});
