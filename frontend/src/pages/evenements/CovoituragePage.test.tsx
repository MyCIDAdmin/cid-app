import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "../../test/renderWithProviders";
import * as useEvenementsHooks from "../../hooks/useEvenements";
import { useAuthStore } from "../../store/authStore";
import type { Covoiturage } from "../../types/evenements";
import CovoituragePage from "./CovoituragePage";

vi.mock("../../hooks/useEvenements", async () => {
  const actual = await vi.importActual<typeof useEvenementsHooks>("../../hooks/useEvenements");
  return {
    ...actual,
    useCovoiturages: vi.fn(),
    useEvenements: vi.fn(),
    useCreerCovoiturage: vi.fn(),
    useRejoindreTrajet: vi.fn(),
  };
});

const membre = {
  id: "u1",
  email: "membre@example.com",
  role: "membre" as const,
  langue_preferee: "fr" as const,
};

function page<T>(results: T[]) {
  return { count: results.length, next: null, previous: null, results };
}

function mutationMock<T>(): T {
  return { mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false } as unknown as T;
}

function trajet(overrides: Partial<Covoiturage> = {}): Covoiturage {
  return {
    id: "t1",
    conducteur: "m1",
    conducteur_detail: { id: "m1", prenom: "Riadh", nom: "Bchini" },
    evenement: null,
    depart: "Berlin Hbf",
    destination: "Stuttgart",
    date_trajet: "2099-05-31",
    heure_trajet: "06:00",
    places_disponibles: 3,
    prix_par_place: "25.00",
    vehicule: "VW Passat",
    places_reservees: 1,
    places_restantes: 2,
    created_at: "2026-01-01T10:00:00Z",
    ...overrides,
  };
}

describe("CovoituragePage", () => {
  beforeEach(() => {
    useAuthStore.setState({
      accessToken: "t",
      refreshToken: "r",
      user: membre,
      isAuthenticated: true,
    });
    vi.mocked(useEvenementsHooks.useCreerCovoiturage).mockReturnValue(
      mutationMock<ReturnType<typeof useEvenementsHooks.useCreerCovoiturage>>(),
    );
    vi.mocked(useEvenementsHooks.useRejoindreTrajet).mockReturnValue(
      mutationMock<ReturnType<typeof useEvenementsHooks.useRejoindreTrajet>>(),
    );
    vi.mocked(useEvenementsHooks.useEvenements).mockReturnValue({
      data: page([]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useEvenementsHooks.useEvenements>);
  });

  it("affiche la liste des trajets avec le conducteur", () => {
    vi.mocked(useEvenementsHooks.useCovoiturages).mockReturnValue({
      data: page([trajet()]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useEvenementsHooks.useCovoiturages>);

    renderWithProviders(<CovoituragePage />);

    expect(screen.getByText("Riadh Bchini")).toBeInTheDocument();
  });

  it("affiche un message si aucun trajet", () => {
    vi.mocked(useEvenementsHooks.useCovoiturages).mockReturnValue({
      data: page([]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useEvenementsHooks.useCovoiturages>);

    renderWithProviders(<CovoituragePage />);

    expect(screen.getByText("covoiturage.aucun_trajet")).toBeInTheDocument();
  });

  it("propose un nouveau trajet", () => {
    const creer = mutationMock<ReturnType<typeof useEvenementsHooks.useCreerCovoiturage>>();
    vi.mocked(useEvenementsHooks.useCreerCovoiturage).mockReturnValue(creer);
    vi.mocked(useEvenementsHooks.useCovoiturages).mockReturnValue({
      data: page([]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useEvenementsHooks.useCovoiturages>);

    renderWithProviders(<CovoituragePage />);

    fireEvent.click(screen.getByText("covoiturage.proposer_trajet"));
    fireEvent.change(screen.getByPlaceholderText("covoiturage.depart_placeholder"), {
      target: { value: "Hambourg" },
    });
    fireEvent.change(screen.getByPlaceholderText("covoiturage.destination_placeholder"), {
      target: { value: "Stuttgart" },
    });
    fireEvent.change(screen.getByLabelText("covoiturage.champ_date_label"), {
      target: { value: "2099-06-14" },
    });
    fireEvent.change(screen.getByLabelText("covoiturage.champ_heure_label"), {
      target: { value: "06:00" },
    });

    fireEvent.click(screen.getByText("covoiturage.publier_trajet"));

    expect(creer.mutate).toHaveBeenCalled();
  });

  it("rejoint un trajet existant (places + point de prise en charge)", () => {
    const rejoindre = mutationMock<ReturnType<typeof useEvenementsHooks.useRejoindreTrajet>>();
    vi.mocked(useEvenementsHooks.useRejoindreTrajet).mockReturnValue(rejoindre);
    vi.mocked(useEvenementsHooks.useCovoiturages).mockReturnValue({
      data: page([trajet()]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useEvenementsHooks.useCovoiturages>);

    renderWithProviders(<CovoituragePage />);

    fireEvent.click(screen.getByText("covoiturage.rejoindre"));
    fireEvent.click(screen.getByText("covoiturage.modal_confirmer"));

    expect(rejoindre.mutate).toHaveBeenCalledWith(
      { id: "t1", payload: { places_reservees: 1, point_prise_en_charge: "" } },
      expect.anything(),
    );
  });
});
