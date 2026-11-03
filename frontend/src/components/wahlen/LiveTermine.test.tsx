import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as hooks from "../../hooks/useWahlen";
import { renderWithProviders } from "../../test/renderWithProviders";
import type { LiveTermin, Wahl } from "../../types/wahlen";
import LiveTermine from "./LiveTermine";

vi.mock("../../hooks/useWahlen", async () => {
  const actual = await vi.importActual<typeof hooks>("../../hooks/useWahlen");
  return {
    ...actual,
    useTermine: vi.fn(),
    useTerminAnlegen: vi.fn(),
    useTerminAendern: vi.fn(),
    useTerminLoeschen: vi.fn(),
    useTerminErinnern: vi.fn(),
  };
});

vi.mock("../../utils/ics", () => ({ ladeIcsHerunter: vi.fn() }));

const wahl = (extra: Partial<Wahl> = {}) =>
  ({ id: "w1", status: "aktiv", ist_ausschuss: false, kann_verwalten: false, ...extra }) as Wahl;

const termin = (extra: Partial<LiveTermin> = {}): LiveTermin => ({
  id: "t1",
  wahl: "w1",
  art: "vorstellung",
  titel: "Live-Vorstellungsrunde",
  beginn: "2099-01-10T18:00:00Z",
  ende: null,
  link: "https://meet.example.org/abc",
  hinweis: "Fragen bitte vorab im Chat.",
  im_kalender: true,
  erinnert: false,
  vorbei: false,
  ...extra,
});

function vorbereiten(daten: LiveTermin[]) {
  const mutationen = {
    anlegen: { mutate: vi.fn(), isPending: false },
    aendern: { mutate: vi.fn(), isPending: false },
    loeschen: { mutate: vi.fn(), isPending: false },
    erinnern: { mutate: vi.fn(), isPending: false },
  };
  vi.mocked(hooks.useTermine).mockReturnValue({
    data: daten,
    isLoading: false,
  } as unknown as ReturnType<typeof hooks.useTermine>);
  vi.mocked(hooks.useTerminAnlegen).mockReturnValue(
    mutationen.anlegen as unknown as ReturnType<typeof hooks.useTerminAnlegen>,
  );
  vi.mocked(hooks.useTerminAendern).mockReturnValue(
    mutationen.aendern as unknown as ReturnType<typeof hooks.useTerminAendern>,
  );
  vi.mocked(hooks.useTerminLoeschen).mockReturnValue(
    mutationen.loeschen as unknown as ReturnType<typeof hooks.useTerminLoeschen>,
  );
  vi.mocked(hooks.useTerminErinnern).mockReturnValue(
    mutationen.erinnern as unknown as ReturnType<typeof hooks.useTerminErinnern>,
  );
  return mutationen;
}

