import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as api from "../../api/reisen";
import ReisenPage from "../../pages/reisen/ReisenPage";
import { listItem, reise } from "../../test/reisenDaten";
import { renderWithProviders } from "../../test/renderWithProviders";

vi.mock("../../api/reisen");
vi.mock("../../pages/evenements/CovoituragePage", () => ({ default: () => <div /> }));

const morgen = new Date(Date.now() + 26 * 86_400_000).toISOString().slice(0, 10);

beforeEach(() => {
  vi.mocked(api.getSaison).mockResolvedValue([]);
  vi.mocked(api.listReisen).mockResolvedValue([]);
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Kopf „Deine nächste Reise“", () => {
  it("zeigt die nächste Reise mit Phase und „Jetzt dran“", async () => {
    vi.mocked(api.listReisen).mockResolvedValue([
      listItem({
        id: "r1",
        titel: "Kairo",
        ziel_ort: "Kairo",
        start: morgen,
        ende: morgen,
        mein_status: "dabei",
        phase: "buchung",
      }),
    ]);
    vi.mocked(api.getReise).mockResolvedValue(
      reise({
        id: "r1",
        jetzt_dran: [{ art: "abstimmen", id: "e1", titel: "Hotel", frist: null }],
      }),
    );
    renderWithProviders(<ReisenPage />);
    const hero = await screen.findByTestId("reisen-hero");
    expect(hero).toHaveTextContent("Kairo");
    expect(within(hero).getByRole("timer")).toBeInTheDocument();
    expect(within(hero).getByText("phase.buchung")).toHaveAttribute("aria-current", "step");
    const jetzt = await screen.findByTestId("reisen-hero-jetzt");
    expect(within(jetzt).getByRole("link", { name: "jetzt_dran.oeffnen" })).toHaveAttribute(
      "href",
      "/reisen/r1?tab=planung",
    );
  });

  it("fehlt, wenn ich an keiner Reise teilnehme", async () => {
    vi.mocked(api.listReisen).mockResolvedValue([listItem({ mein_status: null })]);
    renderWithProviders(<ReisenPage />);
    await screen.findByTestId("reise-r1");
    expect(screen.queryByTestId("reisen-hero")).not.toBeInTheDocument();
  });
});

describe("Reisekarten", () => {
  it("zeigt den Fortschritt zur Mindestzahl und meldet mit einem Tap „dabei“", async () => {
    vi.mocked(api.listReisen).mockResolvedValue([
      listItem({ id: "r2", dabei: 3, min_teilnehmer: 12, findet_statt: false }),
    ]);
    vi.mocked(api.beitreten).mockResolvedValue(listItem());
    renderWithProviders(<ReisenPage />);
    await screen.findByTestId("reise-r2");
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "25");
    fireEvent.click(screen.getByRole("button", { name: "start.ich_dabei" }));
    await waitFor(() => expect(api.beitreten).toHaveBeenCalledWith("r2", { status: "dabei" }));
  });
});

describe("Spielkarten", () => {
  const spiel = (o = {}) => ({
    rencontre: "m1",
    gegner: "ES Tunis",
    heim: true,
    competition: "Ligue 1",
    datum: "2027-03-12T18:00:00Z",
    reisen: [] as ReturnType<typeof listItem>[],
    ...o,
  });

  it("meldet Interesse mit einem Tap und nimmt es wieder zurück", async () => {
    vi.mocked(api.getSaison).mockResolvedValue([spiel({ reisen: [listItem({ id: "r5" })] })]);
    vi.mocked(api.beitreten).mockResolvedValue(listItem());
    renderWithProviders(<ReisenPage />);
    const karte = await screen.findByTestId("saison-m1");
    fireEvent.click(within(karte).getByRole("button", { name: "start.interesse" }));
    await waitFor(() =>
      expect(api.beitreten).toHaveBeenCalledWith("r5", { status: "interessiert" }),
    );
  });

  it("filtert nach Heim und Auswärts", async () => {
    vi.mocked(api.getSaison).mockResolvedValue([
      spiel(),
      spiel({ rencontre: "m2", gegner: "CS Sfaxien", heim: false }),
    ]);
    renderWithProviders(<ReisenPage />);
    await screen.findByTestId("saison-m2");
    fireEvent.click(screen.getByRole("button", { name: "start.filter.heim" }));
    expect(screen.queryByTestId("saison-m2")).not.toBeInTheDocument();
    expect(screen.getByTestId("saison-m1")).toBeInTheDocument();
  });
});

describe("Reise planen (Fenster)", () => {
  it("legt die Reise mit den gewählten Angaben an und zeigt dann das Einladen", async () => {
    vi.mocked(api.getSaison).mockResolvedValue([
      {
        rencontre: "m3",
        gegner: "USM Alger",
        heim: false,
        competition: "CAF",
        datum: "2027-01-23T18:00:00Z",
        reisen: [],
      },
    ]);
    vi.mocked(api.getStadionVorschlag).mockResolvedValue({ gegner: "USM Alger", stadt: "Algier" });
    vi.mocked(api.createReise).mockResolvedValue({ id: "neu1" });
    renderWithProviders(<ReisenPage />);
    await screen.findByTestId("saison-m3");
    fireEvent.click(screen.getByRole("button", { name: "saison.reise_planen" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "planen.wer_eingeladen" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "planen.beitritt_genehmigung" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "planen.starten" }));
    await waitFor(() =>
      expect(api.createReise).toHaveBeenCalledWith({
        rencontre: "m3",
        sichtbarkeit: "eingeladen",
        beitritt: "genehmigung",
        vorlage: "auswaerts_ausland",
      }),
    );
    expect(await screen.findByText(/planen.angelegt/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "planen.zum_raum" })).toHaveAttribute(
      "href",
      "/reisen/neu1?tab=einstellungen",
    );
  });
});
