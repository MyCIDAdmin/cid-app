import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as hooks from "../../hooks/useRegionen";
import { renderWithProviders } from "../../test/renderWithProviders";
import type { RegionDetail, Verantwortlicher } from "../../types/regionen";
import RegionDetailPage from "./RegionDetailPage";

vi.mock("../../components/regionen/VeranstaltungenBereich", () => ({
  default: ({ darfAnlegen }: { darfAnlegen: boolean }) => (
    <div data-testid="veranstaltungen" data-anlegen={String(darfAnlegen)} />
  ),
}));

vi.mock("../../components/regionen/BeitraegeBereich", () => ({
  default: ({ darfSchreiben }: { darfSchreiben: boolean }) => (
    <div data-testid="beitraege" data-schreiben={String(darfSchreiben)} />
  ),
}));

// TipTap lässt sich in jsdom nicht per fireEvent bedienen : <textarea> mit gleichem Vertrag.
vi.mock("../../components/ui/RichTextEditor", () => ({
  default: ({
    value,
    onChange,
    placeholder,
    ariaLabel,
  }: {
    value: string;
    onChange: (html: string) => void;
    placeholder?: string;
    ariaLabel?: string;
  }) => (
    <textarea
      aria-label={ariaLabel}
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  ),
}));

vi.mock("../../hooks/useRegionen", () => ({
  useRegion: vi.fn(),
  useBeschreibungSpeichern: vi.fn(),
  useBannerHochladen: vi.fn(),
  useBannerEntfernen: vi.fn(),
  useKarteSpeichern: vi.fn(),
  useKarteLoeschen: vi.fn(),
  useFotoHochladen: vi.fn(),
  useFotoEntfernen: vi.fn(),
  usePersonenSuche: vi.fn(),
  useVerantwortlichenZuweisen: vi.fn(),
}));

function person(o: Partial<Verantwortlicher> = {}): Verantwortlicher {
  return {
    id: "v1",
    name: "Ahmed B.",
    funktion: "Regionssprecher",
    standort: { id: "s1", name: "Hamburg" },
    vorstellung: "Ich organisiere die Treffen.",
    foto_url: null,
    kontakt_email: "",
    eigene: false,
    ...o,
  };
}

function detail(o: Partial<RegionDetail> = {}): RegionDetail {
  return {
    id: "r1",
    slug: "nord",
    name: "Nord",
    farbe: "#0e7490",
    banner_url: null,
    beschreibung: { de: "Moin aus dem Norden", fr: "" },
    mitglieder: 3,
    verantwortliche: [person()],
    meine_region: false,
    naechste_veranstaltung: null,
    standorte: [{ id: "s1", name: "Hamburg", land: "HH", aktiv: true }],
    laender: [{ code: "HH", name: "Hamburg" }],
    darf_bearbeiten: false,
    darf_personen_verwalten: false,
    wettbewerb: null,
    ...o,
  };
}

const mutation = (mutate = vi.fn()) =>
  ({ mutate, isPending: false }) as unknown as ReturnType<typeof hooks.useKarteLoeschen>;

function mock(data: RegionDetail | undefined, beschreibungMutate = vi.fn()) {
  vi.mocked(hooks.useRegion).mockReturnValue({
    data,
    isLoading: false,
    isError: !data,
  } as unknown as ReturnType<typeof hooks.useRegion>);
  vi.mocked(hooks.useBeschreibungSpeichern).mockReturnValue(
    mutation(beschreibungMutate) as unknown as ReturnType<typeof hooks.useBeschreibungSpeichern>,
  );
  for (const k of [
    "useBannerHochladen",
    "useBannerEntfernen",
    "useKarteSpeichern",
    "useKarteLoeschen",
    "useFotoHochladen",
    "useFotoEntfernen",
    "useVerantwortlichenZuweisen",
  ] as const) {
    vi.mocked(hooks[k]).mockReturnValue(mutation() as never);
  }
  vi.mocked(hooks.usePersonenSuche).mockReturnValue({ data: [] } as never);
}

function zeige() {
  return renderWithProviders(<RegionDetailPage />, {
    route: "/regionen/nord",
    path: "/regionen/:slug",
  });
}

describe("RegionDetailPage", () => {
  beforeEach(() => vi.clearAllMocks());

  it("zeigt Beschreibung, Standorte und Karten, aber keine Bearbeitung für Lesende", () => {
    mock(detail());
    zeige();
    expect(screen.getByRole("heading", { name: "Nord" })).toBeInTheDocument();
    expect(screen.getByText("Moin aus dem Norden")).toBeInTheDocument();
    expect(screen.getAllByText("Hamburg").length).toBeGreaterThan(0);
    expect(screen.getByText("Ahmed B.")).toBeInTheDocument();
    expect(screen.queryByText("beschreibung_bearbeiten")).not.toBeInTheDocument();
    expect(screen.queryByText("karte_bearbeiten")).not.toBeInTheDocument();
    expect(screen.queryByText("zuweisen_titel")).not.toBeInTheDocument();
    expect(screen.getByTestId("beitraege")).toHaveAttribute("data-schreiben", "false");
    expect(screen.getByTestId("veranstaltungen")).toHaveAttribute("data-anlegen", "false");
  });

  it("zeigt einen Fehler, wenn die Region fehlt", () => {
    mock(undefined);
    zeige();
    expect(screen.getByText("fehler_laden_region")).toBeInTheDocument();
  });

  it("erlaubt Verantwortlichen, die Beschreibung zu speichern", () => {
    const speichern = vi.fn();
    mock(detail({ darf_bearbeiten: true }), speichern);
    zeige();
    fireEvent.click(screen.getByText("beschreibung_bearbeiten"));
    fireEvent.change(screen.getByLabelText("beschreibung_fr"), { target: { value: "Bonjour" } });
    fireEvent.click(screen.getByText("speichern"));
    expect(screen.getByTestId("beitraege")).toHaveAttribute("data-schreiben", "true");
    expect(speichern).toHaveBeenCalledWith(
      { slug: "nord", de: "Moin aus dem Norden", fr: "Bonjour" },
      expect.any(Object),
    );
  });

  it("zeigt den Platz im Wettbewerb nur, wenn es einen gibt", () => {
    mock(detail({ wettbewerb: { saison: "Saison 2026/27", rang: 2, punkte: 90, regionen: 5 } }));
    const { unmount } = zeige();
    expect(screen.getByText("wettbewerb.platz")).toHaveAttribute("href", "/regionen/wettbewerb");
    unmount();
    mock(detail());
    zeige();
    expect(screen.queryByText("wettbewerb.platz")).not.toBeInTheDocument();
  });

  it("zeigt Bearbeiten nur an der eigenen Karte", () => {
    mock(
      detail({
        darf_bearbeiten: true,
        verantwortliche: [person(), person({ id: "v2", name: "Alex", eigene: true })],
      }),
    );
    zeige();
    expect(screen.getAllByText(/karte_(meine_)?bearbeiten/)).toHaveLength(1);
    expect(screen.getByText("karte_meine_bearbeiten")).toBeInTheDocument();
    expect(screen.queryByText("karte_entfernen")).not.toBeInTheDocument();
  });

  it("zeigt Zuweisen und Entfernen für Personenverwalter", () => {
    mock(detail({ darf_bearbeiten: true, darf_personen_verwalten: true }));
    zeige();
    expect(screen.getByText("zuweisen_titel")).toBeInTheDocument();
    expect(screen.getByText("karte_entfernen")).toBeInTheDocument();
    expect(screen.getByText("karte_bearbeiten")).toBeInTheDocument();
  });
});
