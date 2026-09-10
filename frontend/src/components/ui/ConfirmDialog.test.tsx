import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import ConfirmDialog from "./ConfirmDialog";

describe("ConfirmDialog", () => {
  it("ne rend rien quand open=false", () => {
    const { container } = render(
      <ConfirmDialog
        open={false}
        title="Titre"
        message="Message"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("affiche titre/message et appelle onConfirm / onCancel", () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <ConfirmDialog
        open
        title="Supprimer ce membre ?"
        message="Cette action est irréversible."
        danger
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Supprimer ce membre ?")).toBeInTheDocument();
    expect(screen.getByText("Cette action est irréversible.")).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button")[1]);
    expect(onConfirm).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getAllByRole("button")[0]);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
