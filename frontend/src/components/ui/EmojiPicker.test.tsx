import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "../../test/renderWithProviders";
import EmojiPicker from "./EmojiPicker";

describe("EmojiPicker", () => {
  it("ouvre la grille au clic et n'affiche rien avant", () => {
    renderWithProviders(<EmojiPicker onSelect={vi.fn()} />);

    expect(screen.queryByText("😀")).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("emoji.bouton_aria"));
    expect(screen.getByText("😀")).toBeInTheDocument();
  });

  it("appelle onSelect avec l'emoji choisi puis referme la grille", () => {
    const onSelect = vi.fn();
    renderWithProviders(<EmojiPicker onSelect={onSelect} />);

    fireEvent.click(screen.getByLabelText("emoji.bouton_aria"));
    fireEvent.click(screen.getByText("🔥"));

    expect(onSelect).toHaveBeenCalledWith("🔥");
    expect(screen.queryByText("😀")).not.toBeInTheDocument();
  });

  it("ferme la grille au clic extérieur (même principe que ShareButton)", () => {
    renderWithProviders(
      <div>
        <EmojiPicker onSelect={vi.fn()} />
        <button type="button">Ailleurs</button>
      </div>,
    );

    fireEvent.click(screen.getByLabelText("emoji.bouton_aria"));
    expect(screen.getByText("😀")).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByText("Ailleurs"));
    expect(screen.queryByText("😀")).not.toBeInTheDocument();
  });
});
