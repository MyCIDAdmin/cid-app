import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as faehig from "../../../hooks/useFaehigkeiten";
import * as hooks from "../../../hooks/useProjets";
import { renderWithProviders } from "../../../test/renderWithProviders";
import type { ProjetBewerbung, ProjetStelle } from "../../../types/projets";
import StellenTab from "./StellenTab";

vi.mock("../../../hooks/useFaehigkeiten", async () => {
  const actual = await vi.importActual<typeof faehig>("../../../hooks/useFaehigkeiten");
  return { ...actual, useFaehigkeitenKatalog: vi.fn() };
});
vi.mock("../../../hooks/useProjets", async () => {
  const actual = await vi.importActual<typeof hooks>("../../../hooks/useProjets");
  return {
    ...actual,
    useStellen: vi.fn(),
    useStelleErstellen: vi.fn(),
    useStelleAendern: vi.fn(),
    useStelleLoeschen: vi.fn(),
    useBewerbungen: vi.fn(),
    usePassendeMitglieder: vi.fn(),
    useBewerbungEntscheiden: vi.fn(),
  };
});

const erstellen = vi.fn();
const entscheiden = vi.fn();
const aendern = vi.fn();

const STELLE = {
  id: "s1",
  projet: "p1",
  titel: "Web-Designer",
  beschreibung: "",
  faehigkeit: null,
  faehigkeit_name: null,
  anzahl: 1,
  status: "offen",
  angenommen: 0,
  freie_plaetze: 1,
  meine_bewerbung: null,
  bewerbungen_offen: 1,
  created_at: "2026-10-01T10:00:00Z",
} as unknown as ProjetStelle;

const BEWERBUNG = {
  id: "b1",
  stelle: "s1",
  membre: "m1",
  membre_detail: { id: "m1", prenom: "Amel", nom: "Ben", photo: null },
  nachricht: "Gern!",
  status: "offen",
} as unknown as ProjetBewerbung;

function mut(fn: ReturnType<typeof vi.fn>) {
  return { mutate: fn, mutateAsync: fn, isPending: false };
}

describe("StellenTab", () => {
  beforeEach(() => {
    erstellen.mockReset();
    entscheiden.mockReset();
    aendern.mockReset();
    vi.mocked(faehig.useFaehigkeitenKatalog).mockReturnValue({
      data: [],
    } as unknown as ReturnType<typeof faehig.useFaehigkeitenKatalog>);
    vi.mocked(hooks.useStellen).mockReturnValue({
      data: [STELLE],
    } as unknown as ReturnType<typeof hooks.useStellen>);
    vi.mocked(hooks.useStelleErstellen).mockReturnValue(
      mut(erstellen) as unknown as ReturnType<typeof hooks.useStelleErstellen>,
    );
    vi.mocked(hooks.useStelleAendern).mockReturnValue(
      mut(aendern) as unknown as ReturnType<typeof hooks.useStelleAendern>,
    );
    vi.mocked(hooks.useStelleLoeschen).mockReturnValue(
      mut(vi.fn()) as unknown as ReturnType<typeof hooks.useStelleLoeschen>,
    );
    vi.mocked(hooks.useBewerbungen).mockReturnValue({
      data: [BEWERBUNG],
    } as unknown as ReturnType<typeof hooks.useBewerbungen>);
    vi.mocked(hooks.usePassendeMitglieder).mockReturnValue({
      data: [],
    } as unknown as ReturnType<typeof hooks.usePassendeMitglieder>);
    vi.mocked(hooks.useBewerbungEntscheiden).mockReturnValue(
      mut(entscheiden) as unknown as ReturnType<typeof hooks.useBewerbungEntscheiden>,
    );
  });

  it("legt eine Stelle an (nur Verwaltung)", () => {
    renderWithProviders(<StellenTab projetId="p1" verwalten />);
    fireEvent.change(screen.getByLabelText("stellen.titel_label"), {
      target: { value: "Logistik-Experte" },
    });
    fireEvent.click(screen.getByRole("button", { name: "stellen.anlegen" }));
    expect(erstellen).toHaveBeenCalledWith(
      expect.objectContaining({ projet: "p1", titel: "Logistik-Experte", anzahl: 1 }),
      expect.any(Object),
    );
  });

  it("nimmt eine Meldung an", () => {
    renderWithProviders(<StellenTab projetId="p1" verwalten />);
    fireEvent.click(screen.getByRole("button", { name: "stellen.annehmen" }));
    expect(entscheiden).toHaveBeenCalledWith({ id: "b1", entscheidung: "annehmen" });
  });

  it("zeigt Nicht-Verwaltern kein Formular und keine Aktionen", () => {
    renderWithProviders(<StellenTab projetId="p1" verwalten={false} />);
    expect(screen.queryByLabelText("stellen.titel_label")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "stellen.schliessen" })).not.toBeInTheDocument();
    expect(screen.getByText("stellen.nur_lesen")).toBeInTheDocument();
  });
});
