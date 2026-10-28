import { cleanup, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import * as api from "../../api/reisen";
import { entscheidung, reise } from "../../test/reisenDaten";
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
  it("zeigt Interessierten nur die Grundreiter, keine Aufgaben, Infos oder Kosten", async () => {
    vi.mocked(api.getReise).mockResolvedValue(
      reise({ mein_status: "interessiert", meine_rolle: "teilnehmer", voll: false }),
    );
    zeige();
    expect(await screen.findByRole("heading", { name: "Auswärts in Algier" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "tabs.blick" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "tabs.entscheidungen" })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "tabs.aufgaben" })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "tabs.infos" })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "tabs.kosten" })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "tabs.einstellungen" })).not.toBeInTheDocument();
  });

  it("zeigt Mitreisenden alle Arbeitsreiter und der Organisation zusätzlich die Einstellungen", async () => {
    vi.mocked(api.getReise).mockResolvedValue(
      reise({
        mein_status: "dabei",
        meine_rolle: "organisator",
        voll: true,
        kann_verwalten: true,
        ist_organisator: true,
        offene_entscheidungen: [entscheidung()],
      }),
    );
    zeige();
    for (const tab of ["aufgaben", "infos", "kosten", "einstellungen"]) {
      expect(await screen.findByRole("tab", { name: `tabs.${tab}` })).toBeInTheDocument();
    }
  });

  it("zeigt eine freundliche Meldung, wenn die Reise nicht sichtbar ist", async () => {
    vi.mocked(api.getReise).mockRejectedValue(new Error("404"));
    zeige();
    expect(await screen.findByTestId("reise-nicht-gefunden")).toBeInTheDocument();
  });
});
