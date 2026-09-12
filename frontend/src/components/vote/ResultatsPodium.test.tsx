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
  quorum_requis: 25,
  quorum_atteint: true,
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

  it("affiche le taux de participation et l'état du quorum", () => {
    renderWithProviders(<ResultatsPodium resultats={resultats} />);
    expect(screen.getByText("resultats.quorum_atteint", { exact: false })).toBeInTheDocument();
  });

  it("signale un quorum non atteint", () => {
    renderWithProviders(
      <ResultatsPodium resultats={{ ...resultats, quorum_atteint: false }} />,
    );
    expect(screen.getByText("resultats.quorum_non_atteint", { exact: false })).toBeInTheDocument();
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
