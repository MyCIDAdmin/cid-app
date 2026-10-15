import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as authApi from "../api/auth";
import * as regionenApi from "../api/regionen";
import { renderWithProviders } from "../test/renderWithProviders";
import FanRegisterPage from "./FanRegisterPage";

vi.mock("../api/auth", async () => {
  const actual = await vi.importActual<typeof authApi>("../api/auth");
  return { ...actual, confirmRegistration: vi.fn(), resendRegistrationCode: vi.fn() };
});
vi.mock("../api/regionen", async () => {
  const actual = await vi.importActual<typeof regionenApi>("../api/regionen");
  return { ...actual, registriereFan: vi.fn(), getFanOptionen: vi.fn() };
});

const OPTIONEN = {
  laender: [
    { code: "HH", name: "Hamburg", region: { slug: "nord", name: "Nord" } },
    { code: "HE", name: "Hessen", region: null },
  ],
  standorte: [
    { id: "s1", name: "Hamburg", land: "HH", region: "Nord" },
    { id: "s2", name: "Köln", land: "NW", region: "NRW" },
  ],
};

function fuelleFormular() {
  fireEvent.input(screen.getByLabelText("register.prenom"), { target: { value: "Sami" } });
  fireEvent.input(screen.getByLabelText("register.nom"), { target: { value: "Ben Ali" } });
  fireEvent.input(screen.getByLabelText("register.email"), { target: { value: "fan@x.de" } });
  fireEvent.input(screen.getByLabelText("register.password"), {
    target: { value: "Passwort123!" },
  });
  fireEvent.input(screen.getByLabelText("register.confirm_password"), {
    target: { value: "Passwort123!" },
  });
}

describe("FanRegisterPage", () => {
  beforeEach(() => {
    vi.mocked(regionenApi.registriereFan).mockReset().mockResolvedValue();
    vi.mocked(regionenApi.getFanOptionen).mockReset().mockResolvedValue(OPTIONEN);
    vi.mocked(authApi.confirmRegistration).mockReset().mockResolvedValue({ message: "ok" });
    vi.mocked(authApi.resendRegistrationCode)
      .mockReset()
      .mockResolvedValue({ message: "neu gesendet" });
  });

  it("verlangt die Einwilligung", async () => {
    renderWithProviders(<FanRegisterPage />);
    fuelleFormular();
    fireEvent.click(screen.getByText("fan.submit"));
    expect(await screen.findByText("register.error_rgpd_requis")).toBeInTheDocument();
    expect(regionenApi.registriereFan).not.toHaveBeenCalled();
  });

  it("zeigt Region zum Bundesland und filtert Standorte", async () => {
    renderWithProviders(<FanRegisterPage />);
    expect(await screen.findByRole("option", { name: "Köln" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("register.land_de"), { target: { value: "HH" } });
    expect(await screen.findByText("fan.region_hinweis")).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Köln" })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("register.land_de"), { target: { value: "HE" } });
    expect(await screen.findByText("fan.ohne_region")).toBeInTheDocument();
  });

  it("meldet an, bestätigt den Code und endet auf der Erfolgsseite", async () => {
    renderWithProviders(<FanRegisterPage />);
    fuelleFormular();
    fireEvent.click(screen.getByLabelText("fan.consentement"));
    fireEvent.click(screen.getByText("fan.submit"));
    await waitFor(() =>
      expect(regionenApi.registriereFan).toHaveBeenCalledWith(
        expect.objectContaining({
          email: "fan@x.de",
          prenom: "Sami",
          consentement_rgpd: true,
          standort: null,
        }),
      ),
    );
    const code = await screen.findByLabelText("register.confirm_code");
    fireEvent.input(code, { target: { value: "123456" } });
    fireEvent.click(screen.getByText("register.confirm_submit"));
    await waitFor(() =>
      expect(authApi.confirmRegistration).toHaveBeenCalledWith("fan@x.de", "123456"),
    );
    expect(await screen.findByText("fan.succes_titre")).toBeInTheDocument();
  });

  it("zeigt Serverfehler und kann den Code erneut senden", async () => {
    vi.mocked(regionenApi.registriereFan).mockRejectedValueOnce(new Error("kaputt"));
    renderWithProviders(<FanRegisterPage />);
    fuelleFormular();
    fireEvent.click(screen.getByLabelText("fan.consentement"));
    fireEvent.click(screen.getByText("fan.submit"));
    expect(await screen.findByText("register.error_generique")).toBeInTheDocument();

    fireEvent.click(screen.getByText("fan.submit"));
    fireEvent.click(await screen.findByText("register.confirm_renvoyer"));
    expect(await screen.findByText("neu gesendet")).toBeInTheDocument();
  });
});
