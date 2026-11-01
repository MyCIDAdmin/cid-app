import { fireEvent, render, screen } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { EinfachSchalter, Fachwort, HilfeHinweis } from "./Erklaerung";
import { ladeFinanzTexte } from "./fixtures";

function Beispiel() {
  return (
    <div>
      <EinfachSchalter />
      <HilfeHinweis>Ein Satz zur Hilfe</HilfeHinweis>
      <Fachwort begriff="probelauf" />
    </div>
  );
}

describe("Erklär-Modus", () => {
  beforeAll(ladeFinanzTexte);
  beforeEach(() => window.localStorage.clear());

  it("zeigt Hinweise standardmäßig und blendet sie mit dem Schalter aus", () => {
    render(<Beispiel />);
    expect(screen.getByRole("note")).toHaveTextContent("Ein Satz zur Hilfe");
    fireEvent.click(screen.getByRole("checkbox"));
    expect(screen.queryByRole("note")).not.toBeInTheDocument();
    expect(window.localStorage.getItem("cid.finanzen.einfach")).toBe("aus");
  });

  it("merkt sich die Wahl beim nächsten Öffnen", () => {
    window.localStorage.setItem("cid.finanzen.einfach", "aus");
    render(<Beispiel />);
    expect(screen.queryByRole("note")).not.toBeInTheDocument();
    expect(screen.getByRole("checkbox")).not.toBeChecked();
  });

  it("erklärt ein Fachwort per Klick", () => {
    render(<Beispiel />);
    const wort = screen.getByRole("button", { name: "Essai à blanc" });
    expect(wort).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(wort);
    expect(wort).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText(/Rien n'est enregistré ni verrouillé/)).toBeInTheDocument();
  });
});
