import { fireEvent, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as hooks from "../../hooks/useProjets";
import { useAuthStore } from "../../store/authStore";
import { renderWithProviders } from "../../test/renderWithProviders";
import type { ProjetStelle } from "../../types/projets";
import HilfeGesuchtPage from "./HilfeGesuchtPage";

vi.mock("../../hooks/useProjets", async () => {
  const actual = await vi.importActual<typeof hooks>("../../hooks/useProjets");
  return {
    ...actual,
    useOffeneStellen: vi.fn(),
    useFreieStellen: vi.fn(),
    useStelleBewerben: vi.fn(),
    useStelleZurueckziehen: vi.fn(),
    useStelleAendern: vi.fn(),
    useStelleLoeschen: vi.fn(),
    useStelleErstellen: vi.fn(),
    useBewerbungen: vi.fn(),
    useBewerbungEmpfehlen: vi.fn(),
    useBewerbungEntscheiden: vi.fn(),
    usePassendeMitglieder: vi.fn(),
  };
});
vi.mock("../../hooks/useFaehigkeiten", () => ({
  useFaehigkeitenKatalog: () => ({ data: [] }),
}));
vi.mock("../../hooks/useRegionen", () => ({
  useRegionen: () => ({ data: { ergebnisse: [] } }),
}));

const bewerben = vi.fn();
const empfehlen = vi.fn();
const entscheiden = vi.fn();

function stelle(overrides: Partial<ProjetStelle> = {}): ProjetStelle {
  return {
    id: "s1",
    projet: null,
    projet_titre: null,
    frei: true,
    titel: "Stand beim Heimspiel",
    beschreibung: "",
    faehigkeit: null,
    faehigkeit_name: null,
    anzahl: 2,
    status: "offen",
    art: "einmalig",
    termin: "2027-03-14",
    ort: "",
    frist: null,
    sichtbarkeit: "mitglieder",
    region: null,
    region_name: null,
    angenommen: 0,
    freie_plaetze: 2,
    meine_bewerbung: null,
    bewerbungen_offen: null,
    bewerbungen_empfohlen: null,
    kann_pflegen: false,
    ist_meine: false,
    created_at: "2026-11-01T10:00:00Z",
    ...overrides,
  } as ProjetStelle;
}

function liste(offene: ProjetStelle[], freie: ProjetStelle[] = offene) {
  vi.mocked(hooks.useOffeneStellen).mockReturnValue({
    data: offene,
    isLoading: false,
  } as unknown as ReturnType<typeof hooks.useOffeneStellen>);
  vi.mocked(hooks.useFreieStellen).mockReturnValue({
    data: freie,
    isLoading: false,
  } as unknown as ReturnType<typeof hooks.useFreieStellen>);
}

describe("HilfeGesuchtPage", () => {
  beforeEach(() => {
    bewerben.mockReset();
    empfehlen.mockReset();
    entscheiden.mockReset();
    const leer = { mutate: vi.fn(), isPending: false };
    vi.mocked(hooks.useStelleBewerben).mockReturnValue({
      mutate: bewerben,
      isPending: false,
    } as unknown as ReturnType<typeof hooks.useStelleBewerben>);
    vi.mocked(hooks.useStelleZurueckziehen).mockReturnValue(
      leer as unknown as ReturnType<typeof hooks.useStelleZurueckziehen>,
    );
    vi.mocked(hooks.useStelleAendern).mockReturnValue(
      leer as unknown as ReturnType<typeof hooks.useStelleAendern>,
    );
    vi.mocked(hooks.useStelleLoeschen).mockReturnValue(
      leer as unknown as ReturnType<typeof hooks.useStelleLoeschen>,
    );
    vi.mocked(hooks.useStelleErstellen).mockReturnValue(
      leer as unknown as ReturnType<typeof hooks.useStelleErstellen>,
    );
    vi.mocked(hooks.useBewerbungEmpfehlen).mockReturnValue({
      mutate: empfehlen,
      isPending: false,
    } as unknown as ReturnType<typeof hooks.useBewerbungEmpfehlen>);
    vi.mocked(hooks.useBewerbungEntscheiden).mockReturnValue({
      mutate: entscheiden,
      isPending: false,
    } as unknown as ReturnType<typeof hooks.useBewerbungEntscheiden>);
    vi.mocked(hooks.usePassendeMitglieder).mockReturnValue({
      data: [],
      isLoading: false,
    } as unknown as ReturnType<typeof hooks.usePassendeMitglieder>);
    useAuthStore.setState({
      isAuthenticated: true,
      user: { role: "membre" } as never,
    });
  });

  it("zeigt freie Gesuche und Projekt-Stellen gemeinsam und filtert nach Herkunft", () => {
    liste([stelle(), stelle({ id: "s2", titel: "Web-Designer", frei: false, projet: "p1" })]);
    renderWithProviders(<HilfeGesuchtPage />);
    expect(screen.getByText("Stand beim Heimspiel")).toBeInTheDocument();
    expect(screen.getByText("Web-Designer")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "hilfe.filter.herkunft_projekt" }));
    expect(screen.queryByText("Stand beim Heimspiel")).not.toBeInTheDocument();
    expect(screen.getByText("Web-Designer")).toBeInTheDocument();
  });

  it("filtert nach Art der Hilfe", () => {
    liste([stelle(), stelle({ id: "s2", titel: "Newsletter", art: "dauerhaft", termin: null })]);
    renderWithProviders(<HilfeGesuchtPage />);
    fireEvent.click(screen.getByRole("button", { name: "hilfe.art.dauerhaft" }));
    expect(screen.queryByText("Stand beim Heimspiel")).not.toBeInTheDocument();
    expect(screen.getByText("Newsletter")).toBeInTheDocument();
  });

  it("zeigt den Anlegen-Knopf nur mit dem Recht und nicht für gewöhnliche Mitglieder", () => {
    liste([stelle()]);
    renderWithProviders(<HilfeGesuchtPage />);
    expect(screen.queryByRole("button", { name: /hilfe\.neu/ })).not.toBeInTheDocument();
  });

  it("zeigt den Anlegen-Knopf für RH und öffnet das Formular", () => {
    useAuthStore.setState({ isAuthenticated: true, user: { role: "rh" } as never });
    liste([stelle()]);
    renderWithProviders(<HilfeGesuchtPage />);
    fireEvent.click(screen.getByRole("button", { name: /hilfe\.neu/ }));
    expect(screen.getByRole("form", { name: "hilfe.form.titel" })).toBeInTheDocument();
  });

  it("meldet sich mit Nachricht auf ein freies Gesuch", () => {
    liste([stelle()]);
    renderWithProviders(<HilfeGesuchtPage />);
    fireEvent.click(screen.getByRole("button", { name: /stellen\.helfen/ }));
    fireEvent.change(screen.getByLabelText("hilfe.nachricht_label"), {
      target: { value: "Ich bin dabei" },
    });
    fireEvent.click(screen.getByRole("button", { name: "stellen.senden" }));
    expect(bewerben).toHaveBeenCalledWith(
      { id: "s1", nachricht: "Ich bin dabei" },
      expect.any(Object),
    );
  });

  it("bietet der Ersteller·in das eigene Gesuch nicht zum Melden an", () => {
    liste([stelle({ ist_meine: true, kann_pflegen: true })]);
    renderWithProviders(<HilfeGesuchtPage />);
    expect(screen.queryByRole("button", { name: /stellen\.helfen/ })).not.toBeInTheDocument();
  });

  it("leitet anonyme Besucher zur Anmeldung", () => {
    useAuthStore.setState({ isAuthenticated: false, user: null });
    liste([stelle({ sichtbarkeit: "oeffentlich" })]);
    renderWithProviders(<HilfeGesuchtPage oeffentlich />);
    expect(screen.getAllByRole("link", { name: "stellen.login" })[0]).toHaveAttribute(
      "href",
      "/login",
    );
  });

  it("Ersteller·in empfiehlt eine Meldung, das Büro genehmigt", () => {
    vi.mocked(hooks.useBewerbungen).mockReturnValue({
      data: [
        {
          id: "b1",
          status: "offen",
          nachricht: "Gern",
          membre_detail: { id: "m1", prenom: "Aya", nom: "Ben" },
        },
        {
          id: "b2",
          status: "empfohlen",
          nachricht: "",
          empfohlen_von_name: "Rania R",
          membre_detail: { id: "m2", prenom: "Sami", nom: "Trabelsi" },
        },
      ],
    } as unknown as ReturnType<typeof hooks.useBewerbungen>);
    useAuthStore.setState({ isAuthenticated: true, user: { role: "bureau_admin" } as never });
    liste([
      stelle({
        ist_meine: true,
        kann_pflegen: true,
        bewerbungen_offen: 1,
        bewerbungen_empfohlen: 1,
      }),
    ]);
    renderWithProviders(<HilfeGesuchtPage />);
    expect(screen.getByText(/hilfe\.zu_genehmigen/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /hilfe\.meldungen/ }));
    const meldungen = within(screen.getByTestId("hilfe-meldungen"));
    fireEvent.click(meldungen.getByRole("button", { name: "hilfe.empfehlen" }));
    expect(empfehlen).toHaveBeenCalledWith("b1");
    fireEvent.click(meldungen.getAllByRole("button", { name: "hilfe.genehmigen" })[1]);
    expect(entscheiden).toHaveBeenCalledWith({ id: "b2", entscheidung: "annehmen" });
  });

  it("ohne Genehmigungsrecht gibt es keine Genehmigen-Schaltfläche", () => {
    vi.mocked(hooks.useBewerbungen).mockReturnValue({
      data: [
        {
          id: "b2",
          status: "empfohlen",
          nachricht: "",
          empfohlen_von_name: "Rania R",
          membre_detail: { id: "m2", prenom: "Sami", nom: "Trabelsi" },
        },
      ],
    } as unknown as ReturnType<typeof hooks.useBewerbungen>);
    useAuthStore.setState({ isAuthenticated: true, user: { role: "rh" } as never });
    liste([stelle({ ist_meine: true, kann_pflegen: true, bewerbungen_empfohlen: 1 })]);
    renderWithProviders(<HilfeGesuchtPage />);
    fireEvent.click(screen.getByRole("button", { name: /hilfe\.meldungen/ }));
    expect(screen.queryByRole("button", { name: "hilfe.genehmigen" })).not.toBeInTheDocument();
    expect(screen.getByText("hilfe.wartet_auf_freigabe")).toBeInTheDocument();
  });
});
