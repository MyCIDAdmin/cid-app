import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "../../test/renderWithProviders";
import * as useEvenementsHooks from "../../hooks/useEvenements";
import { useAuthStore } from "../../store/authStore";
import type { Covoiturage, ReservationCovoiturage } from "../../types/evenements";
import CovoituragePage from "./CovoituragePage";

vi.mock("../../hooks/useEvenements", async () => {
  const actual = await vi.importActual<typeof useEvenementsHooks>("../../hooks/useEvenements");
  return {
    ...actual,
    useCovoiturages: vi.fn(),
    useEvenements: vi.fn(),
    useCreerCovoiturage: vi.fn(),
    useRejoindreTrajet: vi.fn(),
    useReservationsCovoiturage: vi.fn(),
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
    lieu_rendez_vous: "",
    places_disponibles: 3,
    prix_par_place: "25.00",
    vehicule: "VW Passat",
    remarques: "",
    places_reservees: 1,
    places_restantes: 2,
    created_at: "2026-01-01T10:00:00Z",
    ...overrides,
  };
}

function reservation(overrides: Partial<ReservationCovoiturage> = {}): ReservationCovoiturage {
  return {
    id: "r1",
    trajet: "t1",
    membre: "m2",
    membre_detail: { id: "m2", prenom: "Amina", nom: "Ben Salah" },
    places_reservees: 1,
    point_prise_en_charge: "",
    statut: "confirmee",
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
    // Tuile Fahrgemeinschaft (2026-09-25) : "qui a réservé", voir ParticipantsCovoiturage
    // dans CovoituragePage.tsx. Par défaut aucune réservation, sauf surcharge par test.
    vi.mocked(useEvenementsHooks.useReservationsCovoiturage).mockReturnValue({
      data: page([]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useEvenementsHooks.useReservationsCovoiturage>);
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

  // --- Tuile Fahrgemeinschaft (2026-09-25) : Treffpunkt + qui a réservé ---

  it("affiche le lieu de rendez-vous fixé par le conducteur", () => {
    vi.mocked(useEvenementsHooks.useCovoiturages).mockReturnValue({
      data: page([trajet({ lieu_rendez_vous: "Devant la gare, sortie Nord" })]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useEvenementsHooks.useCovoiturages>);

    renderWithProviders(<CovoituragePage />);

    expect(screen.getByText("Devant la gare, sortie Nord")).toBeInTheDocument();
  });

  it("propose un trajet avec un lieu de rendez-vous", () => {
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
    fireEvent.change(screen.getByPlaceholderText("covoiturage.treffpunkt_placeholder"), {
      target: { value: "Parking Décathlon" },
    });

    fireEvent.click(screen.getByText("covoiturage.publier_trajet"));

    expect(creer.mutate).toHaveBeenCalledWith(
      expect.objectContaining({ lieu_rendez_vous: "Parking Décathlon" }),
      expect.anything(),
    );
  });

  it("affiche la remarque libre laissée par le conducteur (demande utilisateur 2026-09-25)", () => {
    vi.mocked(useEvenementsHooks.useCovoiturages).mockReturnValue({
      data: page([trajet({ remarques: "Non-fumeur, arrêt possible à Leipzig." })]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useEvenementsHooks.useCovoiturages>);

    renderWithProviders(<CovoituragePage />);

    expect(screen.getByText("Non-fumeur, arrêt possible à Leipzig.")).toBeInTheDocument();
  });

  it("propose un trajet avec une remarque libre", () => {
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
    fireEvent.change(screen.getByPlaceholderText("covoiturage.remarques_placeholder"), {
      target: { value: "1 valise max par personne." },
    });

    fireEvent.click(screen.getByText("covoiturage.publier_trajet"));

    expect(creer.mutate).toHaveBeenCalledWith(
      expect.objectContaining({ remarques: "1 valise max par personne." }),
      expect.anything(),
    );
  });

  it("permet de partager un trajet sur les réseaux sociaux (demande utilisateur 2026-09-25)", () => {
    vi.mocked(useEvenementsHooks.useCovoiturages).mockReturnValue({
      data: page([trajet()]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useEvenementsHooks.useCovoiturages>);

    renderWithProviders(<CovoituragePage />);

    expect(screen.getByLabelText("partage.bouton_aria")).toBeInTheDocument();
  });

  it("affiche les passagers qui ont réservé sur un trajet", () => {
    vi.mocked(useEvenementsHooks.useCovoiturages).mockReturnValue({
      data: page([trajet()]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useEvenementsHooks.useCovoiturages>);
    vi.mocked(useEvenementsHooks.useReservationsCovoiturage).mockReturnValue({
      data: page([reservation()]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useEvenementsHooks.useReservationsCovoiturage>);

    renderWithProviders(<CovoituragePage />);

    expect(screen.getByText(/Amina Ben Salah/)).toBeInTheDocument();
  });

  it("ignore les réservations annulées dans la liste des passagers", () => {
    vi.mocked(useEvenementsHooks.useCovoiturages).mockReturnValue({
      data: page([trajet()]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useEvenementsHooks.useCovoiturages>);
    vi.mocked(useEvenementsHooks.useReservationsCovoiturage).mockReturnValue({
      data: page([reservation({ statut: "annulee" })]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useEvenementsHooks.useReservationsCovoiturage>);

    renderWithProviders(<CovoituragePage />);

    expect(screen.queryByText(/Amina Ben Salah/)).not.toBeInTheDocument();
    expect(screen.getByText("covoiturage.aucune_reservation")).toBeInTheDocument();
  });

  it("affiche un message si personne n'a encore réservé", () => {
    vi.mocked(useEvenementsHooks.useCovoiturages).mockReturnValue({
      data: page([trajet()]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useEvenementsHooks.useCovoiturages>);

    renderWithProviders(<CovoituragePage />);

    expect(screen.getByText("covoiturage.aucune_reservation")).toBeInTheDocument();
  });
});
