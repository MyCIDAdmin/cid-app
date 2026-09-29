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

  // Régression du 2026-09-28 : les logos étaient absents du rendu malgré leur envoi par
  // l'utilisateur — voir docstring de tête UeberUnsTab.tsx.
  it("affiche les logos CID et Club Africain", () => {
    renderWithProviders(<UeberUnsTab />);

    expect(screen.getByAltText("Clubistes in Deutschland")).toHaveAttribute(
      "src",
      "/brand/logo-cid-about.png",
    );
    expect(screen.getByAltText("Club Africain")).toHaveAttribute(
      "src",
      "/brand/logo-club-africain.png",
    );
  });

  // Régression du 2026-09-28 (retour utilisateur suivant l'ajout des logos ci-dessus) : le "×"
  // placé entre les deux logos a été retiré — ils gardent leur espacement (gap) sans séparateur.
  it("n'affiche plus le séparateur '×' entre les deux logos", () => {
    renderWithProviders(<UeberUnsTab />);

    expect(screen.queryByText("×")).not.toBeInTheDocument();
  });
});
