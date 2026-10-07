import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useAuthStore } from "../../store/authStore";
import { renderWithProviders } from "../../test/renderWithProviders";
import MembresPage from "./MembresPage";

vi.mock("./MembresListPage", () => ({ default: () => <div data-testid="liste-stub" /> }));
vi.mock("../../components/membres/MembreReportingTab", () => ({
  default: () => <div data-testid="reporting-stub" />,
}));

function setzeRolle(role: "membre" | "rh") {
  useAuthStore.setState({
    accessToken: "a",
    refreshToken: "r",
    isAuthenticated: true,
    user: { id: "u", email: "u@example.com", role, langue_preferee: "de" },
  });
}

describe("MembresPage", () => {
  beforeEach(() => setzeRolle("rh"));

  it("zeigt ab RH das Verzeichnis und einen Reporting-Tab", () => {
    renderWithProviders(<MembresPage />, { route: "/membres", path: "/membres" });
    expect(screen.getByTestId("liste-stub")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "tab_reporting" })).toBeInTheDocument();
  });

  it("wechselt per Klick zum Reporting", () => {
    renderWithProviders(<MembresPage />, { route: "/membres", path: "/membres" });
    fireEvent.click(screen.getByRole("tab", { name: "tab_reporting" }));
    expect(screen.getByTestId("reporting-stub")).toBeInTheDocument();
    expect(screen.queryByTestId("liste-stub")).not.toBeInTheDocument();
  });

  it("öffnet das Reporting direkt über ?tab=reporting", () => {
    renderWithProviders(<MembresPage />, {
      route: "/membres?tab=reporting",
      path: "/membres",
    });
    expect(screen.getByTestId("reporting-stub")).toBeInTheDocument();
  });

  it("zeigt Mitgliedern ohne RH-Rolle nur das Verzeichnis ohne Tabs", () => {
    setzeRolle("membre");
    renderWithProviders(<MembresPage />, {
      route: "/membres?tab=reporting",
      path: "/membres",
    });
    expect(screen.getByTestId("liste-stub")).toBeInTheDocument();
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
    expect(screen.queryByTestId("reporting-stub")).not.toBeInTheDocument();
  });
});
