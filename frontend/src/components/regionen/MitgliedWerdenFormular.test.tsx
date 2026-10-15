import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as authApi from "../../api/auth";
import * as api from "../../api/regionen";
import { useAuthStore } from "../../store/authStore";
import { renderWithProviders } from "../../test/renderWithProviders";
import MitgliedWerdenFormular from "./MitgliedWerdenFormular";

const navigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => navigate };
});
vi.mock("../../api/auth", async () => {
  const actual = await vi.importActual<typeof authApi>("../../api/auth");
  return { ...actual, fetchMe: vi.fn() };
});
vi.mock("../../api/regionen", async () => {
  const actual = await vi.importActual<typeof api>("../../api/regionen");
  return { ...actual, werdeMitglied: vi.fn() };
});

function fuelle() {
  fireEvent.change(screen.getByLabelText("fan.geburtsdatum", { exact: false }), {
    target: { value: "1990-04-02" },
  });
  fireEvent.change(screen.getByLabelText("fan.telefon", { exact: false }), {
    target: { value: "+491701234567" },
  });
  fireEvent.change(screen.getByLabelText("fan.adresse", { exact: false }), {
    target: { value: "Hafenstr. 1" },
  });
  fireEvent.change(screen.getByLabelText("fan.ort", { exact: false }), {
    target: { value: "Hamburg" },
  });
}

describe("MitgliedWerdenFormular", () => {
  beforeEach(() => {
    navigate.mockReset();
    vi.mocked(api.werdeMitglied).mockReset().mockResolvedValue({ weiter: "/adhesions" });
    vi.mocked(authApi.fetchMe).mockReset().mockResolvedValue({
      id: "u1",
      email: "s@x.de",
      role: "membre",
      langue_preferee: "de",
      statut_membre: "en_attente",
      ist_fan: false,
    });
  });

  it("bleibt gesperrt, bis alle Pflichtfelder gefüllt sind", () => {
    renderWithProviders(<MitgliedWerdenFormular onAbbrechen={vi.fn()} />);
    expect(screen.getByText("fan.mitglied_weiter")).toBeDisabled();
    fuelle();
    expect(screen.getByText("fan.mitglied_weiter")).toBeEnabled();
  });

  it("legt die Fiche an, aktualisiert das Konto und wechselt zur Mitgliedschaft", async () => {
    renderWithProviders(<MitgliedWerdenFormular onAbbrechen={vi.fn()} />);
    fuelle();
    fireEvent.click(screen.getByText("fan.mitglied_weiter"));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/adhesions"));
    expect(vi.mocked(api.werdeMitglied).mock.calls[0][0]).toMatchObject({
      date_naissance: "1990-04-02",
      ville_de: "Hamburg",
    });
    expect(useAuthStore.getState().user?.ist_fan).toBe(false);
  });

  it("zeigt Fehler und ruft Abbrechen auf", async () => {
    vi.mocked(api.werdeMitglied).mockRejectedValueOnce(new Error("x"));
    const abbrechen = vi.fn();
    renderWithProviders(<MitgliedWerdenFormular onAbbrechen={abbrechen} />);
    fuelle();
    fireEvent.click(screen.getByText("fan.mitglied_weiter"));
    expect(await screen.findByText("fan.mitglied_fehler")).toBeInTheDocument();
    fireEvent.click(screen.getByText("fan.abbrechen"));
    expect(abbrechen).toHaveBeenCalled();
  });
});
