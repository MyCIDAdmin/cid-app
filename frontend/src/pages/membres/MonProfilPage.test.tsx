import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "../../test/renderWithProviders";
import MonProfilPage from "./MonProfilPage";

vi.mock("./MembreFormPage", () => ({ default: () => <div>PROFIL-FORMULAR</div> }));
vi.mock("../../components/profil/EinstellungenTab", () => ({
  default: () => <div>EINSTELLUNGEN-INHALT</div>,
}));

describe("MonProfilPage", () => {
  it("zeigt standardmäßig den Profil-Tab", () => {
    renderWithProviders(<MonProfilPage />, { route: "/mon-profil", path: "/mon-profil" });
    expect(screen.getByText("PROFIL-FORMULAR")).toBeInTheDocument();
    expect(screen.queryByText("EINSTELLUNGEN-INHALT")).not.toBeInTheDocument();
  });

  it("öffnet den Einstellungen-Tab über ?onglet=einstellungen", () => {
    renderWithProviders(<MonProfilPage />, {
      route: "/mon-profil?onglet=einstellungen",
      path: "/mon-profil",
    });
    expect(screen.getByText("EINSTELLUNGEN-INHALT")).toBeInTheDocument();
  });

  it("wechselt per Klick zwischen den Tabs", () => {
    renderWithProviders(<MonProfilPage />, { route: "/mon-profil", path: "/mon-profil" });
    fireEvent.click(screen.getByRole("tab", { name: "mon_profil.onglet_einstellungen" }));
    expect(screen.getByText("EINSTELLUNGEN-INHALT")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "mon_profil.onglet_profil" }));
    expect(screen.getByText("PROFIL-FORMULAR")).toBeInTheDocument();
  });
});
