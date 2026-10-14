import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as authApi from "../../api/auth";
import * as hooks from "../../hooks/useKalender";
import { useAuthStore, type CidUser } from "../../store/authStore";
import { renderWithProviders } from "../../test/renderWithProviders";
import { eintrag } from "../../test/kalenderFixture";
import type { KalenderZugang } from "../../types/kalender";
import KalenderPage from "./KalenderPage";

vi.mock("../../hooks/useKalender", async () => {
  const actual = await vi.importActual<typeof hooks>("../../hooks/useKalender");
  return {
    ...actual,
    useKalenderZugang: vi.fn(),
    useKalenderEintraege: vi.fn(),
    useTermin: vi.fn(() => ({ data: undefined })),
    useEintragAusblenden: vi.fn(),
  };
});
vi.mock("../../api/auth", async (orig) => ({
  ...(await orig<typeof import("../../api/auth")>()),
  speicherePraeferenzen: vi.fn(),
}));
vi.mock("../../hooks/useProjets", () => ({ useProjets: () => ({ data: { results: [] } }) }));

function zugang(extra: Partial<KalenderZugang> = {}) {
  vi.mocked(hooks.useKalenderZugang).mockReturnValue({
    data: {
      verein: true,
      buero: false,
      schreiben: false,
      vorschlagen: false,
      verwaltung: false,
      ...extra,
    },
  } as unknown as ReturnType<typeof hooks.useKalenderZugang>);
}

const ausblendenMock = vi.fn().mockResolvedValue(undefined);

beforeEach(() => {
  ausblendenMock.mockClear();
  vi.mocked(hooks.useEintragAusblenden).mockReturnValue({
    mutateAsync: ausblendenMock,
    isPending: false,
  } as unknown as ReturnType<typeof hooks.useEintragAusblenden>);
  vi.mocked(hooks.useKalenderEintraege).mockReturnValue({
    data: [eintrag()],
    isLoading: false,
    isError: false,
  } as unknown as ReturnType<typeof hooks.useKalenderEintraege>);
});

