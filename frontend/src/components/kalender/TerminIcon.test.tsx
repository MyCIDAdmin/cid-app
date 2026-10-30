import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { KATEGORIEN } from "../../types/kalender";
import KalenderLegende from "./KalenderLegende";
import { KATEGORIE_ICON, iconFuer } from "../../utils/terminIcon";
import TerminIcon from "./TerminIcon";

describe("TerminIcon", () => {
  it("hat für jede Kategorie ein Icon", () => {
    for (const k of KATEGORIEN) expect(KATEGORIE_ICON[k]).toBeDefined();
  });

  it("nimmt bei Einträgen aus anderen Modulen das Icon der Quelle", () => {
    expect(iconFuer({ kategorie: "frist", quelle: "abstimmung" })).not.toBe(KATEGORIE_ICON.frist);
    expect(iconFuer({ kategorie: "frist", quelle: "termin" })).toBe(KATEGORIE_ICON.frist);
    expect(iconFuer({ kategorie: "veranstaltung", quelle: "event" })).toBe(
      KATEGORIE_ICON.veranstaltung,
    );
  });

  it("rendert ein dekoratives Icon", () => {
    render(<TerminIcon eintrag={{ kategorie: "sitzung", quelle: "termin" }} />);
    expect(screen.getByTestId("termin-icon")).toHaveAttribute("aria-hidden", "true");
  });

  it("zeigt in der Legende alle Terminarten", () => {
    render(<KalenderLegende />);
    expect(screen.getByTestId("kalender-legende").children).toHaveLength(KATEGORIEN.length);
  });
});
