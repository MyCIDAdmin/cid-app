import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import i18n from "../i18n";
import frMembres from "../../public/locales/fr/membres.json";
import { useFaehigkeitLabel } from "./faehigkeitLabel";

describe("useFaehigkeitLabel", () => {
  it("übersetzt Standard-Fähigkeiten und lässt eigene Einträge unverändert", () => {
    // fallbackLng "fr" (i18n.ts) greift ohne Netzwerk – siehe DashboardPage.test.tsx.
    i18n.addResourceBundle("fr", "membres", frMembres, true, true);
    const { result } = renderHook(() => useFaehigkeitLabel());
    expect(result.current("Webdesign")).toBe("Web design");
    expect(result.current("Erste Hilfe")).toBe("Premiers secours");
    expect(result.current("Origami v2.0")).toBe("Origami v2.0");
    expect(result.current("Mein: Spezial")).toBe("Mein: Spezial");
  });
});