describe("KalenderPage", () => {
  it("zeigt Mitgliedern nur Vereinskalender und Meine Termine", () => {
    zugang();
    renderWithProviders(<KalenderPage />);
    expect(screen.getByRole("button", { name: /tab\.verein/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /tab\.meine/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /tab\.buero/ })).not.toBeInTheDocument();
    expect(screen.queryByText("neuer_termin")).not.toBeInTheDocument();
    expect(screen.queryByText("termin_vorschlagen")).not.toBeInTheDocument();
  });

  it("zeigt den Büro-Reiter und „Neuer Termin“ mit Schreibrecht", () => {
    zugang({ buero: true, schreiben: true, verwaltung: true });
    renderWithProviders(<KalenderPage />);
    expect(screen.getByRole("button", { name: /tab\.buero/ })).toBeInTheDocument();
    expect(screen.getByText("neuer_termin")).toBeInTheDocument();
  });

  it("bietet nur „Vorschlagen“ ohne Schreibrecht", () => {
    zugang({ vorschlagen: true });
    renderWithProviders(<KalenderPage />);
    fireEvent.click(screen.getByText("termin_vorschlagen"));
    expect(screen.getByText("form.vorschlagen")).toBeInTheDocument();
    expect(screen.queryByText("form.einladen")).not.toBeInTheDocument();
  });

  it("öffnet den Termin im Dialog und wechselt zur Liste", () => {
    zugang();
    renderWithProviders(<KalenderPage />);
    fireEvent.change(screen.getByLabelText("modus.label"), { target: { value: "liste" } });
    expect(screen.getByTestId("kalender-liste")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Vorstandssitzung"));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("filtert nach Kategorie", () => {
    zugang();
    renderWithProviders(<KalenderPage />);
    fireEvent.change(screen.getByLabelText("modus.label"), { target: { value: "liste" } });
    fireEvent.change(screen.getByLabelText("filter.kategorie"), { target: { value: "frist" } });
    expect(screen.queryByText("Vorstandssitzung")).not.toBeInTheDocument();
  });

  it("blendet ein Spiel mit Schreibrecht aus", async () => {
    zugang({ schreiben: true });
    vi.mocked(hooks.useKalenderEintraege).mockReturnValue({
      data: [
        eintrag({
          id: "spieltag:s1",
          quelle: "spieltag",
          objekt_id: "s1",
          titel: "Club Africain – ESS",
          ausblendbar: true,
          ausgeblendet: false,
        }),
      ],
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof hooks.useKalenderEintraege>);
    renderWithProviders(<KalenderPage />);
    fireEvent.change(screen.getByLabelText("modus.label"), { target: { value: "liste" } });
    fireEvent.click(screen.getByText("Club Africain – ESS"));
    fireEvent.click(screen.getByText("ausblenden"));
    expect(ausblendenMock).toHaveBeenCalledWith({
      quelle: "spieltag",
      objekt_id: "s1",
      ausgeblendet: true,
    });
  });

  it("zeigt Ausgeblendetes markiert und bietet Einblenden an", () => {
    zugang({ schreiben: true });
    vi.mocked(hooks.useKalenderEintraege).mockReturnValue({
      data: [
        eintrag({
          id: "spieltag:s1",
          quelle: "spieltag",
          objekt_id: "s1",
          titel: "Club Africain – ESS",
          ausblendbar: true,
          ausgeblendet: true,
        }),
      ],
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof hooks.useKalenderEintraege>);
    renderWithProviders(<KalenderPage />);
    fireEvent.change(screen.getByLabelText("modus.label"), { target: { value: "liste" } });
    expect(screen.getByText(/ausgeblendet_kurz/)).toBeInTheDocument();
    fireEvent.click(screen.getByText(/Club Africain – ESS/));
    expect(screen.getByText("ausgeblendet_hinweis")).toBeInTheDocument();
    expect(screen.getByText("einblenden")).toBeInTheDocument();
  });

  it("bietet Mitgliedern kein Ausblenden an", () => {
    zugang();
    renderWithProviders(<KalenderPage />);
    fireEvent.change(screen.getByLabelText("modus.label"), { target: { value: "liste" } });
    fireEvent.click(screen.getByText("Vorstandssitzung"));
    expect(screen.queryByText("ausblenden")).not.toBeInTheDocument();
  });

  it("kombiniert Sichten und fragt sie gemeinsam ab", () => {
    zugang({ buero: true });
    renderWithProviders(<KalenderPage />);
    expect(hooks.useKalenderEintraege).toHaveBeenLastCalledWith(
      ["verein"],
      expect.any(Date),
      expect.any(Date),
    );
    fireEvent.click(screen.getByRole("button", { name: /tab\.meine/ }));
    fireEvent.click(screen.getByRole("button", { name: /tab\.buero/ }));
    expect(hooks.useKalenderEintraege).toHaveBeenLastCalledWith(
      ["verein", "buero", "meine"],
      expect.any(Date),
      expect.any(Date),
    );
  });

  it("lässt immer mindestens eine Sicht aktiv", () => {
    zugang();
    renderWithProviders(<KalenderPage />);
    fireEvent.click(screen.getByRole("button", { name: /tab\.verein/ }));
    expect(screen.getByRole("button", { name: /tab\.verein/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("merkt sich die Auswahl in den Einstellungen", async () => {
    zugang();
    useAuthStore.setState({
      user: { id: "u", email: "a@b.de", role: "membre", langue_preferee: "de" } as CidUser,
    });
    vi.mocked(authApi.speicherePraeferenzen).mockResolvedValue({
      id: "u",
      email: "a@b.de",
      role: "membre",
      langue_preferee: "de",
      ui_praeferenzen: { kalender_ansichten: ["verein", "meine"] },
    } as CidUser);
    renderWithProviders(<KalenderPage />);
    fireEvent.click(screen.getByRole("button", { name: /tab\.meine/ }));
    expect(authApi.speicherePraeferenzen).toHaveBeenCalledWith({
      ui_praeferenzen: { kalender_ansichten: ["verein", "meine"] },
    });
    useAuthStore.setState({ user: null });
  });
});
