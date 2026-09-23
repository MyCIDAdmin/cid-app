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
});
