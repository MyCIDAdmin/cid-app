import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "../../test/renderWithProviders";
import type { VoteSession } from "../../types/vote";
import BulletinVote from "./BulletinVote";

function session(overrides: Partial<VoteSession> = {}): VoteSession {
  return {
    id: "s1",
    titre: "Élection du Bureau",
    description: "Choisissez le nouveau président.",
    type_vote: "unique",
    mode_anonymat: "anonyme",
    nb_choix_max: 1,
    eligibilite: "tous_actifs",
    duree_minutes: 30,
    quorum_pct: null,
    statut: "ouverte",
    date_ouverture: "2026-01-01T10:00:00Z",
    date_fin: "2026-01-01T10:30:00Z",
    date_cloture: null,
    options: [
      { id: "o1", label: "Candidat A", description: "", ordre: 0 },
      { id: "o2", label: "Candidat B", description: "", ordre: 1 },
    ],
    total_participants: 0,
    total_eligibles: 10,
    resultats_visibles: false,
    created_by: 1,
    created_at: "2026-01-01T10:00:00Z",
    ...overrides,
  };
}

describe("BulletinVote", () => {
  it("désactive la soumission tant qu'aucune option n'est sélectionnée (type unique)", () => {
    const onSubmit = vi.fn();
    renderWithProviders(<BulletinVote session={session()} onSubmit={onSubmit} envoiEnCours={false} />);
    expect(screen.getByText("bulletin.confirmer")).toBeDisabled();
  });

  it("soumet l'id de l'option choisie pour un vote à choix unique", () => {
    const onSubmit = vi.fn();
    renderWithProviders(<BulletinVote session={session()} onSubmit={onSubmit} envoiEnCours={false} />);
    fireEvent.click(screen.getByText("Candidat B"));
    fireEvent.click(screen.getByText("bulletin.confirmer"));
    expect(onSubmit).toHaveBeenCalledWith(["o2"]);
  });

  it("plafonne la sélection à nb_choix_max pour un vote à choix multiple", () => {
    const onSubmit = vi.fn();
    const s = session({
      type_vote: "multiple",
      nb_choix_max: 1,
      options: [
        { id: "o1", label: "Option A", description: "", ordre: 0 },
        { id: "o2", label: "Option B", description: "", ordre: 1 },
      ],
    });
    renderWithProviders(<BulletinVote session={s} onSubmit={onSubmit} envoiEnCours={false} />);
    fireEvent.click(screen.getByText("Option A"));
    fireEvent.click(screen.getByText("Option B"));
    fireEvent.click(screen.getByText("bulletin.confirmer"));
    // nb_choix_max=1 : le second clic est ignoré, seule la première option reste sélectionnée.
    expect(onSubmit).toHaveBeenCalledWith(["o1"]);
  });

  it("affiche un rendu Oui/Non pour type_vote=oui_non", () => {
    const onSubmit = vi.fn();
    const s = session({
      type_vote: "oui_non",
      nb_choix_max: 1,
      options: [
        { id: "o1", label: "Oui", description: "", ordre: 0 },
        { id: "o2", label: "Non", description: "", ordre: 1 },
        { id: "o3", label: "Abstention", description: "", ordre: 2 },
      ],
    });
    renderWithProviders(<BulletinVote session={s} onSubmit={onSubmit} envoiEnCours={false} />);
    expect(screen.getByText("Oui")).toBeInTheDocument();
    expect(screen.getByText("Non")).toBeInTheDocument();
    expect(screen.getByText("Abstention")).toBeInTheDocument();
  });

  it("désactive le bouton de soumission pendant l'envoi", () => {
    const s = session();
    renderWithProviders(<BulletinVote session={s} onSubmit={vi.fn()} envoiEnCours={true} />);
    fireEvent.click(screen.getByText("Candidat A"));
    expect(screen.getByText("bulletin.envoi_en_cours")).toBeDisabled();
  });
});
