import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "../test/renderWithProviders";
import * as useCommunauteHooks from "../hooks/useCommunaute";
import * as useCotisationsHooks from "../hooks/useCotisations";
import * as useAdhesionsHooks from "../hooks/useAdhesions";
import * as useEvenementsHooks from "../hooks/useEvenements";
import * as useReisenHooks from "../hooks/useReisen";
import * as useSupportHooks from "../hooks/useSupport";
import * as useProjetsHooks from "../hooks/useProjets";
import * as useStatsHooks from "../hooks/useStats";
import * as useVoteHooks from "../hooks/useVote";
import i18n from "../i18n";
import { useAuthStore } from "../store/authStore";
import type { Cotisation } from "../types/cotisation";
import type { Evenement, Inscription } from "../types/evenements";
import type { Publication } from "../types/communaute";
import frDashboard from "../../public/locales/fr/dashboard.json";
import DashboardPage from "./DashboardPage";

// i18next-http-backend ne fait aucune requête réseau dans l'environnement de test (jsdom, pas de
// serveur Vite) : partout ailleurs dans ce dépôt, les tests de pages traduites vérifient donc les
// clés brutes plutôt que le texte traduit. Ici, on préfère injecter directement le bundle FR réel
// (`addResourceBundle`) pour vérifier le texte effectivement affiché — notamment l'interpolation
// (prénom, montants, années) au cœur même du comportement testé (AHM-52 et le bandeau de statut).
beforeAll(() => {
  // `changeLanguage` déclencherait un rechargement de tous les namespaces via le backend HTTP
  // (absent en test) : on s'appuie plutôt sur `fallbackLng: "fr"` (i18n.ts), déjà actif quel que
  // soit la langue détectée par jsdom, pour que `t()` retrouve ce bundle sans requête réseau.
  i18n.addResourceBundle("fr", "dashboard", frDashboard, true, true);
});

vi.mock("../hooks/useEvenements", async () => {
  const actual = await vi.importActual<typeof useEvenementsHooks>("../hooks/useEvenements");
  return { ...actual, useEvenements: vi.fn(), useInscriptions: vi.fn() };
});
vi.mock("../hooks/useCotisations", async () => {
  const actual = await vi.importActual<typeof useCotisationsHooks>("../hooks/useCotisations");
  return { ...actual, useMesCotisations: vi.fn() };
});
vi.mock("../hooks/useVote", async () => {
  const actual = await vi.importActual<typeof useVoteHooks>("../hooks/useVote");
  return { ...actual, useSessionVoteActive: vi.fn() };
});
vi.mock("../hooks/useCommunaute", async () => {
  const actual = await vi.importActual<typeof useCommunauteHooks>("../hooks/useCommunaute");
  return {
    ...actual,
    usePublications: vi.fn(),
    useCalendrierRencontres: vi.fn(),
    useTippspiele: vi.fn(),
    useTippspielTeilnahmen: vi.fn(),
    useTippspielTipps: vi.fn(),
  };
});
vi.mock("../hooks/useRbac", async () => {
  const actual = await vi.importActual<typeof import("../hooks/useRbac")>("../hooks/useRbac");
  return { ...actual, useModuleOuvert: () => ({ ouvert: true, chargement: false }) };
});
vi.mock("../hooks/useReisen", async () => {
  const actual = await vi.importActual<typeof useReisenHooks>("../hooks/useReisen");
  return { ...actual, useSaison: vi.fn(), useReisenListe: vi.fn(), useUmfeld: vi.fn() };
});
vi.mock("../hooks/useAdhesions", async () => {
  const actual = await vi.importActual<typeof useAdhesionsHooks>("../hooks/useAdhesions");
  return { ...actual, useJustificatifsEnAttente: vi.fn() };
});
vi.mock("../hooks/useSupport", async () => {
  const actual = await vi.importActual<typeof useSupportHooks>("../hooks/useSupport");
  return { ...actual, useAlleTickets: vi.fn() };
});
vi.mock("../hooks/useProjets", async () => {
  const actual = await vi.importActual<typeof useProjetsHooks>("../hooks/useProjets");
  return { ...actual, useOffeneStellen: vi.fn() };
});
vi.mock("../hooks/useStats", async () => {
  const actual = await vi.importActual<typeof useStatsHooks>("../hooks/useStats");
  return { ...actual, useStatsMembres: vi.fn(), useStatsFinancier: vi.fn() };
});

