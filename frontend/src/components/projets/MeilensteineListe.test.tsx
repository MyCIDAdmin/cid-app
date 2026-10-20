import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "../../test/renderWithProviders";
import * as useProjetsHooks from "../../hooks/useProjets";
import type { Meilenstein } from "../../types/projets";
import MeilensteineListe from "./MeilensteineListe";

vi.mock("../../hooks/useProjets", async () => {
  const actual = await vi.importActual<typeof useProjetsHooks>("../../hooks/useProjets");
  return {
    ...actual,
    useCreerMeilenstein: vi.fn(),
    useModifierMeilenstein: vi.fn(),
    useSupprimerMeilenstein: vi.fn(),
  };
});

function mutationMock<T>(): T {
  return { mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false } as unknown as T;
}

function meilenstein(overrides: Partial<Meilenstein> = {}): Meilenstein {
  return {
    id: "m1",
    projet: "dach-1",
    projet_titel: "Sportplätze",
    titel: "Planung abgeschlossen",
    beschreibung: "",
    faellig_am: null,
    erledigt: false,
    erledigt_am: null,
    ueberfaellig: false,
    ordre: 0,
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function mocks() {
  const erstellen = mutationMock<ReturnType<typeof useProjetsHooks.useCreerMeilenstein>>();
  const aendern = mutationMock<ReturnType<typeof useProjetsHooks.useModifierMeilenstein>>();
  const loeschen = mutationMock<ReturnType<typeof useProjetsHooks.useSupprimerMeilenstein>>();
  vi.mocked(useProjetsHooks.useCreerMeilenstein).mockReturnValue(erstellen);
  vi.mocked(useProjetsHooks.useModifierMeilenstein).mockReturnValue(aendern);
  vi.mocked(useProjetsHooks.useSupprimerMeilenstein).mockReturnValue(loeschen);
  return { erstellen, aendern, loeschen };
}

describe("MeilensteineListe", () => {
  it("zeigt einen Hinweis, wenn es noch keine Meilensteine gibt", () => {
    mocks();
    renderWithProviders(
      <MeilensteineListe projetId="dach-1" meilensteine={[]} darfVerwalten={false} />,
    );

    expect(screen.getByText("dach.keine_meilensteine")).toBeInTheDocument();
  });

  it("zeigt Besuchern nur Lesedarstellung ohne Formular, Haken oder Löschen", () => {
    mocks();
    renderWithProviders(
      <MeilensteineListe
        projetId="dach-1"
        meilensteine={[meilenstein({ erledigt: true, erledigt_am: "2026-02-01" })]}
        darfVerwalten={false}
      />,
    );

    expect(screen.getByText("Planung abgeschlossen")).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("dach.meilenstein_titel")).not.toBeInTheDocument();
  });

  it("hakt einen Meilenstein ab", () => {
    const { aendern } = mocks();
    renderWithProviders(
      <MeilensteineListe projetId="dach-1" meilensteine={[meilenstein()]} darfVerwalten />,
    );

    fireEvent.click(screen.getByRole("checkbox"));

    expect(aendern.mutate).toHaveBeenCalledWith(
      { id: "m1", payload: { erledigt: true } },
      expect.anything(),
    );
  });

  it("legt einen Meilenstein mit Fälligkeitsdatum an", () => {
    const { erstellen } = mocks();
    renderWithProviders(<MeilensteineListe projetId="dach-1" meilensteine={[]} darfVerwalten />);

    fireEvent.change(screen.getByLabelText("dach.meilenstein_titel"), {
      target: { value: "Rohbau fertig" },
    });
    fireEvent.change(screen.getByLabelText("dach.meilenstein_datum"), {
      target: { value: "2027-06-30" },
    });
    fireEvent.click(screen.getByText("dach.hinzufuegen"));

    expect(erstellen.mutate).toHaveBeenCalledWith(
      { projet: "dach-1", titel: "Rohbau fertig", faellig_am: "2027-06-30" },
      expect.anything(),
    );
  });

  it("legt ohne Titel nichts an", () => {
    const { erstellen } = mocks();
    renderWithProviders(<MeilensteineListe projetId="dach-1" meilensteine={[]} darfVerwalten />);

    expect(screen.getByText("dach.hinzufuegen")).toBeDisabled();
    expect(erstellen.mutate).not.toHaveBeenCalled();
  });

  it("fragt vor dem Löschen nach", () => {
    const { loeschen } = mocks();
    renderWithProviders(
      <MeilensteineListe projetId="dach-1" meilensteine={[meilenstein()]} darfVerwalten />,
    );

    fireEvent.click(screen.getByLabelText("dach.loeschen_aria"));
    expect(loeschen.mutate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("action.confirmer"));

    expect(loeschen.mutate).toHaveBeenCalledWith("m1", expect.anything());
  });

  it("macht Meilensteine eines Teilprojekts nicht bearbeitbar und nennt das Teilprojekt", () => {
    mocks();
    renderWithProviders(
      <MeilensteineListe
        projetId="dach-1"
        meilensteine={[
          meilenstein({ id: "m2", projet: "kind-1", projet_titel: "Umkleidekabinen" }),
        ]}
        darfVerwalten
      />,
    );

    expect(screen.getByText("Umkleidekabinen")).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("dach.loeschen_aria")).not.toBeInTheDocument();
  });

  it("markiert überfällige Meilensteine", () => {
    mocks();
    renderWithProviders(
      <MeilensteineListe
        projetId="dach-1"
        meilensteine={[meilenstein({ faellig_am: "2020-01-01", ueberfaellig: true })]}
        darfVerwalten={false}
      />,
    );

    expect(screen.getByText(/dach\.ueberfaellig/)).toBeInTheDocument();
  });
});
