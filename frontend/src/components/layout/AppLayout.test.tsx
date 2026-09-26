/**
 * Footer applicatif (décision utilisateur du 2026-09-26, "Auch in der eingeloggten App" — voir
 * plan "Öffentliche mycid.org-Startseite" section B) : le reste d'AppLayout (Sidebar, tiroir
 * mobile, cloche de notifications...) est déjà couvert par ses propres tests dédiés, donc ces
 * enfants sont ici remplacés par de simples stubs pour isoler la seule logique ajoutée —
 * l'affichage conditionnel de PublicFooter selon le groupe Sidebar de la route courante.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import AppLayout from "./AppLayout";

vi.mock("./Sidebar", async () => {
  const actual = await vi.importActual<typeof import("./Sidebar")>("./Sidebar");
  return { ...actual, default: () => <div data-testid="sidebar-stub" /> };
});
vi.mock("./MobileNavDrawer", () => ({ default: () => <div data-testid="mobile-drawer-stub" /> }));
vi.mock("./NotificationBell", () => ({ default: () => <div data-testid="bell-stub" /> }));
vi.mock("./LanguageSwitcher", () => ({ default: () => <div data-testid="lang-stub" /> }));
vi.mock("./ThemeToggle", () => ({ default: () => <div data-testid="theme-stub" /> }));
vi.mock("../public/PublicFooter", () => ({
  default: () => <div data-testid="public-footer-stub" />,
}));

function renderAvecRoute(pathname: string) {
  return render(
    <MemoryRouter initialEntries={[pathname]}>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path={pathname} element={<div data-testid="page-content" />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe("AppLayout — footer applicatif", () => {
  it("affiche le footer sur une page du groupe general (/dashboard)", () => {
    renderAvecRoute("/dashboard");
    expect(screen.getByTestId("page-content")).toBeInTheDocument();
    expect(screen.getByTestId("public-footer-stub")).toBeInTheDocument();
  });

  it("affiche le footer sur une page du groupe communaute (/fil)", () => {
    renderAvecRoute("/fil");
    expect(screen.getByTestId("public-footer-stub")).toBeInTheDocument();
  });

  it("affiche le footer sur une page du groupe contenu (/albums)", () => {
    renderAvecRoute("/albums");
    expect(screen.getByTestId("public-footer-stub")).toBeInTheDocument();
  });

  it("n'affiche PAS le footer sur une page du groupe administration (/admin/boutique)", () => {
    renderAvecRoute("/admin/boutique");
    expect(screen.queryByTestId("public-footer-stub")).not.toBeInTheDocument();
  });

  it("n'affiche pas le footer sur une page sans item Sidebar correspondant", () => {
    renderAvecRoute("/route-inconnue");
    expect(screen.queryByTestId("public-footer-stub")).not.toBeInTheDocument();
  });

  it("affiche un lien vers l'accueil portant le logo CID", () => {
    renderAvecRoute("/dashboard");
    const lien = screen.getByLabelText("action.accueil");
    expect(lien).toHaveAttribute("href", "/");
  });
});
