import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "../../test/renderWithProviders";
import * as useEvenementsHooks from "../../hooks/useEvenements";
import { useAuthStore } from "../../store/authStore";
import type { Evenement, Inscription } from "../../types/evenements";
import EvenementsPage from "./EvenementsPage";

vi.mock("../../hooks/useEvenements", async () => {
  const actual = await vi.importActual<typeof useEvenementsHooks>("../../hooks/useEvenements");
  return {
    ...actual,
    useEvenements: vi.fn(),
    useInscriptions: vi.fn(),
    useInscrire: vi.fn(),
    useAnnulerInscription: vi.fn(),
  };
});

// Ajouté le 2026-09-20 (retour utilisateur : "Confirmer et payer" doit sauter directement au
// paiement) — seul `useNavigate` est remplacé, le reste (MemoryRouter, Routes, Route utilisés
// par renderWithProviders) reste le vrai module.
const navigateMock = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => navigateMock };
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

function evenement(overrides: Partial<Evenement> = {}): Evenement {
  return {
    id: "e1",
    titre: "Déplacement Stuttgart",
    type_evenement: "deplacement",
    description: "Bus au départ de Berlin.",
    date_evenement: "2099-05-31",
    heure: "06:00",
    lieu: "Mercedes-Benz Arena, Stuttgart",
    point_rdv: "Berlin Hbf",
    places_max: 45,
    gratuit: false,
    cout: "35.00",
    accompagnants_payants: false,
    prix_accompagnant_adulte: "0.00",
    prix_accompagnant_enfant: "0.00",
    age_limite_accompagnant_enfant: 12,
    organisateur: "m1",
    organisateur_detail: { id: "m1", prenom: "Sami", nom: "Trabelsi" },
    statut: "publie",
    visible_public: false,
    places_reservees: 38,
    places_restantes: 7,
    created_by: "m1",
    created_at: "2026-01-01T10:00:00Z",
    updated_at: "2026-01-01T10:00:00Z",
    ...overrides,
  };
}

function inscription(overrides: Partial<Inscription> = {}): Inscription {
  return {
    id: "i1",
    evenement: "e1",
    evenement_detail: {
      id: "e1",
      titre: "Déplacement Stuttgart",
      date_evenement: "2099-05-31",
      heure: "06:00",
      lieu: "Mercedes-Benz Arena, Stuttgart",
      cout: "35.00",
      gratuit: false,
      statut: "publie",
    },
    membre: "m2",
    places: 1,
    nombre_accompagnants_adultes: 0,
    nombre_accompagnants_enfants: 0,
    regime_alimentaire: "aucun",
    remarques: "",
    montant_paye: "35.00",
    statut: "en_attente_paiement",
    cotisation: null,
    created_at: "2026-01-01T10:00:00Z",
    updated_at: "2026-01-01T10:00:00Z",
    ...overrides,
  };
}

