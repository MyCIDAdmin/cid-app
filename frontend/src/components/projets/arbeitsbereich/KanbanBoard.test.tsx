import { fireEvent, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as hooks from "../../../hooks/useProjets";
import { renderWithProviders } from "../../../test/renderWithProviders";
import type { Aufgabe, ProjetMitglied } from "../../../types/projets";
import KanbanBoard from "./KanbanBoard";

vi.mock("../../../hooks/useProjets", async () => {
  const actual = await vi.importActual<typeof hooks>("../../../hooks/useProjets");
  return { ...actual, useAufgabeVerschieben: vi.fn() };
});

const mutate = vi.fn();

function aufgabe(overrides: Partial<Aufgabe>): Aufgabe {
  return {
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
    ...overrides,
  };
}

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

const AUFGABEN = [
  aufgabe({ id: "a1", titel: "Flyer drucken", ordre: 0 }),
  aufgabe({
    id: "a2",
    titel: "Raum buchen",
    ordre: 1,
    verantwortlich: "m1",
    verantwortlich_detail: team[0].membre_detail,
    frist: "2026-10-01",
    ueberfaellig: true,
  }),
  aufgabe({ id: "a3", titel: "Plakat", status: "in_arbeit", ordre: 0 }),
];

function renderBoard(bearbeitbar = true) {
  const onOeffnen = vi.fn();
  const onNeu = vi.fn();
  renderWithProviders(
    <KanbanBoard
      aufgaben={AUFGABEN}
      team={team}
      bearbeitbar={bearbeitbar}
      onOeffnen={onOeffnen}
      onNeu={onNeu}
    />,
  );
  return { onOeffnen, onNeu };
}

describe("KanbanBoard", () => {
  beforeEach(() => {
    mutate.mockReset();
    vi.mocked(hooks.useAufgabeVerschieben).mockReturnValue({
      mutate,
    } as unknown as ReturnType<typeof hooks.useAufgabeVerschieben>);
  });

  it("verteilt die Aufgaben auf ihre Spalten und markiert Überfälliges", () => {
    renderBoard();
    const offen = screen.getByRole("region", { name: "arbeitsbereich.status.offen" });
    expect(within(offen).getByText("Flyer drucken")).toBeInTheDocument();
    expect(within(offen).getByText("Raum buchen")).toBeInTheDocument();
    const inArbeit = screen.getByRole("region", { name: "arbeitsbereich.status.in_arbeit" });
    expect(within(inArbeit).getByText("Plakat")).toBeInTheDocument();
    expect(screen.getByText("arbeitsbereich.aufgaben.ueberfaellig")).toBeInTheDocument();
  });

  it("öffnet eine Aufgabe und legt per Plus eine neue in der Spalte an", () => {
    const { onOeffnen, onNeu } = renderBoard();
    fireEvent.click(screen.getByText("Plakat"));
    expect(onOeffnen).toHaveBeenCalledWith(expect.objectContaining({ id: "a3" }));
    fireEvent.click(screen.getAllByLabelText("arbeitsbereich.aufgaben.neu_in")[1]);
    expect(onNeu).toHaveBeenCalledWith("in_arbeit");
  });

  it("verschiebt per Statusfeld ans Ende der Zielspalte", () => {
    renderBoard();
    fireEvent.change(screen.getAllByLabelText("arbeitsbereich.aufgaben.status_aendern")[0], {
      target: { value: "in_arbeit" },
    });
    expect(mutate).toHaveBeenCalledWith({ id: "a1", status: "in_arbeit", position: 1 });
  });

  it("verschiebt per Drag-and-drop vor eine andere Aufgabe", () => {
    renderBoard();
    const karte = screen.getByText("Plakat").closest("article") as HTMLElement;
    fireEvent.dragStart(karte);
    const ziel = screen.getByText("Flyer drucken").closest("article") as HTMLElement;
    fireEvent.drop(ziel);
    expect(mutate).toHaveBeenCalledWith({ id: "a3", status: "offen", position: 0 });
  });

  it("hängt beim Ablegen auf die leere Fläche hinten an", () => {
    renderBoard();
    fireEvent.dragStart(screen.getByText("Flyer drucken").closest("article") as HTMLElement);
    fireEvent.drop(screen.getByRole("region", { name: "arbeitsbereich.status.erledigt" }));
    expect(mutate).toHaveBeenCalledWith({ id: "a1", status: "erledigt", position: 0 });
  });

  it("filtert nach Verantwortlichen und wechselt in die Listenansicht", () => {
    renderBoard();
    fireEvent.change(screen.getByLabelText("arbeitsbereich.aufgaben.filter_verantwortlich"), {
      target: { value: "m1" },
    });
    expect(screen.getByText("Raum buchen")).toBeInTheDocument();
    expect(screen.queryByText("Flyer drucken")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("arbeitsbereich.aufgaben.ansicht_liste"));
    expect(screen.getByText("Raum buchen")).toBeInTheDocument();
  });

  it("ist für Beobachter schreibgeschützt", () => {
    renderBoard(false);
    expect(screen.queryByText("arbeitsbereich.aufgaben.neu")).not.toBeInTheDocument();
    expect(screen.queryAllByLabelText("arbeitsbereich.aufgaben.neu_in")).toHaveLength(0);
    expect(screen.getAllByLabelText("arbeitsbereich.aufgaben.status_aendern")[0]).toBeDisabled();
    fireEvent.dragStart(screen.getByText("Plakat").closest("article") as HTMLElement);
    fireEvent.drop(screen.getByRole("region", { name: "arbeitsbereich.status.offen" }));
    expect(mutate).not.toHaveBeenCalled();
  });
});
