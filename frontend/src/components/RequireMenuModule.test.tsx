import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "../test/renderWithProviders";
import * as rbacApi from "../api/rbac";
import { useAuthStore } from "../store/authStore";
import RequireMenuModule from "./RequireMenuModule";

// useModuleOuvert appelle useVisibiliteEffective dans le même module : on simule donc la COUCHE
// API (GET /rbac/visibilite-membre/effective/) plutôt que le hook.
vi.mock("../api/rbac", async () => {
  const actual = await vi.importActual<typeof rbacApi>("../api/rbac");
  return { ...actual, getVisibiliteEffective: vi.fn() };
});

function mockVisibilite(data: Record<string, boolean>) {
  vi.mocked(rbacApi.getVisibiliteEffective).mockResolvedValue(data);
}

function seConnecter(role: "membre" | "bureau_admin") {
  useAuthStore.setState({
    accessToken: "a",
    refreshToken: "r",
    isAuthenticated: true,
    user: { id: "u1", email: "m@example.de", role, langue_preferee: "de" },
  });
}

function rendre() {
  // Le fallback `route-fallback` de renderWithProviders sert de cible de redirection (/ziel).
  return renderWithProviders(
    <RequireMenuModule cle="forum" redirectTo="/ziel">
      <div>forum-inhalt</div>
    </RequireMenuModule>,
  );
}

describe("RequireMenuModule (Sichtbarkeit pro Modul, 2026-10-11)", () => {
  beforeEach(() => {
    seConnecter("membre");
  });

  it("laisse passer quand le module est sichtbar", async () => {
    mockVisibilite({ forum: true });
    rendre();
    expect(await screen.findByText("forum-inhalt")).toBeInTheDocument();
  });

  it("renvoie vers la Startseite quand le module est gesperrt (Nicht-Mitglied, Adresse von Hand)", async () => {
    mockVisibilite({ forum: false });
    rendre();
    expect(await screen.findByTestId("route-fallback")).toBeInTheDocument();
    expect(screen.queryByText("forum-inhalt")).not.toBeInTheDocument();
  });

  it("zeigt nur den Ladehinweis und leitet nicht um, solange die Antwort fehlt", () => {
    vi.mocked(rbacApi.getVisibiliteEffective).mockReturnValue(new Promise(() => {}));
    rendre();
    expect(screen.queryByText("forum-inhalt")).not.toBeInTheDocument();
    expect(screen.queryByTestId("route-fallback")).not.toBeInTheDocument();
  });

  it("lässt eine höhere Rolle immer durch, auch wenn das Modul für Mitglieder gesperrt ist", () => {
    seConnecter("bureau_admin");
    mockVisibilite({ forum: false });
    rendre();
    expect(screen.getByText("forum-inhalt")).toBeInTheDocument();
  });
});
