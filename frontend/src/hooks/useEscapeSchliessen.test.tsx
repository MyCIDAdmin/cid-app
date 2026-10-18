import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import ConfirmDialog from "../components/ui/ConfirmDialog";
import { hintergrundKlick, useEscapeSchliessen } from "./useEscapeSchliessen";

function klick(el: Element) {
  fireEvent.mouseDown(el);
  fireEvent.mouseUp(el);
  fireEvent.click(el);
}

function Fenster({ name, onClose }: { name: string; onClose: () => void }) {
  useEscapeSchliessen(onClose);
  return <div role="dialog" aria-label={name} />;
}

function Huelle({ onClose }: { onClose: () => void }) {
  return (
    <div data-testid="hintergrund" {...hintergrundKlick(onClose)}>
      <button type="button">innen</button>
    </div>
  );
}

describe("useEscapeSchliessen", () => {
  it("schließt mit Escape", () => {
    const zu = vi.fn();
    render(<Fenster name="a" onClose={zu} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(zu).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(document, { key: "Enter" });
    expect(zu).toHaveBeenCalledTimes(1);
  });

  it("schließt nur das oberste Fenster", () => {
    const unten = vi.fn();
    const oben = vi.fn();
    render(
      <>
        <Fenster name="unten" onClose={unten} />
        <Fenster name="oben" onClose={oben} />
      </>,
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(oben).toHaveBeenCalledTimes(1);
    expect(unten).not.toHaveBeenCalled();
  });

  it("reagiert nach dem Schließen nicht mehr", () => {
    const zu = vi.fn();
    const { unmount } = render(<Fenster name="a" onClose={zu} />);
    unmount();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(zu).not.toHaveBeenCalled();
  });
});

describe("hintergrundKlick", () => {
  it("schließt bei Klick auf den Hintergrund, nicht bei Klick im Fenster", () => {
    const zu = vi.fn();
    render(<Huelle onClose={zu} />);
    klick(screen.getByText("innen"));
    expect(zu).not.toHaveBeenCalled();
    klick(screen.getByTestId("hintergrund"));
    expect(zu).toHaveBeenCalledTimes(1);
  });

  it("schließt nicht, wenn das Drücken im Fenster begann", () => {
    const zu = vi.fn();
    render(<Huelle onClose={zu} />);
    fireEvent.mouseDown(screen.getByText("innen"));
    fireEvent.click(screen.getByTestId("hintergrund"));
    expect(zu).not.toHaveBeenCalled();
  });
});

describe("ConfirmDialog", () => {
  it("bricht mit Escape und Klick außerhalb ab", () => {
    const abbruch = vi.fn();
    render(
      <ConfirmDialog
        open
        title="Löschen?"
        message="Sicher?"
        onConfirm={vi.fn()}
        onCancel={abbruch}
      />,
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(abbruch).toHaveBeenCalledTimes(1);
    klick(screen.getByRole("dialog"));
    expect(abbruch).toHaveBeenCalledTimes(2);
    klick(screen.getByText("Sicher?"));
    expect(abbruch).toHaveBeenCalledTimes(2);
  });

  it("reagiert nicht, solange er geschlossen ist", () => {
    const abbruch = vi.fn();
    render(
      <ConfirmDialog open={false} title="x" message="y" onConfirm={vi.fn()} onCancel={abbruch} />,
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(abbruch).not.toHaveBeenCalled();
  });
});
