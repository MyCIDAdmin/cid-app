import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as membresApi from "../../api/membres";
import type { Membre } from "../../types/membre";
import { renderWithProviders } from "../../test/renderWithProviders";
import DatenBestaetigung from "./DatenBestaetigung";

vi.mock("../../api/membres");

const MEMBRE = {
  prenom: "Ahmed",
  nom: "Test",
  date_naissance: "1990-05-17",
  email: "ahmed@example.de",
  telephone: "+49 170 1234567",
  pays: "DE",
  adresse_de: "Musterstraße 5",
  code_postal_de: "10115",
  ville_de: "Berlin",
} as Membre;

describe("DatenBestaetigung", () => {
  beforeEach(() => {
    vi.mocked(membresApi.getMembreMoi).mockResolvedValue(MEMBRE);
  });

  it("zeigt die Daten aus dem Profil und meldet das Häkchen", async () => {
    const aendern = vi.fn();
    renderWithProviders(<DatenBestaetigung bestaetigt={false} onAendern={aendern} />);

    expect(await screen.findByText("Ahmed Test")).toBeInTheDocument();
    expect(screen.getByText("ahmed@example.de")).toBeInTheDocument();
    expect(screen.getByText("+49 170 1234567")).toBeInTheDocument();
    expect(screen.getByText("Musterstraße 5, 10115 Berlin")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("checkbox"));
    expect(aendern).toHaveBeenCalledWith(true);
  });

  it("verlinkt zum Profil, um Daten zu ändern", async () => {
    renderWithProviders(<DatenBestaetigung bestaetigt={false} onAendern={() => {}} />);
    const link = await screen.findByRole("link");
    expect(link).toHaveAttribute("href", "/mon-profil");
  });
});
