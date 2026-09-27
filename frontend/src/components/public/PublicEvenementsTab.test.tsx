import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "../../test/renderWithProviders";
import * as useEvenementsHooks from "../../hooks/useEvenements";
import { useAuthStore } from "../../store/authStore";
import type { Evenement } from "../../types/evenements";
import PublicEvenementsTab from "./PublicEvenementsTab";

vi.mock("../../hooks/useEvenements", async () => {
  const actual = await vi.importActual<typeof useEvenementsHooks>("../../hooks/useEvenements");
  return {
    ...actual,
    useEvenements: vi.fn(),
    useInscriptions: vi.fn(),
    useAnnulerInscription: vi.fn(),
  };
});

const navigateMock = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => navigateMock };
});

function page<T>(results: T[]) {
  return { count: results.length, next: null, previous: null, results };
}

function evenement(overrides: Partial<Evenement> = {}): Evenement {
  return {
    id: "ev1",
    titre: "Sortie supporters",
    type_evenement: "deplacement",
    description: "Déplacement collectif.",
    date_evenement: "2026-12-01",
    heure: "18:00:00",
    lieu: "Berlin",
    point_rdv: "",
    places_max: 20,
    gratuit: true,
    cout: "0.00",
    accompagnants_payants: false,
    prix_accompagnant_adulte: "0.00",
    prix_accompagnant_enfant: "0.00",
    age_limite_accompagnant_enfant: 12,
    organisateur: null,
    organisateur_detail: null,
    statut: "publie",
    visible_public: true,
    places_reservees: 5,
    places_restantes: 15,
    created_by: "m1",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("PublicEvenementsTab", () => {
  beforeEach(() => {
    navigateMock.mockClear();
    useAuthStore.setState({ isAuthenticated: false, user: null });
    vi.mocked(useEvenementsHooks.useEvenements).mockReturnValue({
      data: page([evenement()]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useEvenementsHooks.useEvenements>);
    vi.mocked(useEvenementsHooks.useInscriptions).mockReturnValue({
      data: page([]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useEvenementsHooks.useInscriptions>);
    vi.mocked(useEvenementsHooks.useAnnulerInscription).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    } as unknown as ReturnType<typeof useEvenementsHooks.useAnnulerInscription>);
  });

  it("affiche les événements à venir sous forme de kacheln", () => {
    renderWithProviders(<PublicEvenementsTab />);
    expect(screen.getByText("Sortie supporters")).toBeInTheDocument();
  });

  // evenement.description contient désormais du HTML (éditeur riche AdminEventsPage, demande
  // utilisateur du 2026-09-27 point 11.3) — la kachel doit le RENDRE (comme ProjetCard pour
  // description_html), pas l'afficher tel quel en tant que texte brut avec les balises visibles.
  it("rend la description au format HTML sur la kachel, sans afficher les balises", () => {
    vi.mocked(useEvenementsHooks.useEvenements).mockReturnValue({
      data: page([
        evenement({ description: "<p>Départ à <strong>8h</strong> précises.</p>" }),
      ]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useEvenementsHooks.useEvenements>);

    renderWithProviders(<PublicEvenementsTab />);

    expect(screen.getByText("précises.", { exact: false })).toBeInTheDocument();
    expect(screen.queryByText(/<p>|<strong>/)).not.toBeInTheDocument();
  });

  it("renvoie un visiteur anonyme vers /login au clic sur \"S'inscrire\" au lieu d'ouvrir la modale", () => {
    renderWithProviders(<PublicEvenementsTab />);
    fireEvent.click(screen.getByText("sinscrire_gratuit"));

    expect(navigateMock).toHaveBeenCalledWith("/login");
    expect(screen.queryByText("modal_inscription_titre")).not.toBeInTheDocument();
  });

  it("ouvre la modale d'inscription pour un utilisateur authentifié", () => {
    useAuthStore.setState({
      isAuthenticated: true,
      user: { id: "u1", email: "m@example.com", role: "membre", langue_preferee: "fr" },
    });
    renderWithProviders(<PublicEvenementsTab />);
    fireEvent.click(screen.getByText("sinscrire_gratuit"));

    expect(screen.getByText("modal_inscription_titre")).toBeInTheDocument();
    expect(navigateMock).not.toHaveBeenCalledWith("/login");
  });

  it("affiche une invite de connexion sur \"Meine Anmeldungen\" pour un visiteur anonyme", () => {
    renderWithProviders(<PublicEvenementsTab />);
    fireEvent.click(screen.getByText("tab_inscrits"));

    expect(screen.getByText("evenements_public.connexion_requise_titre")).toBeInTheDocument();
    expect(screen.queryByText("aucune_inscription")).not.toBeInTheDocument();
  });

  it("affiche les vraies inscriptions sur \"Meine Anmeldungen\" pour un utilisateur authentifié", () => {
    useAuthStore.setState({
      isAuthenticated: true,
      user: { id: "u1", email: "m@example.com", role: "membre", langue_preferee: "fr" },
    });
    renderWithProviders(<PublicEvenementsTab />);
    fireEvent.click(screen.getByText("tab_inscrits"));

    expect(screen.getByText("aucune_inscription")).toBeInTheDocument();
    expect(
      screen.queryByText("evenements_public.connexion_requise_titre"),
    ).not.toBeInTheDocument();
  });
});
