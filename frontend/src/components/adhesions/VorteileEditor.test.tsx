import { fireEvent, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import { renderWithProviders } from "../../test/renderWithProviders";
import type { AvantageOffre } from "../../types/adhesion";
import VorteileEditor from "./VorteileEditor";
import { vorteileFuerSpeichern } from "./vorteile";

function a(ordre: number, text: string, extra: Partial<AvantageOffre> = {}): AvantageOffre {
  return { ordre, texte_fr: text, texte_de: "", texte_ar: "", ...extra };
}

describe("vorteileFuerSpeichern", () => {
  it("kürzt, verwirft leere Zeilen, nummeriert neu und füllt Symbol/Ziel", () => {
    const ergebnis = vorteileFuerSpeichern([
      a(5, "  Shop  ", { icone: "bag", ziel: "shop" }),
      a(6, "   "),
      a(9, "Stimmrecht"),
    ]);
    expect(ergebnis).toEqual([
      { ordre: 1, texte_fr: "Shop", texte_de: "", texte_ar: "", icone: "bag", ziel: "shop" },
      { ordre: 2, texte_fr: "Stimmrecht", texte_de: "", texte_ar: "", icone: "", ziel: "" },
    ]);
  });

  it("lässt Übersetzungen unberührt", () => {
    const [x] = vorteileFuerSpeichern([a(1, "A", { texte_de: "B", texte_ar: "C" })]);
    expect(x).toMatchObject({ texte_de: "B", texte_ar: "C" });
  });
});

function Huelle({ start }: { start: AvantageOffre[] }) {
  const [werte, setWerte] = useState(start);
  return (
    <>
      <VorteileEditor werte={werte} onChange={setWerte} />
      <output data-testid="stand">{JSON.stringify(werte)}</output>
    </>
  );
}

const stand = () => JSON.parse(screen.getByTestId("stand").textContent ?? "[]") as AvantageOffre[];

describe("VorteileEditor", () => {
  it("zeigt bei leerer Liste einen Hinweis und fügt Zeilen hinzu", () => {
    renderWithProviders(<Huelle start={[]} />);
    expect(screen.getByText("vorteile.leer")).toBeInTheDocument();
    fireEvent.click(screen.getByText("vorteile.hinzufuegen"));
    expect(stand()).toEqual([{ ordre: 1, texte_fr: "", icone: "", ziel: "" }]);
  });

  it("ändert Text, Symbol und Ziel einer Zeile", () => {
    renderWithProviders(<Huelle start={[a(1, "Shop")]} />);
    fireEvent.change(screen.getByLabelText("vorteile.text_label 1"), { target: { value: "Neu" } });
    fireEvent.change(screen.getByLabelText("vorteile.symbol_label 1"), {
      target: { value: "ticket" },
    });
    fireEvent.change(screen.getByLabelText("vorteile.ziel_label 1"), {
      target: { value: "tickets" },
    });
    expect(stand()[0]).toMatchObject({ texte_fr: "Neu", icone: "ticket", ziel: "tickets" });
  });

  it("verschiebt und entfernt Zeilen mit neuer Nummerierung", () => {
    renderWithProviders(<Huelle start={[a(1, "A"), a(2, "B"), a(3, "C")]} />);
    fireEvent.click(screen.getByLabelText("vorteile.runter 1"));
    expect(stand().map((x) => [x.ordre, x.texte_fr])).toEqual([
      [1, "B"],
      [2, "A"],
      [3, "C"],
    ]);
    fireEvent.click(screen.getByLabelText("vorteile.entfernen 1"));
    expect(stand().map((x) => [x.ordre, x.texte_fr])).toEqual([
      [1, "A"],
      [2, "C"],
    ]);
  });

  it("sperrt Pfeile an den Rändern", () => {
    renderWithProviders(<Huelle start={[a(1, "A"), a(2, "B")]} />);
    expect(screen.getByLabelText("vorteile.hoch 1")).toBeDisabled();
    expect(screen.getByLabelText("vorteile.runter 2")).toBeDisabled();
  });

  it("zeigt eine Vorschau ohne Links", () => {
    renderWithProviders(<Huelle start={[a(1, "Shop", { ziel: "shop" })]} />);
    expect(screen.getByText("vorteile.vorschau")).toBeInTheDocument();
    expect(screen.queryByRole("link")).toBeNull();
  });
});
