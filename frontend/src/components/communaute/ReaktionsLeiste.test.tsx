import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import ReaktionsLeiste from "./ReaktionsLeiste";

describe("ReaktionsLeiste", () => {
  it("zeigt Chips mit Zähler und markiert die eigene Reaktion", () => {
    render(
      <ReaktionsLeiste
        reaktionen={[
          { emoji: "🔥", anzahl: 4, ich: true },
          { emoji: "👍", anzahl: 1, ich: false },
        ]}
        onReagieren={vi.fn()}
      />,
    );

    expect(screen.getByText("4").closest("button")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("1").closest("button")).toHaveAttribute("aria-pressed", "false");
  });

  it("ein Chip schaltet seine Reaktion um", () => {
    const onReagieren = vi.fn();
    render(
      <ReaktionsLeiste
        reaktionen={[{ emoji: "🔥", anzahl: 4, ich: true }]}
        onReagieren={onReagieren}
      />,
    );

    fireEvent.click(screen.getByText("4"));
    expect(onReagieren).toHaveBeenCalledWith("🔥");
  });

  it("☺ + öffnet die Schnell-Leiste, wählt ein Emoji und schließt sich", () => {
    const onReagieren = vi.fn();
    render(<ReaktionsLeiste reaktionen={[]} onReagieren={onReagieren} />);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("reaktionen.hinzufuegen"));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.click(screen.getByText("😮"));
    expect(onReagieren).toHaveBeenCalledWith("😮");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("bietet das Herz in der Schnell-Leiste (ersetzt das alte Herz der Neuigkeiten)", () => {
    const onReagieren = vi.fn();
    render(<ReaktionsLeiste reaktionen={[]} onReagieren={onReagieren} />);

    fireEvent.click(screen.getByLabelText("reaktionen.hinzufuegen"));
    fireEvent.click(screen.getByText("❤️"));
    expect(onReagieren).toHaveBeenCalledWith("❤️");
  });

  it('"Mehr" zeigt die vollständige Emoji-Auswahl', () => {
    const onReagieren = vi.fn();
    render(<ReaktionsLeiste reaktionen={[]} onReagieren={onReagieren} />);

    fireEvent.click(screen.getByLabelText("reaktionen.hinzufuegen"));
    expect(screen.queryByTestId("emoji-auswahl")).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("reaktionen.mehr"));
    expect(screen.getByTestId("emoji-auswahl")).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: "😀" })[0]);
    expect(onReagieren).toHaveBeenCalledWith("😀");
  });

  it("schließt mit Escape und per Klick daneben", () => {
    render(<ReaktionsLeiste reaktionen={[]} onReagieren={vi.fn()} />);

    fireEvent.click(screen.getByLabelText("reaktionen.hinzufuegen"));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("reaktionen.hinzufuegen"));
    fireEvent.click(screen.getByLabelText("reaktionen.schliessen"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("deaktiviert alle Knöpfe, solange gesperrt", () => {
    render(
      <ReaktionsLeiste
        deaktiviert
        reaktionen={[{ emoji: "🔥", anzahl: 1, ich: false }]}
        onReagieren={vi.fn()}
      />,
    );
    expect(screen.getByText("1").closest("button")).toBeDisabled();
    expect(screen.getByLabelText("reaktionen.hinzufuegen")).toBeDisabled();
  });
});
