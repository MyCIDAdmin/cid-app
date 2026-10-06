import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { renderWithProviders } from "../../test/renderWithProviders";
import HelpButton, { WorkflowKarte } from "./HelpButton";
import { cleHilfe } from "./helpRoutes";

describe("HelpButton", () => {
  it("ordnet Verwaltungsrouten einem Hilfetext zu", () => {
    expect(cleHilfe("/admin/boutique")).toBe("boutique");
    expect(cleHilfe("/admin/boutique/x")).toBe("boutique");
    expect(cleHilfe("/cotisations/en-attente")).toBe("paiements");
    expect(cleHilfe("/dashboard")).toBeNull();
  });

  it("erscheint nicht auf Seiten ohne Hilfetext", () => {
    renderWithProviders(<HelpButton />, { route: "/dashboard", path: "/dashboard" });
    expect(screen.queryByLabelText("bouton")).not.toBeInTheDocument();
  });

  it("öffnet und schließt den Hilfedialog auf einer Verwaltungsseite", () => {
    renderWithProviders(<HelpButton />, { route: "/admin/events", path: "/admin/events" });
    fireEvent.click(screen.getByLabelText("bouton"));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    // Portal in <body> : die Kopfleiste (backdrop-filter) darf nicht Bezugsrahmen für fixed sein.
    expect(screen.getByRole("dialog").parentElement?.parentElement).toBe(document.body);
    fireEvent.click(screen.getByLabelText("fermer"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

describe("WorkflowKarte", () => {
  const workflow = {
    titre: "Überweisung bestätigen",
    schritte: ["Eingang prüfen", "Bestätigen"],
    beispiel: "Amira zahlt 45 €",
    danach: "Beleg wird erzeugt",
  };

  it("klappt auf, zeigt Beispiel und zählt abgehakte Schritte", () => {
    renderWithProviders(<WorkflowKarte workflow={workflow} />);
    expect(screen.queryByText("Eingang prüfen")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("Überweisung bestätigen"));
    expect(screen.getByText(/Amira zahlt/)).toBeInTheDocument();
    const balken = screen.getByRole("progressbar");
    expect(balken).toHaveAttribute("aria-valuenow", "0");
    fireEvent.click(screen.getAllByRole("checkbox")[0]);
    expect(balken).toHaveAttribute("aria-valuenow", "1");
    fireEvent.click(screen.getByText("zuruecksetzen"));
    expect(balken).toHaveAttribute("aria-valuenow", "0");
  });
});