describe("EvenementsPage", () => {
  beforeEach(() => {
    navigateMock.mockClear();
    useAuthStore.setState({
      accessToken: "t",
      refreshToken: "r",
      user: membre,
      isAuthenticated: true,
    });
    vi.mocked(useEvenementsHooks.useInscrire).mockReturnValue(
      mutationMock<ReturnType<typeof useEvenementsHooks.useInscrire>>(),
    );
    vi.mocked(useEvenementsHooks.useAnnulerInscription).mockReturnValue(
      mutationMock<ReturnType<typeof useEvenementsHooks.useAnnulerInscription>>(),
    );
    vi.mocked(useEvenementsHooks.useInscriptions).mockReturnValue({
      data: page([]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useEvenementsHooks.useInscriptions>);
  });

  it("affiche les événements à venir", () => {
    vi.mocked(useEvenementsHooks.useEvenements).mockReturnValue({
      data: page([evenement()]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useEvenementsHooks.useEvenements>);

    renderWithProviders(<EvenementsPage />);

    expect(screen.getByText("Déplacement Stuttgart")).toBeInTheDocument();
  });

  it("affiche un message si aucun événement à venir", () => {
    vi.mocked(useEvenementsHooks.useEvenements).mockReturnValue({
      data: page([]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useEvenementsHooks.useEvenements>);

    renderWithProviders(<EvenementsPage />);

    expect(screen.getByText("aucun_evenement")).toBeInTheDocument();
  });

  it("ouvre la modale d'inscription et confirme l'inscription (places/régime/remarques)", () => {
    const inscrire = mutationMock<ReturnType<typeof useEvenementsHooks.useInscrire>>();
    vi.mocked(useEvenementsHooks.useInscrire).mockReturnValue(inscrire);
    vi.mocked(useEvenementsHooks.useEvenements).mockReturnValue({
      data: page([evenement()]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useEvenementsHooks.useEvenements>);

    renderWithProviders(<EvenementsPage />);

    fireEvent.click(screen.getByText("sinscrire_payer"));
    fireEvent.click(screen.getByText("modal_confirmer_payer"));

    expect(inscrire.mutate).toHaveBeenCalledWith(
      {
        evenement: "e1",
        places: 1,
        nombre_accompagnants_adultes: 0,
        nombre_accompagnants_enfants: 0,
        regime_alimentaire: "aucun",
        remarques: "",
      },
      expect.anything(),
    );
  });

  it("inscrit avec des accompagnants payants et calcule le montant estimé côté client (indicatif)", () => {
    const inscrire = mutationMock<ReturnType<typeof useEvenementsHooks.useInscrire>>();
    vi.mocked(useEvenementsHooks.useInscrire).mockReturnValue(inscrire);
    vi.mocked(useEvenementsHooks.useEvenements).mockReturnValue({
      data: page([
        evenement({
          accompagnants_payants: true,
          prix_accompagnant_adulte: "10.00",
          prix_accompagnant_enfant: "5.00",
          age_limite_accompagnant_enfant: 12,
        }),
      ]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useEvenementsHooks.useEvenements>);

    renderWithProviders(<EvenementsPage />);

    fireEvent.click(screen.getByText("sinscrire_payer"));
    fireEvent.change(screen.getByLabelText("modal_accompagnants_adultes (10,00 €)"), {
      target: { value: "2" },
    });
    fireEvent.click(screen.getByText("modal_confirmer_payer"));

    expect(inscrire.mutate).toHaveBeenCalledWith(
      {
        evenement: "e1",
        places: 1,
        nombre_accompagnants_adultes: 2,
        nombre_accompagnants_enfants: 0,
        regime_alimentaire: "aucun",
        remarques: "",
      },
      expect.anything(),
    );
  });

  // --- Lien direct vers le paiement (ajouté le 2026-09-20, retour utilisateur : "Confirmer et
  // payer" doit sauter directement au paiement) ---

  it("confirmer et payer une inscription payante navigue directement vers son paiement", () => {
    const inscrire = mutationMock<ReturnType<typeof useEvenementsHooks.useInscrire>>();
    inscrire.mutate = vi.fn((_payload, options) => {
      options?.onSuccess?.(inscription({ id: "i2", cotisation: "cot1" }));
    });
    vi.mocked(useEvenementsHooks.useInscrire).mockReturnValue(inscrire);
    vi.mocked(useEvenementsHooks.useEvenements).mockReturnValue({
      data: page([evenement()]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useEvenementsHooks.useEvenements>);

    renderWithProviders(<EvenementsPage />);

    fireEvent.click(screen.getByText("sinscrire_payer"));
    fireEvent.click(screen.getByText("modal_confirmer_payer"));

    expect(navigateMock).toHaveBeenCalledWith("/cotisation?paiement=cot1");
  });

  it("confirmer une inscription gratuite ne navigue pas vers un paiement", () => {
    const inscrire = mutationMock<ReturnType<typeof useEvenementsHooks.useInscrire>>();
    inscrire.mutate = vi.fn((_payload, options) => {
      options?.onSuccess?.(
        inscription({ id: "i3", statut: "confirmee", montant_paye: "0.00", cotisation: null }),
      );
    });
    vi.mocked(useEvenementsHooks.useInscrire).mockReturnValue(inscrire);
    vi.mocked(useEvenementsHooks.useEvenements).mockReturnValue({
      data: page([evenement({ gratuit: true, cout: "0.00" })]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useEvenementsHooks.useEvenements>);

    renderWithProviders(<EvenementsPage />);

    fireEvent.click(screen.getByText("sinscrire_gratuit"));
    fireEvent.click(screen.getByText("modal_confirmer"));

    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("payer_maintenant navigue vers le paiement lié à l'inscription", () => {
    vi.mocked(useEvenementsHooks.useEvenements).mockReturnValue({
      data: page([]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useEvenementsHooks.useEvenements>);
    vi.mocked(useEvenementsHooks.useInscriptions).mockReturnValue({
      data: page([inscription({ cotisation: "cot2" })]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useEvenementsHooks.useInscriptions>);

    renderWithProviders(<EvenementsPage />);

    fireEvent.click(screen.getByText("tab_inscrits"));
    fireEvent.click(screen.getByText("payer_maintenant"));

    expect(navigateMock).toHaveBeenCalledWith("/cotisation?paiement=cot2");
  });

  it("affiche mes inscriptions avec le statut de paiement", () => {
    vi.mocked(useEvenementsHooks.useEvenements).mockReturnValue({
      data: page([]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useEvenementsHooks.useEvenements>);
    vi.mocked(useEvenementsHooks.useInscriptions).mockReturnValue({
      data: page([inscription()]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useEvenementsHooks.useInscriptions>);

    renderWithProviders(<EvenementsPage />);

    fireEvent.click(screen.getByText("tab_inscrits"));

    expect(screen.getByText("Déplacement Stuttgart")).toBeInTheDocument();
    expect(screen.getByText("payer_maintenant")).toBeInTheDocument();
  });
});
