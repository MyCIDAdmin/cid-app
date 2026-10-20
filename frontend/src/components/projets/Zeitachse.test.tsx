import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { Meilenstein } from "../../types/projets";
import Zeitachse from "./Zeitachse";

function m(id: string, faellig: string | null, erledigt = false): Meilenstein {
  return {
    id,
    projet: "p",
    projet_titel: "P",
    titel: `M ${id}`,
    beschreibung: "",
    faellig_am: faellig,
    erledigt,
    erledigt_am: erledigt ? faellig : null,
    ueberfaellig: false,
    ordre: 0,
    created_at: "2026-01-01T00:00:00Z",
  };
}

describe("Zeitachse", () => {
  it("rendert nichts ohne Beginn oder Ende", () => {
    const { container } = render(<Zeitachse beginn={null} ende="2031-01-01" meilensteine={[]} />);

    expect(container).toBeEmptyDOMElement();
  });

  it("rendert nichts, wenn das Ende nicht nach dem Beginn liegt", () => {
    const { container } = render(
      <Zeitachse beginn="2031-01-01" ende="2031-01-01" meilensteine={[]} />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("platziert Meilensteine proportional zwischen Beginn und Ende", () => {
    render(
      <Zeitachse
        beginn="2026-01-01"
        ende="2028-01-01"
        meilensteine={[m("a", "2027-01-01", true), m("b", "2028-01-01"), m("c", null)]}
        heute={new Date("2026-06-01")}
      />,
    );

    const punkte = document.querySelectorAll("[data-erledigt]");
    expect(punkte).toHaveLength(2); // ohne Datum kein Punkt
    const mitte = parseFloat((punkte[0] as HTMLElement).style.left);
    expect(mitte).toBeGreaterThan(49);
    expect(mitte).toBeLessThan(51);
    expect((punkte[0] as HTMLElement).dataset.erledigt).toBe("true");
    expect((punkte[1] as HTMLElement).style.left).toBe("100%");
    expect(screen.getByTestId("zeitachse")).toBeInTheDocument();
  });

  it("zeichnet die Heute-Marke nur innerhalb des Zeitraums", () => {
    const { rerender } = render(
      <Zeitachse
        beginn="2026-01-01"
        ende="2028-01-01"
        meilensteine={[]}
        heute={new Date("2026-06-01")}
      />,
    );
    expect(document.querySelector(".bg-status-dangerText")).toBeInTheDocument();

    rerender(
      <Zeitachse
        beginn="2026-01-01"
        ende="2028-01-01"
        meilensteine={[]}
        heute={new Date("2030-01-01")}
      />,
    );
    expect(document.querySelector(".bg-status-dangerText")).not.toBeInTheDocument();
  });
});
