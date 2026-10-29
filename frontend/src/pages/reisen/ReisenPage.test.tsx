import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import * as api from "../../api/reisen";
import { listItem } from "../../test/reisenDaten";
import { renderWithProviders } from "../../test/renderWithProviders";
import ReisenPage from "./ReisenPage";

vi.mock("../../api/reisen");
vi.mock("../evenements/CovoituragePage", () => ({
  default: () => <div data-testid="fahrgemeinschaften" />,
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ReisenPage", () => {
  it("zeigt die Reisen als Karten mit Link in den Reiseraum", async () => {
    vi.mocked(api.listReisen).mockResolvedValue([
      listItem(),
      listItem({ id: "r2", titel: "Wochenende Hamburg" }),
    ]);
    renderWithProviders(<ReisenPage />);
    const karte = await screen.findByTestId("reise-r1");
    expect(karte).toHaveTextContent("Auswärts in Algier");
    expect(karte).toHaveAttribute("href", "/reisen/r1");
    expect(screen.getByTestId("reise-r2")).toBeInTheDocument();
  });

  it("zeigt einen Hinweis, wenn es keine Reisen gibt", async () => {
    vi.mocked(api.listReisen).mockResolvedValue([]);
    renderWithProviders(<ReisenPage />);
    expect(await screen.findByText("liste.leer")).toBeInTheDocument();
  });

  it("filtert auf die eigenen Reisen", async () => {
    vi.mocked(api.listReisen).mockResolvedValue([]);
    renderWithProviders(<ReisenPage />);
    await screen.findByText("liste.leer");
    fireEvent.click(screen.getByLabelText("liste.nur_meine"));
    await waitFor(() => expect(api.listReisen).toHaveBeenCalledWith({ meine: true }));
  });

  it("wechselt zu den Fahrgemeinschaften", async () => {
    vi.mocked(api.listReisen).mockResolvedValue([]);
    renderWithProviders(<ReisenPage />);
    fireEvent.click(screen.getByRole("tab", { name: "tab_fahrgemeinschaften" }));
    expect(await screen.findByTestId("fahrgemeinschaften")).toBeInTheDocument();
  });
});
