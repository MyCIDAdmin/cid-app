import { fireEvent, screen } from "@testing-library/react";
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

  describe("Rückseite mit Vorteilen", () => {
    const vorteile = [
      { ordre: 1, texte_fr: "Mitgliederpreis im Shop", texte_de: "", texte_ar: "", icone: "bag" },
      { ordre: 2, texte_fr: "Stimmrecht", texte_de: "", texte_ar: "" },
    ];

    it("ist ohne Vorteile nicht drehbar", () => {
      renderWithProviders(<MitgliedsKarte stil="gold" angebot="CID PLUS" name="Amel Bekir" />);
      expect(screen.queryByRole("button")).toBeNull();
      expect(document.querySelector("[data-rueckseite]")).toBeNull();
    });

    it("dreht sich per Knopf um und zurück", () => {
      renderWithProviders(
        <MitgliedsKarte stil="gold" angebot="CID PLUS" name="Amel Bekir" vorteile={vorteile} />,
      );
      const knopf = screen.getByRole("button", { name: "karte.umdrehen" });
      expect(knopf).toHaveAttribute("aria-pressed", "false");
      const rueck = document.querySelector("[data-rueckseite]") as HTMLElement;
      expect(rueck).toHaveAttribute("aria-hidden", "true");
      expect(screen.getByText("Mitgliederpreis im Shop")).toBeInTheDocument();

      fireEvent.click(knopf);
      expect(screen.getByRole("button", { name: "karte.umdrehen_zurueck" })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      expect(rueck).toHaveAttribute("aria-hidden", "false");

      fireEvent.click(screen.getByRole("button", { name: "karte.umdrehen_zurueck" }));
      expect(rueck).toHaveAttribute("aria-hidden", "true");
    });

    it("zeigt höchstens fünf Vorteile und zählt den Rest", () => {
      const viele = Array.from({ length: 8 }, (_, i) => ({
        ordre: i + 1,
        texte_fr: `Vorteil ${i + 1}`,
        texte_de: "",
        texte_ar: "",
      }));
      renderWithProviders(
        <MitgliedsKarte stil="rubin" angebot="CID PLUS" name="Amel Bekir" vorteile={viele} />,
      );
      expect(screen.getByText("Vorteil 5")).toBeInTheDocument();
      expect(screen.queryByText("Vorteil 6")).toBeNull();
      expect(screen.getByText("karte.mehr_vorteile")).toBeInTheDocument();
    });
  });

  describe("QR-Code", () => {
    const qr = "data:image/png;base64,AAAA";

    it("zeigt den QR auf der Rückseite", () => {
      renderWithProviders(<MitgliedsKarte stil="gold" angebot="CID PLUS" name="Amel" qr={qr} />);
      const bild = document.querySelector("[data-rueckseite] img[data-qr]") as HTMLImageElement;
      expect(bild).not.toBeNull();
      expect(bild.getAttribute("src")).toBe(qr);
      expect(bild).toHaveAttribute("alt", "karte.qr_alt");
    });

    it("ist mit QR auch ohne Vorteile drehbar", () => {
      renderWithProviders(<MitgliedsKarte stil="gold" angebot="CID PLUS" name="Amel" qr={qr} />);
      const knopf = screen.getByRole("button", { name: "karte.umdrehen" });
      fireEvent.click(knopf);
      expect(screen.getByRole("button", { name: "karte.umdrehen_zurueck" })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
    });

    it("zeigt ohne QR und ohne Vorteile weder Knopf noch Rückseite", () => {
      renderWithProviders(<MitgliedsKarte stil="gold" angebot="CID PLUS" name="Amel" />);
      expect(screen.queryByRole("button")).toBeNull();
      expect(document.querySelector("img[data-qr]")).toBeNull();
    });
  });
});
