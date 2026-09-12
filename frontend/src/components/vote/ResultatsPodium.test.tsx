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
    { option_id: "o1", label: "Riadh Bchini", nombre_voix: 38, pct: 40.4 },
    { option_id: "o2", label: "Sana Werfelli", nombre_voix: 29, pct: 30.9 },
    { option_id: "o3", label: "Hamza Meddeb", nombre_voix: 27, pct: 28.7 },
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
});