describe("LiveTermine", () => {
  beforeEach(() => vi.clearAllMocks());

  it("zeigt Mitgliedern Termin, Link und Hinweis, aber keine Verwaltung", () => {
    vorbereiten([termin()]);
    renderWithProviders(<LiveTermine wahl={wahl()} />);
    expect(screen.getByText("Live-Vorstellungsrunde")).toBeInTheDocument();
    expect(screen.getByText("Fragen bitte vorab im Chat.")).toBeInTheDocument();
    expect(screen.getByText("live.zum_treffen").closest("a")).toHaveAttribute(
      "href",
      "https://meet.example.org/abc",
    );
    expect(screen.queryByText("live.neu", { exact: false })).not.toBeInTheDocument();
    expect(screen.queryByText("live.bearbeiten")).not.toBeInTheDocument();
  });

  it("blendet den ganzen Block ohne Termine für Mitglieder aus", () => {
    vorbereiten([]);
    renderWithProviders(<LiveTermine wahl={wahl()} />);
    expect(screen.queryByTestId("live-termine")).not.toBeInTheDocument();
  });

  it("schaltet „Erinnere mich“ um", () => {
    const m = vorbereiten([termin()]);
    renderWithProviders(<LiveTermine wahl={wahl()} />);
    fireEvent.click(screen.getByText("live.erinnere_mich"));
    expect(m.erinnern.mutate).toHaveBeenCalledWith({ id: "t1", an: true }, expect.anything());
  });

  it("zeigt den aktiven Stand und nimmt die Erinnerung zurück", () => {
    const m = vorbereiten([termin({ erinnert: true })]);
    renderWithProviders(<LiveTermine wahl={wahl()} />);
    const knopf = screen.getByRole("button", { pressed: true });
    fireEvent.click(knopf);
    expect(m.erinnern.mutate).toHaveBeenCalledWith({ id: "t1", an: false }, expect.anything());
  });

  it("verweist vor der Veröffentlichung statt auf die Erinnerung auf den Hinweis", () => {
    vorbereiten([termin({ im_kalender: false })]);
    renderWithProviders(<LiveTermine wahl={wahl()} />);
    expect(screen.getByText("live.erst_nach_veroeffentlichung")).toBeInTheDocument();
    expect(screen.queryByText("live.erinnere_mich")).not.toBeInTheDocument();
  });

  it("zeigt bei vergangenen Terminen keine Knöpfe", () => {
    vorbereiten([termin({ vorbei: true })]);
    renderWithProviders(<LiveTermine wahl={wahl()} />);
    expect(screen.getByText("live.vorbei")).toBeInTheDocument();
    expect(screen.queryByText("live.erinnere_mich")).not.toBeInTheDocument();
  });

  it("lädt die Kalenderdatei", async () => {
    vorbereiten([termin()]);
    const ics = await import("../../utils/ics");
    renderWithProviders(<LiveTermine wahl={wahl()} />);
    fireEvent.click(screen.getByText("live.in_kalender", { exact: false }));
    expect(ics.ladeIcsHerunter).toHaveBeenCalledWith(
      expect.objectContaining({ titel: "Live-Vorstellungsrunde", beginn: "2099-01-10T18:00:00Z" }),
    );
  });

  it("Ausschuss legt einen Termin an", () => {
    const m = vorbereiten([]);
    renderWithProviders(<LiveTermine wahl={wahl({ ist_ausschuss: true })} />);
    fireEvent.click(screen.getByText("live.neu", { exact: false }));
    fireEvent.change(screen.getByLabelText("live.form.beginn"), {
      target: { value: "2099-01-10T18:00" },
    });
    fireEvent.change(screen.getByLabelText("live.form.link"), {
      target: { value: "https://meet.example.org/x" },
    });
    fireEvent.click(screen.getByText("live.form.anlegen"));
    expect(m.anlegen.mutate).toHaveBeenCalledTimes(1);
    const payload = m.anlegen.mutate.mock.calls[0][0];
    expect(payload).toMatchObject({
      art: "vorstellung",
      titel: "live.art.vorstellung",
      link: "https://meet.example.org/x",
      ende: null,
    });
    expect(new Date(payload.beginn).getFullYear()).toBe(2099);
  });

  it("Ausschuss löscht nach Rückfrage", () => {
    const m = vorbereiten([termin()]);
    renderWithProviders(<LiveTermine wahl={wahl({ kann_verwalten: true })} />);
    fireEvent.click(screen.getByText("live.loeschen"));
    expect(m.loeschen.mutate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("live.loeschen_ja"));
    expect(m.loeschen.mutate).toHaveBeenCalledWith("t1");
  });

  it("bei abgeschlossener Wahl gibt es kein Anlegen mehr", () => {
    vorbereiten([termin()]);
    renderWithProviders(
      <LiveTermine wahl={wahl({ kann_verwalten: true, status: "abgeschlossen" })} />,
    );
    expect(screen.queryByText("live.neu", { exact: false })).not.toBeInTheDocument();
  });
});
