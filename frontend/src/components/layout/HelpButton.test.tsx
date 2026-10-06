import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { renderWithProviders } from "../../test/renderWithProviders";
import HelpButton from "./HelpButton";
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
