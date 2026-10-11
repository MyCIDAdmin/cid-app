import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "../../test/renderWithProviders";
import * as useRbacHooks from "../../hooks/useRbac";
import type { VisibiliteModuleLigne } from "../../types/rbac";
import VisibiliteModulesTab from "./VisibiliteModulesTab";

vi.mock("../../hooks/useRbac", async () => {
  const actual = await vi.importActual<typeof useRbacHooks>("../../hooks/useRbac");
  return { ...actual, useVisibiliteModules: vi.fn(), useSetVisibiliteModule: vi.fn() };
});

const mutate = vi.fn();

function ligne(module: string, menu_groupe: VisibiliteModuleLigne["menu_groupe"]) {
  return { module, menu_groupe, visible: true, visible_non_membre: false };
}

beforeEach(() => {
  mutate.mockClear();
  vi.mocked(useRbacHooks.useSetVisibiliteModule).mockReturnValue({
    mutate,
    isPending: false,
  } as unknown as ReturnType<typeof useRbacHooks.useSetVisibiliteModule>);
  vi.mocked(useRbacHooks.useVisibiliteModules).mockReturnValue({
    data: [
      ligne("evenements", "general"),
      ligne("fil", "communaute"),
      ligne("forum", "communaute"),
      ligne("messagerie", "communaute"),
      ligne("quiz", "contenu"),
    ],
    isLoading: false,
    isError: false,
  } as unknown as ReturnType<typeof useRbacHooks.useVisibiliteModules>);
});

describe("VisibiliteModulesTab (jedes Modul einzeln, 2026-10-11)", () => {
  it("zeigt jede Menü-Zeile einzeln unter den Überschriften der Sidebar-Gruppen", () => {
    renderWithProviders(<VisibiliteModulesTab />);

    expect(screen.getByText("visibilite.groupes.general")).toBeInTheDocument();
    expect(screen.getByText("visibilite.groupes.communaute")).toBeInTheDocument();
    expect(screen.getByText("visibilite.groupes.contenu")).toBeInTheDocument();
    // Die Gemeinschaft ist nicht mehr eine einzige Zeile, sondern eine Zeile pro Eintrag.
    for (const modul of ["fil", "forum", "messagerie", "quiz"]) {
      expect(screen.getByText(modul)).toBeInTheDocument();
    }
    expect(screen.queryByText("communaute")).not.toBeInTheDocument();
  });

  it("speichert die Nicht-Mitglied-Spalte nur für die angeklickte Zeile", () => {
    renderWithProviders(<VisibiliteModulesTab />);

    fireEvent.click(screen.getByLabelText("forum visibilite.non_membre"));

    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate.mock.calls[0][0]).toEqual({
      module: "forum",
      visible: true,
      groupe: "non_membre",
    });
  });

  it("blendet eine Gruppe ohne Zeilen aus", () => {
    vi.mocked(useRbacHooks.useVisibiliteModules).mockReturnValue({
      data: [ligne("evenements", "general")],
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useRbacHooks.useVisibiliteModules>);
    renderWithProviders(<VisibiliteModulesTab />);

    expect(screen.queryByText("visibilite.groupes.communaute")).not.toBeInTheDocument();
  });
});
