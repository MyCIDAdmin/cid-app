import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { renderWithProviders } from "../../test/renderWithProviders";
import type { Resultats } from "../../types/vote";
import ResultatsPodium from "./ResultatsPodium";

const resultats: Resultats = {
  session_id: "s1",
  statut: "cloturee",
  total_participants: 94,
  total_eligibles: 312,
  taux_participation: 30.1,
  seuil_victoire_requis: 25,
  seuil_victoire_atteint: true,
  resultats: [
    { option_id: "o1", label: "Riadh Bchini", nombre_voix: 38, pct: 40.4, candidats: [] },
    { option_id: "o2", label: "Sana Werfelli", nombre_voix: 29, pct: 30.9, candidats: [] },
    { option_id: "o3", label: "Hamza Meddeb", nombre_voix: 27, pct: 28.7, candidats: [] },
  ],
};

describe("ResultatsPodium", () => {
  it("met en avant le premier rang comme gagnant", () => {
    renderWithProviders(<ResultatsPodium resultats={resultats} />);
    expect(screen.getByText("Riadh Bchini")).toBeInTheDocument();
    expect(screen.getByText("★ resultats.elu", { exact: false })).toBeInTheDocument();
  });

  it("affiche le taux de participation et l'état de la quote de victoire", () => {
    renderWithProviders(<ResultatsPodium resultats={resultats} />);
    expect(screen.getByText("resultats.quote_atteint", { exact: false })).toBeInTheDocument();
  });

  // --- Seuil de victoire (2026-09-25, renommage + changement de sémantique : remplace
  // l'ancien "quorum" de participation — voir docstring de tête de ResultatsPodium.tsx) ---

  it("signale une quote non atteinte et retire le badge Élu de toutes les options", () => {
    renderWithProviders(
      <ResultatsPodium resultats={{ ...resultats, seuil_victoire_atteint: false }} />,
    );
    expect(screen.getByText("resultats.quote_non_atteint", { exact: false })).toBeInTheDocument();
    // Aucune option n'est marquée "Élu(e)" quand la quote requise n'est pas atteinte, même
    // celle en tête du classement — voir estGagnant dans ResultatsPodium.tsx.
    expect(screen.queryByText("resultats.elu", { exact: false })).not.toBeInTheDocument();
    expect(screen.getByText("resultats.non_decide", { exact: false })).toBeInTheDocument();
  });

  it("n'affiche aucune mention de quote quand aucun seuil n'est configuré", () => {
    renderWithProviders(
      <ResultatsPodium resultats={{ ...resultats, seuil_victoire_requis: null }} />,
    );
    expect(screen.getByText("resultats.pas_de_quote", { exact: false })).toBeInTheDocument();
    expect(screen.getByText("★ resultats.elu", { exact: false })).toBeInTheDocument();
  });

  it("affiche la composition d'une liste gagnante", () => {
    renderWithProviders(
      <ResultatsPodium
        resultats={{
          ...resultats,
          resultats: [
            {
              option_id: "o1",
              label: "Liste Renouveau",
              nombre_voix: 38,
              pct: 40.4,
              candidats: ["Khaled Test", "Abir Test"],
            },
          ],
        }}
      />,
    );
    expect(screen.getByText("Khaled Test, Abir Test", { exact: false })).toBeInTheDocument();
  });

  it("marque toutes les options à égalité comme gagnantes (régression : Liste2 seule élue à tort alors que Liste1 avait le même nombre de voix)", () => {
    const egalite: Resultats = {
      ...resultats,
      resultats: [
        { option_id: "o2", label: "Liste2", nombre_voix: 1, pct: 100, candidats: [] },
        { option_id: "o1", label: "Liste1", nombre_voix: 1, pct: 100, candidats: [] },
        { option_id: "o3", label: "Liste3", nombre_voix: 0, pct: 0, candidats: [] },
      ],
    };
    renderWithProviders(<ResultatsPodium resultats={egalite} />);

    const liste1 = screen.getByText("Liste1").closest("div.rounded-cid");
    const liste2 = screen.getByText("Liste2").closest("div.rounded-cid");
    const liste3 = screen.getByText("Liste3").closest("div.rounded-cid");
    expect(liste1).toHaveTextContent("resultats.elu");
    expect(liste2).toHaveTextContent("resultats.elu");
    expect(liste3).not.toHaveTextContent("resultats.elu");
    expect(screen.getByText("resultats.egalite", { exact: false })).toBeInTheDocument();
  });

  it("n'affiche pas la mention d'égalité quand un seul gagnant se dégage", () => {
    renderWithProviders(<ResultatsPodium resultats={resultats} />);
    expect(screen.queryByText("resultats.egalite", { exact: false })).not.toBeInTheDocument();
  });
});
