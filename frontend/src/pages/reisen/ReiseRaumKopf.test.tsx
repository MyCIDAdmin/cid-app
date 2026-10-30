import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import * as api from "../../api/reisen";
import { entscheidung, meineAngaben, reise } from "../../test/reisenDaten";
import { renderWithProviders } from "../../test/renderWithProviders";
import type { Etappe } from "../../types/reisen";
import ReiseRaumPage from "./ReiseRaumPage";

vi.mock("../../api/reisen");

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const zeige = () =>
  renderWithProviders(<ReiseRaumPage />, { route: "/reisen/r1", path: "/reisen/:id" });

const hinreise: Etappe = {
  id: "e1",
  richtung: "hin",
  art: "flug",
  von_ort: "Berlin",
  von_code: "BER",
  nach_ort: "Kairo",
  nach_code: "CAI",
  abfahrt: "2026-11-26T07:40:00Z",
  ankunft: null,
  anbieter: "",
  status: "gebucht",
};

describe("Kopf des Reiseraums", () => {
  it("zeigt Phase und Überschrift der Phase und führt mit dem Hauptknopf in die Planung", async () => {
    vi.mocked(api.getReise).mockResolvedValue(
      reise({
        mein_status: "dabei",
        voll: true,
        phase: "buchung",
        meine: meineAngaben(),
        jetzt_dran: [{ art: "abstimmen", id: "e1", titel: "Hotel", frist: null }],
      }),
    );
    zeige();
    const kopf = await screen.findByTestId("reise-kopf");
    expect(within(kopf).getByText("kopf.phase_titel.buchung")).toBeInTheDocument();
    expect(within(kopf).getByText("phase.buchung")).toHaveAttribute("aria-current", "step");
    fireEvent.click(within(kopf).getByTestId("reise-kopf-cta"));
    expect(await screen.findByRole("tab", { name: "tabs.planung", selected: true })).toBeVisible();
  });

  it("nimmt ohne offenen Punkt den Standardknopf der Phase", async () => {
    vi.mocked(api.getReise).mockResolvedValue(
      reise({ mein_status: "dabei", voll: true, phase: "buchung", meine: meineAngaben() }),
    );
    zeige();
    const knopf = await screen.findByTestId("reise-kopf-cta");
    expect(knopf).toHaveTextContent("kopf.cta.buchung");
    fireEvent.click(knopf);
    expect(await screen.findByRole("tab", { name: "tabs.meine", selected: true })).toBeVisible();
  });

  it("bietet auf dem Handy unten denselben nächsten Schritt an", async () => {
    vi.mocked(api.getReise).mockResolvedValue(
      reise({ mein_status: "dabei", voll: true, phase: "planung", meine: meineAngaben() }),
    );
    zeige();
    const dock = await screen.findByTestId("reise-dock");
    expect(dock).toHaveTextContent("kopf.cta.planung");
  });

  it("hat ohne Zugang zum Reiter keinen Hauptknopf", async () => {
    vi.mocked(api.getReise).mockResolvedValue(
      reise({ mein_status: "interessiert", voll: false, phase: "buchung" }),
    );
    zeige();
    await screen.findByTestId("reise-kopf");
    expect(screen.queryByTestId("reise-kopf-cta")).not.toBeInTheDocument();
    expect(screen.queryByTestId("reise-dock")).not.toBeInTheDocument();
  });
});

describe("Mein Reiseplan", () => {
  it("zeigt gebuchte Hinreise und fehlende Rückreise mit Eintragen-Knopf", async () => {
    vi.mocked(api.getReise).mockResolvedValue(
      reise({
        mein_status: "dabei",
        voll: true,
        meine: meineAngaben({ etappen: [hinreise], unterkunft_eigen: "Hostel Downtown" }),
      }),
    );
    zeige();
    const plan = await screen.findByRole("region", { name: "heute.reiseplan" });
    expect(plan).toHaveTextContent("Berlin → Kairo");
    expect(plan).toHaveTextContent("Hostel Downtown");
    expect(within(plan).getAllByText("heute.gebucht")).toHaveLength(1);
    // Unterkunft ist gewählt, aber nicht gebucht : „geplant“. Die Rückreise fehlt.
    expect(within(plan).getByText("heute.geplant")).toBeInTheDocument();
    fireEvent.click(within(plan).getByRole("button", { name: "heute.eintragen" }));
    expect(await screen.findByRole("tab", { name: "tabs.meine", selected: true })).toBeVisible();
  });

  it("fehlt für Personen, die nicht dabei sind", async () => {
    vi.mocked(api.getReise).mockResolvedValue(
      reise({
        mein_status: "interessiert",
        voll: true,
        meine: meineAngaben({ status: "interessiert" }),
      }),
    );
    zeige();
    await screen.findByTestId("reise-kopf");
    expect(screen.queryByRole("region", { name: "heute.reiseplan" })).not.toBeInTheDocument();
  });
});

describe("Abstimmung auf der Übersicht", () => {
  it("zeigt die erste offene Abstimmung direkt auf der ersten Seite", async () => {
    vi.mocked(api.getReise).mockResolvedValue(
      reise({
        mein_status: "dabei",
        voll: true,
        meine: meineAngaben(),
        offene_entscheidungen: [entscheidung({ titel: "Welches Hotel?" })],
      }),
    );
    zeige();
    const abschnitt = await screen.findByRole("region", { name: "heute.abstimmung" });
    expect(abschnitt).toHaveTextContent("Welches Hotel?");
  });
});
