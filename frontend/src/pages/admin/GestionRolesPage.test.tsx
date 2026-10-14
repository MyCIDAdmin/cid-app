import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "../../test/renderWithProviders";
import GestionRolesPage from "./GestionRolesPage";

vi.mock("../../components/rbac/AttributionRolesTab", () => ({
  default: () => <div data-testid="tab-attribution" />,
}));
vi.mock("../../components/rbac/MatriceAccesTab", () => ({
  default: () => <div data-testid="tab-acces" />,
}));

vi.mock("../../components/aktivitaet/AktivitaetTab", () => ({
  default: ({ startAnsicht }: { startAnsicht?: string }) => (
    <div data-testid="tab-aktivitaet" data-ansicht={startAnsicht} />
  ),
}));

describe("GestionRolesPage", () => {
  it("affiche l'onglet Zuweisung par défaut", () => {
    renderWithProviders(<GestionRolesPage />);

    expect(screen.getByTestId("tab-attribution")).toBeInTheDocument();
    expect(screen.queryByTestId("tab-acces")).not.toBeInTheDocument();
  });

  it("bascule vers l'onglet Zugriff au clic", () => {
    renderWithProviders(<GestionRolesPage />);

    fireEvent.click(screen.getByText("onglets.acces"));

    expect(screen.getByTestId("tab-acces")).toBeInTheDocument();
    expect(screen.queryByTestId("tab-attribution")).not.toBeInTheDocument();
  });

  it("revient à l'onglet Zuweisung au clic", () => {
    renderWithProviders(<GestionRolesPage />);

    fireEvent.click(screen.getByText("onglets.acces"));
    fireEvent.click(screen.getByText("onglets.attribution"));

    expect(screen.getByTestId("tab-attribution")).toBeInTheDocument();
  });

  it("öffnet den Reiter Aktivität", () => {
    renderWithProviders(<GestionRolesPage />);

    fireEvent.click(screen.getByText("onglets.aktivitaet"));

    expect(screen.getByTestId("tab-aktivitaet")).toBeInTheDocument();
    expect(screen.queryByTestId("tab-attribution")).not.toBeInTheDocument();
  });

  it("öffnet über den Alarm-Link direkt die Auffälligkeiten", () => {
    renderWithProviders(<GestionRolesPage />, {
      route: "/admin/roles?tab=aktivitaet&ansicht=auffaelligkeiten",
      path: "/admin/roles",
    });

    expect(screen.getByTestId("tab-aktivitaet")).toHaveAttribute(
      "data-ansicht",
      "auffaelligkeiten",
    );
  });
});