const anneeCourante = new Date().getFullYear();

const membre = {
  id: "u1",
  email: "membre@example.com",
  role: "membre" as const,
  langue_preferee: "fr" as const,
  prenom: "Sami",
  nom: "Ben Salah",
};

const admin = { ...membre, id: "u2", email: "admin@example.com", role: "bureau_admin" as const };

function page<T>(results: T[]) {
  return { next: null, previous: null, results };
}

function queryResult<T>(data: T): { data: T; isLoading: false } {
  return { data, isLoading: false };
}

function evenement(overrides: Partial<Evenement> = {}): Evenement {
  return {
    id: "e1",
    ticket_aktiv: false,
    titre: "Déplacement Stuttgart",
    type_evenement: "deplacement",
    description: "",
    date_evenement: "2099-05-31",
    heure: "06:00",
    date_fin: null,
    heure_fin: null,
    date_limite_paiement: null,
    lieu: "Stuttgart",
    point_rdv: "",
    lieu_maps_url: "",
    image: null,
    places_max: 45,
    gratuit: false,
    cout: "35.00",
    cout_non_membre: null,
    cout_applicable: "35.00",
    reserve_membres: false,
    accompagnants_payants: false,
    prix_accompagnant_adulte: "0.00",
    prix_accompagnant_enfant: "0.00",
    age_limite_accompagnant_enfant: 12,
    organisateur: null,
    organisateur_detail: null,
    statut: "publie",
    visible_public: false,
    places_reservees: 38,
    places_restantes: 7,
    warteliste_laenge: 0,
    created_by: "m1",
    created_at: "2026-01-01T10:00:00Z",
    updated_at: "2026-01-01T10:00:00Z",
    ...overrides,
  };
}

function cotisation(overrides: Partial<Cotisation> = {}): Cotisation {
  return {
    id: "c1",
    membre: "m1",
    type_article: "cotisation",
    article_catalogue: null,
    projet: null,
    libelle: "Cotisation annuelle",
    montant: "45.00",
    mode_paiement: "carte",
    statut: "payee",
    reference_transaction: null,
    annee: anneeCourante,
    saisie_par: null,
    date_paiement: "2026-01-05T10:00:00Z",
    created_at: "2026-01-05T10:00:00Z",
    updated_at: "2026-01-05T10:00:00Z",
    ...overrides,
  };
}

function inscription(overrides: Partial<Inscription> = {}): Inscription {
  return {
    id: "i1",
    evenement: "e1",
    evenement_detail: {
      id: "e1",
      ticket_aktiv: false,
      titre: "Déplacement Stuttgart",
      date_evenement: "2099-05-31",
      heure: "06:00",
      lieu: "Stuttgart",
      cout: "35.00",
      gratuit: false,
      statut: "publie",
    },
    membre: "m1",
    places: 1,
    nombre_accompagnants_adultes: 0,
    nombre_accompagnants_enfants: 0,
    regime_alimentaire: "aucun",
    remarques: "",
    montant_paye: "35.00",
    statut: "en_attente_paiement",
    zahlungsfrist_bis: null,
    warteliste_position: null,
    cotisation: null,
    created_at: "2026-01-01T10:00:00Z",
    updated_at: "2026-01-01T10:00:00Z",
    ...overrides,
  };
}

function publication(overrides: Partial<Publication> = {}): Publication {
  return {
    id: "p1",
    auteur: { id: "m2", prenom: "Sana", nom: "Werfelli", photo: null },
    contenu: "Ambiance de folie hier soir !",
    image: null,
    document: null,
    hashtags: [],
    important: false,
    est_masquee: false,
    motif_masquage: "",
    created_at: "2026-01-10T10:00:00Z",
    updated_at: "2026-01-10T10:00:00Z",
    nombre_likes: 3,
    nombre_partages: 0,
    nombre_commentaires: 0,
    jaime: false,
    jai_partage: false,
    est_auteur: false,
    commentaires: [],
    ...overrides,
  };
}

