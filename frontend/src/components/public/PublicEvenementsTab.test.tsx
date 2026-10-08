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
    date_fin: null,
    heure_fin: null,
    date_limite_paiement: null,
    lieu: "Berlin",
    point_rdv: "",
    lieu_maps_url: "",
    image: null,
    places_max: 20,
    gratuit: true,
    cout: "0.00",
    cout_non_membre: null,
    cout_applicable: "0.00",
    reserve_membres: false,
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

  // Régression du 2026-10-08 : la kachel publique n'affichait aucun prix du tout.
  it("affiche les prix membre / non-membre et accompagnants sur la kachel publique", () => {
    vi.mocked(useEvenementsHooks.useEvenements).mockReturnValue({
      data: page([
        evenement({
          gratuit: false,
          cout: "35.00",
          cout_non_membre: "50.00",
          cout_applicable: "50.00",
          accompagnants_payants: true,
          prix_accompagnant_adulte: "10.00",
          prix_accompagnant_enfant: "5.00",
        }),
      ]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useEvenementsHooks.useEvenements>);

    renderWithProviders(<PublicEvenementsTab />);

    expect(screen.getByText("preis_mitglieder")).toBeInTheDocument();
    expect(screen.getByText("preis_nichtmitglieder")).toBeInTheDocument();
    expect(screen.getByText("preis_begleitpersonen")).toBeInTheDocument();
  });

  // evenement.description contient désormais du HTML (éditeur riche AdminEventsPage, demande
  // utilisateur du 2026-09-27 point 11.3) — la kachel doit le RENDRE (comme ProjetCard pour
  // description_html), pas l'afficher tel quel en tant que texte brut avec les balises visibles.
  it("rend la description au format HTML sur la kachel, sans afficher les balises", () => {
    vi.mocked(useEvenementsHooks.useEvenements).mockReturnValue({
      data: page([evenement({ description: "<p>Départ à <strong>8h</strong> précises.</p>" })]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useEvenementsHooks.useEvenements>);

    renderWithProviders(<PublicEvenementsTab />);

    expect(screen.getByText("précises.", { exact: false })).toBeInTheDocument();
    expect(screen.queryByText(/<p>|<strong>/)).not.toBeInTheDocument();
  });

  // Image de kachel (demande utilisateur du 2026-09-27, point 11.1).
  it("affiche l'image de kachel en fond quand elle est renseignée", () => {
    vi.mocked(useEvenementsHooks.useEvenements).mockReturnValue({
      data: page([evenement({ image: "https://cdn.example.de/evenements/kachel.jpg" })]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useEvenementsHooks.useEvenements>);

    renderWithProviders(<PublicEvenementsTab />);

    expect(screen.getByText("Sortie supporters").closest("div")).toHaveStyle(
      "background-image: url(https://cdn.example.de/evenements/kachel.jpg)",
    );
  });

  it("affiche un événement réservé aux membres avec badge et bouton désactivé (anonyme)", () => {
    vi.mocked(useEvenementsHooks.useEvenements).mockReturnValue({
      data: page([evenement({ reserve_membres: true })]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useEvenementsHooks.useEvenements>);

    renderWithProviders(<PublicEvenementsTab />);
    const badges = screen.getAllByText("nur_fuer_mitglieder");
    expect(badges.length).toBe(2); // badge + libellé du bouton
    expect(screen.getByRole("button", { name: "nur_fuer_mitglieder" })).toBeDisabled();
  });

  it("masque point de rendez-vous et carte pour un non-membre sur un événement réservé", () => {
    vi.mocked(useEvenementsHooks.useEvenements).mockReturnValue({
      data: page([evenement({ reserve_membres: true, point_rdv: "Gare centrale" })]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useEvenementsHooks.useEvenements>);

    renderWithProviders(<PublicEvenementsTab />);
    expect(screen.queryByText(/Gare centrale/)).not.toBeInTheDocument();
    expect(screen.queryByText("carte_afficher")).not.toBeInTheDocument();
  });

  it("affiche point de rendez-vous, carte et échéance de paiement sur un événement public", () => {
    vi.mocked(useEvenementsHooks.useEvenements).mockReturnValue({
      data: page([
        evenement({
          reserve_membres: false,
          point_rdv: "Gare centrale",
          gratuit: false,
          date_limite_paiement: "2099-05-01",
          heure: "18:00:00",
          heure_fin: "22:30:00",
        }),
      ]),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useEvenementsHooks.useEvenements>);

    renderWithProviders(<PublicEvenementsTab />);
    expect(screen.getByText(/Gare centrale/)).toBeInTheDocument();
    expect(screen.getByText("carte_afficher")).toBeInTheDocument();
    expect(screen.getByText(/18:00 – 22:30/)).toBeInTheDocument();
    expect(screen.getByText(/paiement_avant/)).toBeInTheDocument();
  });

  it("garde le dégradé de repli tant qu'aucune image n'est téléversée", () => {
    renderWithProviders(<PublicEvenementsTab />);
    const banniere = screen.getByText("Sortie supporters").closest("div");
    expect(banniere).toHaveClass("bg-gradient-to-br");
    expect(banniere).not.toHaveAttribute("style");
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

  it('affiche une invite de connexion sur "Meine Anmeldungen" pour un visiteur anonyme', () => {
    renderWithProviders(<PublicEvenementsTab />);
    fireEvent.click(screen.getByText("tab_inscrits"));

    expect(screen.getByText("evenements_public.connexion_requise_titre")).toBeInTheDocument();
    expect(screen.queryByText("aucune_inscription")).not.toBeInTheDocument();
  });

  it('affiche les vraies inscriptions sur "Meine Anmeldungen" pour un utilisateur authentifié', () => {
    useAuthStore.setState({
      isAuthenticated: true,
      user: { id: "u1", email: "m@example.com", role: "membre", langue_preferee: "fr" },
    });
    renderWithProviders(<PublicEvenementsTab />);
    fireEvent.click(screen.getByText("tab_inscrits"));

    expect(screen.getByText("aucune_inscription")).toBeInTheDocument();
    expect(screen.queryByText("evenements_public.connexion_requise_titre")).not.toBeInTheDocument();
  });
});
