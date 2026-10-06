import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { renderWithProviders } from "../../test/renderWithProviders";
import MitgliedsKarte from "./MitgliedsKarte";
import { KARTEN_STILE, kartenStilOderStandard } from "./kartenstile";

describe("MitgliedsKarte", () => {
  it("zeigt Angebot, Name, Nummer und Gültigkeit", () => {
    renderWithProviders(
      <MitgliedsKarte
        stil="gold"
        angebot="CID PLUS"
        name="Amel Bekir"
        mitgliedsnummer="#CA-2026-007"
        mitgliedSeit="2022"
        gueltigBis="31.12.2026"
        kampagne="Kampagne 2026"
      />,
    );
    expect(screen.getByText("CID PLUS")).toBeInTheDocument();
    expect(screen.getByText("Amel Bekir")).toBeInTheDocument();
    expect(screen.getByText("#CA-2026-007")).toBeInTheDocument();
    expect(screen.getByText("31.12.2026")).toBeInTheDocument();
    expect(document.querySelector("[data-kartenstil='gold']")).not.toBeNull();
  });

  it("fällt ohne oder bei unbekanntem Stil auf Rubin zurück", () => {
    expect(kartenStilOderStandard("")).toBe("rubin");
    expect(kartenStilOderStandard(undefined)).toBe("rubin");
    expect(kartenStilOderStandard("neon")).toBe("rubin");
    KARTEN_STILE.forEach((s) => expect(kartenStilOderStandard(s)).toBe(s));
  });
});