function stubHooks({
  evenements = [],
  cotisations = [],
  inscriptions = [],
  publications = [],
  voteOuvert = false,
  statsMembres,
  statsFinancier,
  stellen = [],
  justificatifs = [],
  tickets = [],
}: {
  evenements?: Evenement[];
  cotisations?: Cotisation[];
  inscriptions?: Inscription[];
  publications?: Publication[];
  voteOuvert?: boolean;
  statsMembres?: { actifs: number };
  statsFinancier?: { taux_collecte: number; cotisations_en_attente: string };
  stellen?: unknown[];
  justificatifs?: unknown[];
  tickets?: unknown[];
}) {
  vi.mocked(useProjetsHooks.useOffeneStellen).mockReturnValue({
    data: stellen,
  } as unknown as ReturnType<typeof useProjetsHooks.useOffeneStellen>);
  vi.mocked(useEvenementsHooks.useEvenements).mockReturnValue(
    queryResult(page(evenements)) as unknown as ReturnType<typeof useEvenementsHooks.useEvenements>,
  );
  vi.mocked(useEvenementsHooks.useInscriptions).mockReturnValue(
    queryResult(page(inscriptions)) as unknown as ReturnType<
      typeof useEvenementsHooks.useInscriptions
    >,
  );
  vi.mocked(useCotisationsHooks.useMesCotisations).mockReturnValue(
    queryResult(page(cotisations)) as unknown as ReturnType<
      typeof useCotisationsHooks.useMesCotisations
    >,
  );
  vi.mocked(useCommunauteHooks.usePublications).mockReturnValue(
    queryResult(page(publications)) as unknown as ReturnType<
      typeof useCommunauteHooks.usePublications
    >,
  );
  vi.mocked(useVoteHooks.useSessionVoteActive).mockReturnValue(
    queryResult({
      count: voteOuvert ? 1 : 0,
      next: null,
      previous: null,
      results: voteOuvert ? [{}] : [],
    }) as unknown as ReturnType<typeof useVoteHooks.useSessionVoteActive>,
  );
  vi.mocked(useStatsHooks.useStatsMembres).mockReturnValue(
    queryResult(statsMembres) as unknown as ReturnType<typeof useStatsHooks.useStatsMembres>,
  );
  vi.mocked(useStatsHooks.useStatsFinancier).mockReturnValue(
    queryResult(statsFinancier) as unknown as ReturnType<typeof useStatsHooks.useStatsFinancier>,
  );
  const leer = { data: undefined, isLoading: false } as never;
  vi.mocked(useCommunauteHooks.useCalendrierRencontres).mockReturnValue(
    queryResult(page([])) as never,
  );
  vi.mocked(useCommunauteHooks.useTippspiele).mockReturnValue(queryResult(page([])) as never);
  vi.mocked(useCommunauteHooks.useTippspielTeilnahmen).mockReturnValue(
    queryResult(page([])) as never,
  );
  vi.mocked(useCommunauteHooks.useTippspielTipps).mockReturnValue(queryResult(page([])) as never);
  vi.mocked(useReisenHooks.useSaison).mockReturnValue(leer);
  vi.mocked(useReisenHooks.useReisenListe).mockReturnValue(leer);
  vi.mocked(useReisenHooks.useUmfeld).mockReturnValue(leer);
  vi.mocked(useAdhesionsHooks.useJustificatifsEnAttente).mockReturnValue(
    queryResult(page(justificatifs)) as never,
  );
  vi.mocked(useSupportHooks.useAlleTickets).mockReturnValue(queryResult(tickets) as never);
}

