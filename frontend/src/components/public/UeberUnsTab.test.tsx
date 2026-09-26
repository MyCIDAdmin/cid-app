import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { renderWithProviders } from "../../test/renderWithProviders";
import UeberUnsTab from "./UeberUnsTab";

describe("UeberUnsTab", () => {
  it("affiche l'historique, les kennzahlen du Club Africain, les valeurs et le contact", () => {
    renderWithProviders(<UeberUnsTab />);

    expect(screen.getByText("apropos.titre")).toBeInTheDocument();
    expect(screen.getByText("apropos.geschichte_titre")).toBeInTheDocument();
    expect(screen.getByText("apropos.club_titre")).toBeInTheDocument();

    // 3 kacheln chiffrées (14 titres / 13 coupes / 1 Ligue des champions CAF).
    expect(screen.getByText("apropos.kennzahl_meistertitel_valeur")).toBeInTheDocument();
    expect(screen.getByText("apropos.kennzahl_pokalsiege_valeur")).toBeInTheDocument();
    expect(screen.getByText("apropos.kennzahl_caf_valeur")).toBeInTheDocument();

    // 4 cartes de valeurs.
    expect(screen.getByText("apropos.wert_leidenschaft_titre")).toBeInTheDocument();
    expect(screen.getByText("apropos.wert_gemeinschaft_titre")).toBeInTheDocument();
    expect(screen.getByText("apropos.wert_kultur_titre")).toBeInTheDocument();
    expect(screen.getByText("apropos.wert_exzellenz_titre")).toBeInTheDocument();

    expect(screen.getByText("apropos.kontakt_titre")).toBeInTheDocument();
  });
});
