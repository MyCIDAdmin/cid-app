import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as hooks from "../../hooks/useProjets";
import { renderWithProviders } from "../../test/renderWithProviders";
import type { Projet } from "../../types/projets";
import ProjetArbeitsbereichPage from "./ProjetArbeitsbereichPage";

vi.mock("../../hooks/useProjets", async () => {
  const actual = await vi.importActual<typeof hooks>("../../hooks/useProjets");
  return {
    ...actual,
    useProjet: vi.fn(),
    useAufgaben: vi.fn(),
    useTeam: vi.fn(),
    useSichtbarkeitAendern: vi.fn(),
    useAufgabeVerschieben: vi.fn(),
    useArbeitsbereich: vi.fn(),
  };
});

const sichtbarkeitAendern = vi.fn();

function projet(overrides: Partial<Projet> = {}): Projet {
  return {
    id: "p1",
    titre: "Sommerfest",
    description_html: "",
    statut: "en_cours",
    sichtbarkeit: "entwurf",
    responsable: null,
    responsable_detail: null,
    cagnote_active: false,
    objectif_montant: null,
    montant_collecte: "0.00",
    nb_contributeurs: 0,
    date_limite: null,
    echeance_depassee: false,
    ordre: 0,
    images: [],
    est_gestionnaire: false,
    meine_rolle: "leitung",
    darf_arbeitsbereich: true,
    darf_team_verwalten: true,
    created_by: null,
    created_at: "2026-10-01T10:00:00Z",
    updated_at: "2026-10-01T10:00:00Z",
    ...overrides,
  };
}

function rendern(p: Projet) {
  vi.mocked(hooks.useProjet).mockReturnValue({
    data: p,
    isLoading: false,
    isError: false,
  } as unknown as ReturnType<typeof hooks.useProjet>);
  renderWithProviders(<ProjetArbeitsbereichPage />, {
    route: "/projets/p1/arbeitsbereich",
    path: "/projets/:id/arbeitsbereich",
  });
}

describe("ProjetArbeitsbereichPage", () => {
  beforeEach(() => {
    sichtbarkeitAendern.mockReset().mockResolvedValue(undefined);
    vi.mocked(hooks.useAufgaben).mockReturnValue({
      data: [
        {
          id: "a1",
          projet: "p1",
          titel: "Flyer drucken",
          beschreibung: "",
          verantwortlich: null,
          verantwortlich_detail: null,
          frist: null,
          prioritaet: "normal",
          status: "offen",
          ordre: 0,
          ueberfaellig: false,
          erledigt_am: null,
          kommentare_anzahl: 0,
          created_by: null,
          created_at: "2026-10-01T10:00:00Z",
          updated_at: "2026-10-01T10:00:00Z",
        },
      ],
    } as unknown as ReturnType<typeof hooks.useAufgaben>);
    vi.mocked(hooks.useTeam).mockReturnValue({ data: [] } as unknown as ReturnType<
      typeof hooks.useTeam
    >);
    vi.mocked(hooks.useSichtbarkeitAendern).mockReturnValue({
      mutateAsync: sichtbarkeitAendern,
      isPending: false,
    } as unknown as ReturnType<typeof hooks.useSichtbarkeitAendern>);
    vi.mocked(hooks.useAufgabeVerschieben).mockReturnValue({
      mutate: vi.fn(),
    } as unknown as ReturnType<typeof hooks.useAufgabeVerschieben>);
    vi.mocked(hooks.useArbeitsbereich).mockReturnValue({
      data: undefined,
    } as unknown as ReturnType<typeof hooks.useArbeitsbereich>);
  });

  it("zeigt Außenstehenden nur den Hinweis, dass der Bereich intern ist", () => {
    rendern(projet({ darf_arbeitsbereich: false, meine_rolle: null }));
    expect(screen.getByText("arbeitsbereich.nur_team")).toBeInTheDocument();
    expect(screen.queryByText("Flyer drucken")).not.toBeInTheDocument();
  });

  it("zeigt dem Team das Board und bei Entwürfen den Hinweis", () => {
    rendern(projet());
    expect(screen.getByText("Sommerfest")).toBeInTheDocument();
    expect(screen.getByText("Flyer drucken")).toBeInTheDocument();
    expect(screen.getByText("arbeitsbereich.sichtbarkeit.hinweis_entwurf")).toBeInTheDocument();
  });

  it("lässt die Projektleitung veröffentlichen", () => {
    rendern(projet());
    fireEvent.click(screen.getByText("arbeitsbereich.sichtbarkeit.veroeffentlichen"));
    expect(sichtbarkeitAendern).toHaveBeenCalledWith({
      id: "p1",
      sichtbarkeit: "veroeffentlicht",
    });
  });

  it("bietet Beobachtern weder Veröffentlichen noch neue Aufgaben an", () => {
    rendern(projet({ meine_rolle: "beobachter", darf_team_verwalten: false }));
    expect(
      screen.queryByText("arbeitsbereich.sichtbarkeit.veroeffentlichen"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("arbeitsbereich.aufgaben.neu")).not.toBeInTheDocument();
  });

  it("öffnet den Dialog für eine neue Aufgabe", () => {
    rendern(projet({ sichtbarkeit: "veroeffentlicht" }));
    fireEvent.click(screen.getByText("arbeitsbereich.aufgaben.neu"));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(
      screen.queryByText("arbeitsbereich.sichtbarkeit.hinweis_entwurf"),
    ).not.toBeInTheDocument();
  });
});
