import { cleanup, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import * as api from "../../api/reisen";
import { renderWithProviders } from "../../test/renderWithProviders";
import ReiseOeffentlichPage from "./ReiseOeffentlichPage";

vi.mock("../../api/reisen", async () => {
  const actual = await vi.importActual<typeof api>("../../api/reisen");
  return { ...actual, getReiseOeffentlich: vi.fn() };
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const zeige = () =>
  renderWithProviders(<ReiseOeffentlichPage />, { route: "/reise/r1", path: "/reise/:id" });

describe("ReiseOeffentlichPage", () => {
  it("zeigt Titel und nur die Anzahl der Interessierten, nie Namen", async () => {
    vi.mocked(api.getReiseOeffentlich).mockResolvedValue({
      id: "r1",
      titel: "Auswärts in Algier",
      ziel_ort: "Algier",
      land: "Algerien",
      start: "2027-03-10",
      ende: "2027-03-14",
      beschreibung: "<p>Gemeinsam hin.</p>",
      interessiert: 7,
    });
    zeige();
    expect(await screen.findByRole("heading", { name: "Auswärts in Algier" })).toBeInTheDocument();
    expect(screen.getByTestId("interessiert-zahl")).toBeInTheDocument();
    expect(screen.getByText("Gemeinsam hin.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "oeffentlich.anmelden_mitmachen" })).toHaveAttribute(
      "href",
      "/reisen/r1",
    );
  });

  it("zeigt eine Meldung, wenn es keine öffentliche Vorschau gibt", async () => {
    vi.mocked(api.getReiseOeffentlich).mockRejectedValue(new Error("404"));
    zeige();
    expect(await screen.findByTestId("reise-oeffentlich-nicht-gefunden")).toBeInTheDocument();
  });
});
