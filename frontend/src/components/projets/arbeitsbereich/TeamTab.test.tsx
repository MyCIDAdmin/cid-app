import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as hooks from "../../../hooks/useProjets";
import { renderWithProviders } from "../../../test/renderWithProviders";
import type { ProjetMitglied } from "../../../types/projets";
import TeamTab from "./TeamTab";

vi.mock("../../../hooks/useProjets", async () => {
  const actual = await vi.importActual<typeof hooks>("../../../hooks/useProjets");
  return {
    ...actual,
    useTeam: vi.fn(),
    useTeamHinzufuegen: vi.fn(),
    useTeamRolleAendern: vi.fn(),
    useTeamEntfernen: vi.fn(),
  };
});

// La recherche de membres appelle l'API : remplacée par un composant inerte.
vi.mock("../../membres/MembreSearchPicker", () => ({ default: () => <div>picker</div> }));

const entfernen = vi.fn();
const rolleAendern = vi.fn();

const MITGLIEDER: ProjetMitglied[] = [
  {
    id: "t1",
    projet: "p1",
    membre: "m1",
    membre_detail: { id: "m1", prenom: "Amel", nom: "Ben", photo: null },
    rolle: "leitung",
    created_at: "2026-10-01T10:00:00Z",
  },
  {
    id: "t2",
    projet: "p1",
    membre: "m2",
    membre_detail: { id: "m2", prenom: "Karim", nom: "Said", photo: null },
    rolle: "beobachter",
    created_at: "2026-10-02T10:00:00Z",
  },
];

describe("TeamTab", () => {
  beforeEach(() => {
    entfernen.mockReset().mockResolvedValue(undefined);
    rolleAendern.mockReset().mockResolvedValue(undefined);
    vi.mocked(hooks.useTeam).mockReturnValue({
      data: MITGLIEDER,
    } as unknown as ReturnType<typeof hooks.useTeam>);
    vi.mocked(hooks.useTeamHinzufuegen).mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    } as unknown as ReturnType<typeof hooks.useTeamHinzufuegen>);
    vi.mocked(hooks.useTeamRolleAendern).mockReturnValue({
      mutateAsync: rolleAendern,
    } as unknown as ReturnType<typeof hooks.useTeamRolleAendern>);
    vi.mocked(hooks.useTeamEntfernen).mockReturnValue({
      mutateAsync: entfernen,
    } as unknown as ReturnType<typeof hooks.useTeamEntfernen>);
  });

  it("zeigt Mitglieder und erlaubt der Projektleitung, Rolle zu ändern und zu entfernen", () => {
    renderWithProviders(<TeamTab projetId="p1" verwalten />);
    expect(screen.getByText("Amel Ben")).toBeInTheDocument();
    fireEvent.change(screen.getAllByLabelText("arbeitsbereich.team.rolle_von")[1], {
      target: { value: "mitarbeit" },
    });
    expect(rolleAendern).toHaveBeenCalledWith({ id: "t2", rolle: "mitarbeit" });
    fireEvent.click(screen.getAllByText("arbeitsbereich.team.entfernen")[1]);
    expect(entfernen).toHaveBeenCalledWith("t2");
    expect(screen.getByText("picker")).toBeInTheDocument();
  });

  it("ist ohne Verwaltungsrecht schreibgeschützt", () => {
    renderWithProviders(<TeamTab projetId="p1" verwalten={false} />);
    expect(screen.getByText("arbeitsbereich.team.nur_lesen")).toBeInTheDocument();
    expect(screen.queryByText("arbeitsbereich.team.entfernen")).not.toBeInTheDocument();
    expect(screen.queryByText("picker")).not.toBeInTheDocument();
    expect(screen.getAllByLabelText("arbeitsbereich.team.rolle_von")[0]).toBeDisabled();
  });
});
