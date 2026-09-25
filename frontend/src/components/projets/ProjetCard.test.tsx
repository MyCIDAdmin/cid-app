import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "../../test/renderWithProviders";
import * as useProjetsHooks from "../../hooks/useProjets";
import type { Projet } from "../../types/projets";
import ProjetCard from "./ProjetCard";

// Comme le reste du projet (voir CotisationsEnAttentePage.test.tsx), les assertions portent
// sur les CLÉS i18n brutes plutôt que sur le texte traduit : les traductions sont chargées de
// façon asynchrone via i18next-http-backend (voir src/i18n.ts) et ne se résolvent jamais dans
// l'environnement de test jsdom — react-i18next retombe alors sur la clé elle-même.
vi.mock("../../hooks/useProjets", async () => {
  const actual = await vi.importActual<typeof useProjetsHooks>("../../hooks/useProjets");
  return {
    ...actual,
    useContributeursProjet: vi.fn(),
  };
});

function projet(overrides: Partial<Projet> = {}): Projet {
  return {
    id: "proj-1",
    titre: "Rénovation du local associatif",
    description_html: "<p>Texte riche.</p>",
    statut: "en_cours",
    responsable: null,
    responsable_detail: null,
    cagnote_active: true,
    objectif_montant: "1000.00",
    montant_collecte: "250.00",
    nb_contributeurs: 2,
    date_limite: null,
    echeance_depassee: false,
    ordre: 0,
    images: [],
    est_gestionnaire: false,
    created_by: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("ProjetCard", () => {
  it("affiche le titre, le statut et la barre de progression de la cagnote sur la face avant", () => {
    vi.mocked(useProjetsHooks.useContributeursProjet).mockReturnValue({
      data: undefined,
      isPending: false,
    } as unknown as ReturnType<typeof useProjetsHooks.useContributeursProjet>);

    renderWithProviders(<ProjetCard projet={projet()} />);

    expect(screen.getByText("Rénovation du local associatif")).toBeInTheDocument();
    expect(screen.getByText("statut.en_cours")).toBeInTheDocument();
    // Barre de progression : 250/1000 = 25 %.
    const barre = document.querySelector(".bg-ca.rounded-full") as HTMLElement;
    expect(barre.style.width).toBe("25%");
  });

  it("permet de partager le projet sans retourner la kachel (demande utilisateur 2026-09-25)", () => {
    vi.mocked(useProjetsHooks.useContributeursProjet).mockReturnValue({
      data: undefined,
      isPending: false,
    } as unknown as ReturnType<typeof useProjetsHooks.useContributeursProjet>);

    renderWithProviders(<ProjetCard projet={projet()} />);

    const boutonPartage = screen.getByLabelText("partage.bouton_aria");
    expect(boutonPartage).toBeInTheDocument();

    fireEvent.click(boutonPartage);
    expect(screen.getByRole("button", { pressed: false })).toBeInTheDocument();
  });

  it("n'interroge PAS les contributeurs avant le premier retournement (chargement paresseux)", () => {
    const mock = vi.mocked(useProjetsHooks.useContributeursProjet).mockReturnValue({
      data: undefined,
      isPending: false,
    } as unknown as ReturnType<typeof useProjetsHooks.useContributeursProjet>);

    renderWithProviders(<ProjetCard projet={projet()} />);

    // Le hook est bien appelé (React Query gère lui-même l'activation via `enabled`), mais
    // avec `undefined` tant que la carte n'est pas retournée — voir ProjetCard.tsx.
    expect(mock).toHaveBeenCalledWith(undefined);
  });

  it("affiche les contributeurs après un clic sur la kachel (demande utilisateur point 5)", async () => {
    const mock = vi.mocked(useProjetsHooks.useContributeursProjet).mockReturnValue({
      data: [
        {
          membre: { id: "m1", prenom: "Amira", nom: "Ben Ali", photo: null },
          montant_total: "150.00",
          derniere_contribution: "2026-02-01T00:00:00Z",
        },
      ],
      isPending: false,
    } as unknown as ReturnType<typeof useProjetsHooks.useContributeursProjet>);

    renderWithProviders(<ProjetCard projet={projet()} />);

    fireEvent.click(screen.getByRole("button", { name: "carte.retourner" }));

    await waitFor(() => {
      expect(mock).toHaveBeenCalledWith("proj-1");
    });
    expect(screen.getByText(/Amira Ben Ali/)).toBeInTheDocument();
    expect(screen.getByText("150,00 €")).toBeInTheDocument();
  });

  it("affiche un message quand personne n'a encore contribué", () => {
    vi.mocked(useProjetsHooks.useContributeursProjet).mockReturnValue({
      data: [],
      isPending: false,
    } as unknown as ReturnType<typeof useProjetsHooks.useContributeursProjet>);

    renderWithProviders(<ProjetCard projet={projet()} />);
    fireEvent.click(screen.getByRole("button", { name: "carte.retourner" }));

    expect(screen.getByText("contributeurs.aucun")).toBeInTheDocument();
  });

  it("appelle onContribuer sans déclencher le retournement de la carte", () => {
    vi.mocked(useProjetsHooks.useContributeursProjet).mockReturnValue({
      data: undefined,
      isPending: false,
    } as unknown as ReturnType<typeof useProjetsHooks.useContributeursProjet>);
    const onContribuer = vi.fn();

    renderWithProviders(<ProjetCard projet={projet()} onContribuer={onContribuer} />);
    fireEvent.click(screen.getByText("cagnote.contribuer"));

    expect(onContribuer).toHaveBeenCalledTimes(1);
    // La carte n'est PAS retournée — le clic sur "Contribuer" a stoppé la propagation, le
    // bouton pour retourner la kachel affiche donc toujours son libellé "face avant".
    expect(screen.getByRole("button", { name: "carte.retourner" })).toBeInTheDocument();
  });

  it("ne propose pas de contribution si la cagnote est désactivée", () => {
    vi.mocked(useProjetsHooks.useContributeursProjet).mockReturnValue({
      data: undefined,
      isPending: false,
    } as unknown as ReturnType<typeof useProjetsHooks.useContributeursProjet>);

    renderWithProviders(
      <ProjetCard projet={projet({ cagnote_active: false })} onContribuer={vi.fn()} />,
    );
    expect(screen.queryByText("cagnote.contribuer")).not.toBeInTheDocument();
  });

  it("ne propose pas de contribution si l'échéance est dépassée", () => {
    vi.mocked(useProjetsHooks.useContributeursProjet).mockReturnValue({
      data: undefined,
      isPending: false,
    } as unknown as ReturnType<typeof useProjetsHooks.useContributeursProjet>);

    renderWithProviders(
      <ProjetCard
        projet={projet({ date_limite: "2020-01-01", echeance_depassee: true })}
        onContribuer={vi.fn()}
      />,
    );
    expect(screen.queryByText("cagnote.contribuer")).not.toBeInTheDocument();
    expect(screen.getByText("echeance.depassee")).toBeInTheDocument();
  });

  it("appelle onVoirRapport sans déclencher le retournement de la carte", () => {
    vi.mocked(useProjetsHooks.useContributeursProjet).mockReturnValue({
      data: undefined,
      isPending: false,
    } as unknown as ReturnType<typeof useProjetsHooks.useContributeursProjet>);
    const onVoirRapport = vi.fn();
    const unProjet = projet();

    renderWithProviders(<ProjetCard projet={unProjet} onVoirRapport={onVoirRapport} />);
    fireEvent.click(screen.getByText("rapport.voir"));

    expect(onVoirRapport).toHaveBeenCalledWith(unProjet);
    expect(screen.getByRole("button", { name: "carte.retourner" })).toBeInTheDocument();
  });

  it("n'affiche pas le bouton de rapport quand onVoirRapport n'est pas fourni", () => {
    vi.mocked(useProjetsHooks.useContributeursProjet).mockReturnValue({
      data: undefined,
      isPending: false,
    } as unknown as ReturnType<typeof useProjetsHooks.useContributeursProjet>);

    renderWithProviders(<ProjetCard projet={projet()} />);
    expect(screen.queryByText("rapport.voir")).not.toBeInTheDocument();
  });

  it("affiche un bouton de modification quand onModifier est fourni (Bureau Admin+)", () => {
    vi.mocked(useProjetsHooks.useContributeursProjet).mockReturnValue({
      data: undefined,
      isPending: false,
    } as unknown as ReturnType<typeof useProjetsHooks.useContributeursProjet>);
    const onModifier = vi.fn();
    const unProjet = projet();

    renderWithProviders(<ProjetCard projet={unProjet} onModifier={onModifier} />);
    fireEvent.click(screen.getByRole("button", { name: "Modifier" }));

    expect(onModifier).toHaveBeenCalledWith(unProjet);
  });
});