describe("DashboardPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({ user: membre });
    stubHooks({});
  });

  it("begrüßt mit dem Vornamen (nicht der E-Mail) je nach Tageszeit (AHM-52)", () => {
    renderWithProviders(<DashboardPage />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      /^(Bonjour|Bonsoir), Sami$/,
    );
  });

  it("zeigt offene Projekt-Stellen mit Link zum Projekt (2026-10-13)", () => {
    stubHooks({
      stellen: [
        {
          id: "s1",
          projet: "p1",
          projet_titre: "Neues Vereinsheim",
          titel: "Web-Designer",
          created_at: "2026-10-12T10:00:00Z",
        },
      ],
    });
    renderWithProviders(<DashboardPage />);
    const karte = screen.getByTestId("dashboard-stellen");
    expect(karte).toHaveTextContent("Web-Designer");
    expect(karte).toHaveTextContent("Neues Vereinsheim");
    expect(karte.querySelector("a[href='/projets/p1']")).not.toBeNull();
  });

  it("blendet den Stellen-Block ohne offene Stellen aus", () => {
    renderWithProviders(<DashboardPage />);
    expect(screen.queryByTestId("dashboard-stellen")).not.toBeInTheDocument();
  });

  it("retombe sur l'email si le compte n'a pas de fiche Membre liée", () => {
    useAuthStore.setState({ user: { ...admin, prenom: "", nom: "" } });
    renderWithProviders(<DashboardPage />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      /^(Bonjour|Bonsoir), admin@example.com$/,
    );
  });

  it("Heute für dich: offener Beitrag erscheint als Aufgabe, bezahlter nicht", () => {
    renderWithProviders(<DashboardPage />);
    const liste = screen.getByTestId("heute-fuer-dich");
    expect(liste).toHaveTextContent("La cotisation n'est pas encore payée");
    cleanup();

    stubHooks({ cotisations: [cotisation({ statut: "payee" })] });
    renderWithProviders(<DashboardPage />);
    expect(screen.getByTestId("heute-fuer-dich")).toHaveTextContent("Tout est fait.");
  });

  it("Heute für dich: laufende Abstimmung und Anmeldung mit offener Zahlung", () => {
    stubHooks({
      cotisations: [cotisation({ statut: "payee" })],
      inscriptions: [inscription()],
      voteOuvert: true,
    });
    renderWithProviders(<DashboardPage />);
    const liste = screen.getByTestId("heute-fuer-dich");
    expect(liste).toHaveTextContent("Inscription en attente de paiement : Déplacement Stuttgart");
    expect(liste).toHaveTextContent("Le vote est en cours");
  });

  it("„Später“ blendet eine Aufgabe bis morgen aus", () => {
    window.localStorage.clear();
    renderWithProviders(<DashboardPage />);
    const liste = screen.getByTestId("heute-fuer-dich");
    fireEvent.click(within(liste).getByRole("button", { name: "Plus tard" }));
    expect(liste).not.toHaveTextContent("La cotisation n'est pas encore payée");
  });

  it("zeigt das nächste Spiel mit Countdown und Reise (Heim- und Auswärtsspiele)", () => {
    vi.mocked(useCommunauteHooks.useCalendrierRencontres).mockReturnValue(
      queryResult(
        page([
          {
            id: "m1",
            competition: "Ligue 1",
            equipe_domicile: "Club Africain",
            equipe_exterieur: "ES Tunis",
            date_heure: new Date(Date.now() + 3 * 86_400_000).toISOString(),
            statut: "SCHEDULED",
            est_a_venir: true,
          },
        ]),
      ) as never,
    );
    vi.mocked(useReisenHooks.useSaison).mockReturnValue({
      data: [{ rencontre: "m1", gegner: "ES Tunis", heim: true, reisen: [{ id: "r1", dabei: 5 }] }],
      isLoading: false,
    } as never);
    renderWithProviders(<DashboardPage />);
    const hero = screen.getByTestId("hero");
    expect(hero).toHaveTextContent("Club Africain");
    expect(hero).toHaveTextContent("ES Tunis");
    expect(within(hero).getByRole("timer")).toHaveTextContent(/2\s*Jours/);
    expect(within(hero).getByRole("link", { name: /5 participent/ })).toHaveAttribute(
      "href",
      "/reisen/r1",
    );
  });

  it("ohne kommendes Spiel gibt es keinen Kopfbereich", () => {
    renderWithProviders(<DashboardPage />);
    expect(screen.queryByTestId("hero")).not.toBeInTheDocument();
  });

  it("Büro: „À traiter“ und Kennzahlen des Vereins für Bureau Admin+", () => {
    useAuthStore.setState({ user: admin });
    stubHooks({
      statsMembres: { actifs: 312 },
      statsFinancier: { taux_collecte: 86, cotisations_en_attente: "120.00" },
      justificatifs: [{ id: "s1" }, { id: "s2" }],
      tickets: [{ id: 1 }],
    });
    renderWithProviders(<DashboardPage />);
    const buero = screen.getByTestId("buero-zu-erledigen");
    expect(buero).toHaveTextContent("2 justificatifs à vérifier");
    expect(buero).toHaveTextContent("1 demande de support");
    expect(screen.getByText("312")).toBeInTheDocument();
    expect(screen.getByText("86 %")).toBeInTheDocument();
  });

  it("ein Mitglied sieht keine Büro-Ansicht und löst die Büro-Abfragen nicht aus", () => {
    renderWithProviders(<DashboardPage />);
    expect(screen.queryByTestId("buero-zu-erledigen")).not.toBeInTheDocument();
    expect(useStatsHooks.useStatsMembres).not.toHaveBeenCalled();
    expect(useAdhesionsHooks.useJustificatifsEnAttente).not.toHaveBeenCalled();
  });

  it("trie les prochains événements par date et affiche le remplissage", () => {
    stubHooks({
      evenements: [
        evenement({
          id: "e2",
          titre: "Fête de fin de saison",
          date_evenement: "2099-06-14",
          places_reservees: 12,
          places_max: 20,
        }),
        evenement({ id: "e1", titre: "Déplacement Stuttgart", date_evenement: "2099-05-31" }),
      ],
    });
    renderWithProviders(<DashboardPage />);

    const titres = screen.getAllByText(/Déplacement Stuttgart|Fête de fin de saison/);
    expect(titres[0]).toHaveTextContent("Déplacement Stuttgart");
    expect(screen.getByText("38/45")).toBeInTheDocument();
    expect(screen.getByText("12/20")).toBeInTheDocument();
  });

  it("affiche ma situation financière (cotisation, inscription événement en attente)", () => {
    stubHooks({
      cotisations: [cotisation({ statut: "payee" })],
      inscriptions: [inscription()],
    });
    renderWithProviders(<DashboardPage />);

    expect(screen.getByText(`Cotisation annuelle ${anneeCourante}`)).toBeInTheDocument();
    expect(screen.getByText("Payée ✓")).toBeInTheDocument();
    expect(screen.getByText("Déplacement Stuttgart")).toBeInTheDocument();
    expect(screen.getByText("35,00 €")).toBeInTheDocument();
  });

  it("affiche les dernières publications du Fil d'actualité", () => {
    stubHooks({ publications: [publication()] });
    renderWithProviders(<DashboardPage />);

    expect(screen.getByText("Nouveau depuis ta dernière visite")).toBeInTheDocument();
    expect(screen.getByText(/Sana Werfelli/)).toBeInTheDocument();
    expect(screen.getByText(/Ambiance de folie hier soir/)).toBeInTheDocument();
  });

  it("affiche l'aperçu d'une publication HTML (éditeur Word) en texte brut, sans balises", () => {
    // Depuis le 2026-09-29 (retour utilisateur, module "Neuigkeiten"), Publication.contenu est
    // du HTML — l'aperçu compact du dashboard doit rester lisible (voir apercuTexteDepuisHtml).
    stubHooks({
      publications: [
        publication({ contenu: "<p><strong>Belle victoire</strong> hier soir !</p>" }),
      ],
    });
    renderWithProviders(<DashboardPage />);

    expect(screen.getByText("Belle victoire hier soir !")).toBeInTheDocument();
    expect(screen.queryByText(/<p>|<strong>/)).not.toBeInTheDocument();
  });
});
