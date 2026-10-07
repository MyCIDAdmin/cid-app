import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as usePartnerHooks from "../../hooks/usePartner";
import { useAuthStore } from "../../store/authStore";
import { renderWithProviders } from "../../test/renderWithProviders";
import PartnerAuswahl from "./PartnerAuswahl";

vi.mock("../../hooks/usePartner", async () => {
  const actual = await vi.importActual<typeof usePartnerHooks>("../../hooks/usePartner");
  return { ...actual, usePartnerListe: vi.fn() };
});

function setzeRolle(role: "membre" | "rh") {
  useAuthStore.setState({
    accessToken: "a",
    refreshToken: "r",
    isAuthenticated: true,
    user: { id: "u", email: "u@example.com", role, langue_preferee: "de" },
  });
}

describe("PartnerAuswahl", () => {
  beforeEach(() => {
    vi.mocked(usePartnerHooks.usePartnerListe).mockReturnValue({
      data: [
        { id: "p1", nom: "Druckerei Meier" },
        { id: "p2", nom: "Catering Schmidt" },
      ],
    } as unknown as ReturnType<typeof usePartnerHooks.usePartnerListe>);
  });

  it("ist für Mitglieder unter Rolle RH unsichtbar und lädt keine Liste", () => {
    setzeRolle("membre");
    renderWithProviders(
      <PartnerAuswahl id="x" value="" onChange={() => {}} className="" labelClassName="" />,
    );
    expect(screen.queryByLabelText("auswahl_label")).not.toBeInTheDocument();
    expect(usePartnerHooks.usePartnerListe).toHaveBeenCalledWith({}, false);
  });

  it("meldet gewählten Partner samt Namen", () => {
    setzeRolle("rh");
    const onChange = vi.fn();
    renderWithProviders(
      <PartnerAuswahl id="x" value="" onChange={onChange} className="" labelClassName="" />,
    );
    fireEvent.change(screen.getByLabelText("auswahl_label"), { target: { value: "p2" } });
    expect(onChange).toHaveBeenCalledWith("p2", "Catering Schmidt");
    fireEvent.change(screen.getByLabelText("auswahl_label"), { target: { value: "" } });
    expect(onChange).toHaveBeenLastCalledWith("", null);
  });

  it("zeigt einen nicht mehr gelisteten Partner (z. B. archiviert) weiter an", () => {
    setzeRolle("rh");
    renderWithProviders(
      <PartnerAuswahl
        id="x"
        value="p9"
        aktuellerName="Alte Firma"
        onChange={() => {}}
        className=""
        labelClassName=""
      />,
    );
    expect(screen.getByRole("option", { name: "Alte Firma" })).toBeInTheDocument();
  });
});
