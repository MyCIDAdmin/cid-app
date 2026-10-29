import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import * as api from "../../api/reisen";
import { entscheidung, meineAngaben, reise } from "../../test/reisenDaten";
import { renderWithProviders } from "../../test/renderWithProviders";
import ReiseRaumPage from "./ReiseRaumPage";

vi.mock("../../api/reisen");

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const zeige = () =>
  renderWithProviders(<ReiseRaumPage />, { route: "/reisen/r1", path: "/reisen/:id" });

describe("ReiseRaumPage", () => {
  it("zeigt Interessierten nur Übersicht, Planung und Menschen", async () => {
    vi.mocked(api.getReise).mockResolvedValue(
      reise({ mein_status: "interessiert", meine_rolle: "teilnehmer", voll: false }),
    );
    zeige();
    expect(await screen.findByRole("heading", { name: "Auswärts in Algier" })).toBeInTheDocument();
    for (const tab of ["blick", "planung", "menschen"]) {
      expect(screen.getByRole("tab", { name: `tabs.${tab}` })).toBeInTheDocument();
    }
    expect(screen.queryByRole("tab", { name: "tabs.infos_kosten" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "tabs.einstellungen" })).not.toBeInTheDocument();
  });

  it("zeigt Mitreisenden fünf Reiter und der Organisation zusätzlich das Zahnrad", async () => {
    vi.mocked(api.getReise).mockResolvedValue(
      reise({
        mein_status: "dabei",
        meine_rolle: "organisator",
        meine: meineAngaben(),
        voll: true,
        kann_verwalten: true,
        ist_organisator: true,
        offene_entscheidungen: [entscheidung()],
      }),
    );
    zeige();
    for (const tab of ["blick", "planung", "menschen", "meine", "infos_kosten"]) {
      expect(await screen.findByRole("tab", { name: `tabs.${tab}` })).toBeInTheDocument();
    }
    expect(screen.getAllByRole("tab")).toHaveLength(5);
    expect(screen.getByRole("button", { name: "tabs.einstellungen" })).toBeInTheDocument();
  });

  it("führt alte Adressen (?tab=aufgaben) auf die Planung und fasst deren Bereiche zusammen", async () => {
    vi.mocked(api.getReise).mockResolvedValue(
      reise({ mein_status: "dabei", meine_rolle: "teilnehmer", voll: true }),
    );
    renderWithProviders(<ReiseRaumPage />, {
      route: "/reisen/r1?tab=aufgaben",
      path: "/reisen/:id",
    });
    expect(await screen.findByRole("tab", { name: "tabs.planung", selected: true })).toBeVisible();
    for (const titel of ["tabs.entscheidungen", "tabs.aufgaben", "tabs.checkliste"]) {
      expect(screen.getByRole("region", { name: titel })).toBeInTheDocument();
    }
  });

  it("öffnet die Einstellungen über das Zahnrad", async () => {
    vi.mocked(api.getReise).mockResolvedValue(
      reise({ mein_status: "dabei", meine_rolle: "organisator", voll: true, kann_verwalten: true }),
    );
    zeige();
    fireEvent.click(await screen.findByRole("button", { name: "tabs.einstellungen" }));
    expect(screen.getByRole("button", { name: "tabs.einstellungen" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("zeigt eine freundliche Meldung, wenn die Reise nicht sichtbar ist", async () => {
    vi.mocked(api.getReise).mockRejectedValue(new Error("404"));
    zeige();
    expect(await screen.findByTestId("reise-nicht-gefunden")).toBeInTheDocument();
  });
});
