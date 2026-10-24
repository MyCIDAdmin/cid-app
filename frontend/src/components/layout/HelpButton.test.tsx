import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useHilfeStore } from "../../store/hilfeStore";
import { renderWithProviders } from "../../test/renderWithProviders";
import HelpButton from "./HelpButton";
import HelpPanel, { AblaufBegleiter } from "./HelpPanel";
import { cleHilfe } from "./helpRoutes";

describe("HelpButton", () => {
  beforeEach(() => {
    useHilfeStore.setState({ offen: false, cle: null, minimiert: false });
  });

  it("ordnet Verwaltungsrouten einem Hilfetext zu", () => {
    expect(cleHilfe("/admin/boutique")).toBe("boutique");
    expect(cleHilfe("/admin/boutique/x")).toBe("boutique");
    expect(cleHilfe("/einlass/veranstaltung/12")).toBe("einlass");
    expect(cleHilfe("/cotisations/en-attente")).toBe("paiements");
    expect(cleHilfe("/cotisations/en-attente", "?tab=import")).toBe("zahlungen_import");
    expect(cleHilfe("/admin/partner")).toBe("partner");
    expect(cleHilfe("/admin/partner/angebote")).toBe("partner");
    expect(cleHilfe("/dashboard")).toBeNull();
  });

  it("ordnet alle Seiten des Moduls Mitglieder der passenden Hilfe zu", () => {
    expect(cleHilfe("/membres")).toBe("membres");
    expect(cleHilfe("/membres/123")).toBe("membres");
    expect(cleHilfe("/membres/nouveau")).toBe("membres");
    expect(cleHilfe("/membres/123/modifier")).toBe("membres");
    expect(cleHilfe("/membres/import")).toBe("membres_import");
    expect(cleHilfe("/membres/zuordnung")).toBe("membres_zuordnung");
  });

  it("ordnet die Regionen-Seiten ihrer Hilfe zu", () => {
    expect(cleHilfe("/support")).toBe("support");
    expect(cleHilfe("/mon-adhesion")).toBe("mitgliedschaft");
    expect(cleHilfe("/votes/creer")).toBe("vote");
    expect(cleHilfe("/live")).toBe("fanclub");
    expect(cleHilfe("/fil")).toBe("fil");
    expect(cleHilfe("/forum/12")).toBe("forum");
    expect(cleHilfe("/groupes/3")).toBe("groupes");
    expect(cleHilfe("/admin/einstellungen")).toBe("zentral");
    expect(cleHilfe("/admin/regionen")).toBe("regionen_struktur");
    expect(cleHilfe("/regionen")).toBe("regionen");
    expect(cleHilfe("/regionen/nord")).toBe("regionen");
    expect(cleHilfe("/regionen/wettbewerb")).toBe("regionen_wettbewerb");
    expect(cleHilfe("/regionen/bericht")).toBe("regionen_bericht");
  });

  it("zeigt den Hilfe-Button auf der Import-Seite und öffnet das Panel", () => {
    renderWithProviders(
      <>
        <HelpButton />
        <HelpPanel />
      </>,
      { route: "/membres/import", path: "/membres/import" },
    );
    fireEvent.click(screen.getByLabelText("bouton"));
    expect(screen.getByRole("complementary")).toBeInTheDocument();
    // Das Panel ist nicht-modal : kein Dialog, kein abgedunkelter Hintergrund.
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("erscheint nicht auf Seiten ohne Hilfetext", () => {
    renderWithProviders(<HelpButton />, { route: "/dashboard", path: "/dashboard" });
    expect(screen.queryByLabelText("bouton")).not.toBeInTheDocument();
  });

  it("schaltet das Panel mit dem Button, dem Kreuz und Escape", () => {
    renderWithProviders(
      <>
        <HelpButton />
        <HelpPanel />
      </>,
      { route: "/admin/events", path: "/admin/events" },
    );
    const knopf = screen.getByLabelText("bouton");
    fireEvent.click(knopf);
    expect(screen.getByRole("complementary")).toBeInTheDocument();
    fireEvent.click(knopf);
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
    fireEvent.click(knopf);
    fireEvent.click(screen.getByLabelText("fermer"));
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
    fireEvent.click(knopf);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
  });

  it("bleibt beim Klick in die Seite offen (nicht-modal)", () => {
    renderWithProviders(
      <>
        <HelpButton />
        <HelpPanel />
        <button type="button">App-Knopf</button>
      </>,
      { route: "/admin/events", path: "/admin/events" },
    );
    fireEvent.click(screen.getByLabelText("bouton"));
    fireEvent.mouseDown(screen.getByText("App-Knopf"));
    fireEvent.click(screen.getByText("App-Knopf"));
    expect(screen.getByRole("complementary")).toBeInTheDocument();
  });

  it("verkleinert das Panel zu einer Leiste und öffnet es wieder", () => {
    renderWithProviders(
      <>
        <HelpButton />
        <HelpPanel />
      </>,
      { route: "/admin/events", path: "/admin/events" },
    );
    fireEvent.click(screen.getByLabelText("bouton"));
    fireEvent.click(screen.getByLabelText("minimieren"));
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("vergroessern"));
    expect(screen.getByRole("complementary")).toBeInTheDocument();
  });
});

describe("AblaufBegleiter", () => {
  const workflow = {
    titre: "Überweisung bestätigen",
    schritte: ["Eingang prüfen", "Bestätigen"],
    beispiel: "Amira zahlt 45 €",
    danach: "Beleg wird erzeugt",
  };

  beforeEach(() => {
    window.localStorage.clear();
  });

  it("zeigt einen Schritt nach dem anderen und merkt sich den Stand", () => {
    const { unmount } = renderWithProviders(
      <AblaufBegleiter cle="paiements" workflow={workflow} onZurueck={vi.fn()} />,
    );
    expect(screen.getByText("Eingang prüfen")).toBeInTheDocument();
    expect(screen.queryByText("Bestätigen")).not.toBeInTheDocument();
    expect(screen.getByText(/Amira zahlt/)).toBeInTheDocument();
    const balken = screen.getByRole("progressbar");
    expect(balken).toHaveAttribute("aria-valuenow", "0");
    fireEvent.click(screen.getByText("erledigt_weiter"));
    expect(screen.getByText("Bestätigen")).toBeInTheDocument();
    expect(balken).toHaveAttribute("aria-valuenow", "1");
    unmount();
    // Nach einem Neuladen geht es beim gemerkten Schritt weiter.
    renderWithProviders(
      <AblaufBegleiter cle="paiements" workflow={workflow} onZurueck={vi.fn()} />,
    );
    expect(screen.getByText("Bestätigen")).toBeInTheDocument();
  });

  it("geht zurück, springt über die Schrittliste und endet mit dem Hinweis danach", () => {
    renderWithProviders(
      <AblaufBegleiter cle="paiements" workflow={workflow} onZurueck={vi.fn()} />,
    );
    fireEvent.click(screen.getByText("erledigt_weiter"));
    fireEvent.click(screen.getByText("zurueck"));
    expect(screen.getByText("Eingang prüfen")).toBeInTheDocument();
    fireEvent.click(screen.getByText("alle_schritte"));
    fireEvent.click(screen.getByText("Bestätigen"));
    fireEvent.click(screen.getByText("fertig"));
    expect(screen.getByText("ablauf_fertig")).toBeInTheDocument();
    expect(screen.getByText(/Beleg wird erzeugt/)).toBeInTheDocument();
    fireEvent.click(screen.getByText("von_vorn"));
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "0");
    expect(screen.queryByText("ablauf_fertig")).not.toBeInTheDocument();
  });

  it("zeigt je Schritt das erwartete Ergebnis, am Ende die Fehlerfälle und den Link zur Karte", () => {
    const karte = {
      ...workflow,
      erwartet: ["Die Zeile ist sichtbar.", "Status „Bezahlt“."],
      fehler: [{ problem: "Zeile fehlt", loesung: "Filter „Alle“ wählen" }],
    };
    renderWithProviders(<AblaufBegleiter cle="paiements" workflow={karte} onZurueck={vi.fn()} />);
    expect(screen.getByText("Die Zeile ist sichtbar.")).toBeInTheDocument();
    expect(screen.queryByText("Status „Bezahlt“.")).not.toBeInTheDocument();
    expect(screen.getByText("Zeile fehlt")).toBeInTheDocument();
    expect(screen.getByText("karte_oeffnen").closest("a")).toHaveAttribute(
      "href",
      "/hilfe/karten?bereich=paiements",
    );
    fireEvent.click(screen.getByText("erledigt_weiter"));
    expect(screen.getByText("Status „Bezahlt“.")).toBeInTheDocument();
  });

  it("ruft onZurueck für die Ablaufliste auf", () => {
    const zurueck = vi.fn();
    renderWithProviders(
      <AblaufBegleiter cle="paiements" workflow={workflow} onZurueck={zurueck} />,
    );
    fireEvent.click(screen.getByText("alle_ablaeufe"));
    expect(zurueck).toHaveBeenCalled();
  });
});
