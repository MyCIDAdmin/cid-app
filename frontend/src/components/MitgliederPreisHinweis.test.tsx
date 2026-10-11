import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import deCommon from "../../public/locales/de/common.json";
import frCommon from "../../public/locales/fr/common.json";
import i18n from "../i18n";
import { useAuthStore } from "../store/authStore";
import { mitgliederPreisIstGuenstiger } from "../utils/mitgliederPreis";
import MitgliederPreisHinweis from "./MitgliederPreisHinweis";

// Test-Umgebung lädt keine Übersetzungen (siehe EvenementPreise.test.tsx) : die echten Bundles
// einspeisen ; `fr` ist die Fallback-Sprache. Das `de`-Bundle prüft nur, dass die Schlüssel
// existieren.
beforeAll(() => {
  i18n.addResourceBundle("fr", "common", frCommon, true, true);
});

function zeigen(props: Partial<Parameters<typeof MitgliederPreisHinweis>[0]> = {}) {
  return render(
    <MemoryRouter>
      <MitgliederPreisHinweis mitgliederPreis="12.00" aktuellerPreis="15.00" {...props} />
    </MemoryRouter>,
  );
}

function alsRolle(role: "membre" | "rh") {
  useAuthStore.setState({
    user: { role } as never,
    isAuthenticated: true,
  });
}

afterEach(() => {
  cleanup(); // vor dem Zurücksetzen des Stores, sonst rendert die Komponente außerhalb von act neu
  useAuthStore.setState({ user: null, isAuthenticated: false });
});

describe("MitgliederPreisHinweis", () => {
  it("existiert in beiden Sprachen mit Preis und Ersparnis", () => {
    for (const bundle of [deCommon, frCommon]) {
      expect(bundle.mitgliederpreis.hinweis).toContain("{{preis}}");
      expect(bundle.mitgliederpreis.hinweis).toContain("{{ersparnis}}");
      expect(bundle.mitgliederpreis.cta.length).toBeGreaterThan(0);
    }
  });

  it("zeigt Besuchern den Mitgliederpreis, die Ersparnis und den Link zur Mitgliedschaft", () => {
    zeigen();
    expect(screen.getByTestId("mitglieder-preis-hinweis")).toHaveTextContent(
      "Les membres paient seulement 12,00 € — vous économisez 3,00 €",
    );
    expect(screen.getByRole("link", { name: "Devenir membre" })).toHaveAttribute(
      "href",
      "/mon-adhesion",
    );
  });

  it("zeigt Konten mit Rolle membre (Nicht-Mitglied) den Hinweis", () => {
    alsRolle("membre");
    zeigen();
    expect(screen.getByTestId("mitglieder-preis-hinweis")).toBeInTheDocument();
  });

  it("zeigt Funktionsrollen (RH und höher) keinen Hinweis", () => {
    alsRolle("rh");
    zeigen();
    expect(screen.queryByTestId("mitglieder-preis-hinweis")).not.toBeInTheDocument();
  });

  it.each([
    ["gleicher Preis", "15.00"],
    ["teurer als der aktuelle Preis", "20.00"],
    ["kein Mitgliederpreis (null)", null],
    ["leerer Mitgliederpreis", ""],
  ])("zeigt nichts bei %s", (_titel, mitgliederPreis) => {
    zeigen({ mitgliederPreis });
    expect(screen.queryByTestId("mitglieder-preis-hinweis")).not.toBeInTheDocument();
  });

  it("lässt den Link weg, wenn die Kachel schon als Ganzes verlinkt ist", () => {
    zeigen({ mitLink: false });
    expect(screen.getByTestId("mitglieder-preis-hinweis")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("vergleicht Zahlen, nicht Zeichenketten", () => {
    expect(mitgliederPreisIstGuenstiger("9.50", "10.00")).toBe(true);
    expect(mitgliederPreisIstGuenstiger("10.00", "9.50")).toBe(false);
    expect(mitgliederPreisIstGuenstiger("100.00", "99.00")).toBe(false);
  });
});
