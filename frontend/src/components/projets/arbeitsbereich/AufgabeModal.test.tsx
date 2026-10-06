import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as hooks from "../../../hooks/useProjets";
import { renderWithProviders } from "../../../test/renderWithProviders";
import type { ProjetMitglied } from "../../../types/projets";
import AufgabeModal from "./AufgabeModal";

vi.mock("../../../hooks/useProjets", async () => {
  const actual = await vi.importActual<typeof hooks>("../../../hooks/useProjets");
  return {
    ...actual,
    useAufgabeErstellen: vi.fn(),
    useAufgabeAendern: vi.fn(),
    useAufgabeLoeschen: vi.fn(),
    useKommentare: vi.fn(),
    useKommentarErstellen: vi.fn(),
    useKommentarLoeschen: vi.fn(),
  };
});

const erstellen = vi.fn();
const team: ProjetMitglied[] = [
  {
    id: "t1",
    projet: "p1",
    membre: "m1",
    membre_detail: { id: "m1", prenom: "Amel", nom: "Ben", photo: null },
    rolle: "mitarbeit",
    created_at: "2026-10-01T10:00:00Z",
  },
];

function mock<T>(value: unknown): T {
  return value as T;
}

describe("AufgabeModal", () => {
  beforeEach(() => {
    erstellen.mockReset().mockResolvedValue({});
    vi.mocked(hooks.useAufgabeErstellen).mockReturnValue(
      mock({ mutateAsync: erstellen, isPending: false }),
    );
    vi.mocked(hooks.useAufgabeAendern).mockReturnValue(
      mock({ mutateAsync: vi.fn(), isPending: false }),
    );
    vi.mocked(hooks.useAufgabeLoeschen).mockReturnValue(mock({ mutateAsync: vi.fn() }));
    vi.mocked(hooks.useKommentare).mockReturnValue(mock({ data: [] }));
    vi.mocked(hooks.useKommentarErstellen).mockReturnValue(
      mock({ mutateAsync: vi.fn(), isPending: false }),
    );
    vi.mocked(hooks.useKommentarLoeschen).mockReturnValue(mock({ mutate: vi.fn() }));
  });

  it("erstellt eine Aufgabe in der gewählten Spalte mit Verantwortlichem aus dem Team", async () => {
    const onClose = vi.fn();
    renderWithProviders(
      <AufgabeModal
        projetId="p1"
        aufgabe={null}
        startStatus="review"
        team={team}
        bearbeitbar
        kannLoeschen={false}
        onClose={onClose}
      />,
    );
    fireEvent.change(screen.getByLabelText("arbeitsbereich.modal.titel"), {
      target: { value: "Plakate hängen" },
    });
    fireEvent.change(screen.getByLabelText("arbeitsbereich.modal.verantwortlich"), {
      target: { value: "m1" },
    });
    fireEvent.click(screen.getByText("arbeitsbereich.modal.speichern"));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(erstellen).toHaveBeenCalledWith(
      expect.objectContaining({
        projet: "p1",
        titel: "Plakate hängen",
        verantwortlich: "m1",
        status: "review",
        frist: null,
      }),
    );
  });

  it("blendet Speichern und Löschen für Beobachter aus", () => {
    renderWithProviders(
      <AufgabeModal
        projetId="p1"
        aufgabe={null}
        startStatus="offen"
        team={team}
        bearbeitbar={false}
        kannLoeschen={false}
        onClose={vi.fn()}
      />,
    );
    expect(screen.queryByText("arbeitsbereich.modal.speichern")).not.toBeInTheDocument();
    expect(screen.queryByText("arbeitsbereich.modal.loeschen")).not.toBeInTheDocument();
  });
});
