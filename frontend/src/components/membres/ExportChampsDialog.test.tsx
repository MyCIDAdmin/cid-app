import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { ChampExport } from "../../types/membre";
import ExportChampsDialog from "./ExportChampsDialog";

function setup(selection: ChampExport[] = ["prenom", "nom"]) {
  const onToggle = vi.fn();
  const onToutSelectionner = vi.fn();
  const onToutDeselectionner = vi.fn();
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  render(
    <ExportChampsDialog
      open
      selection={selection}
      onToggle={onToggle}
      onToutSelectionner={onToutSelectionner}
      onToutDeselectionner={onToutDeselectionner}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />,
  );
  return { onToggle, onToutSelectionner, onToutDeselectionner, onConfirm, onCancel };
}

describe("ExportChampsDialog", () => {
  it("ne rend rien quand fermée", () => {
    render(
      <ExportChampsDialog
        open={false}
        selection={[]}
        onToggle={vi.fn()}
        onToutSelectionner={vi.fn()}
        onToutDeselectionner={vi.fn()}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("coche uniquement les champs présents dans la sélection", () => {
    setup(["prenom", "nom"]);
    const prenom = screen.getByLabelText("champ.prenom") as HTMLInputElement;
    const email = screen.getByLabelText("champ.email") as HTMLInputElement;
    expect(prenom.checked).toBe(true);
    expect(email.checked).toBe(false);
  });

  it("appelle onToggle au clic sur une case", () => {
    const { onToggle } = setup(["prenom"]);
    fireEvent.click(screen.getByLabelText("champ.email"));
    expect(onToggle).toHaveBeenCalledWith("email");
  });

  it("appelle onToutSelectionner / onToutDeselectionner", () => {
    const { onToutSelectionner, onToutDeselectionner } = setup();
    fireEvent.click(screen.getByText("liste.export_champs_tout_selectionner"));
    fireEvent.click(screen.getByText("liste.export_champs_tout_deselectionner"));
    expect(onToutSelectionner).toHaveBeenCalledTimes(1);
    expect(onToutDeselectionner).toHaveBeenCalledTimes(1);
  });

  it("désactive la confirmation et affiche un avertissement si la sélection est vide", () => {
    setup([]);
    expect(screen.getByText("liste.export_champs_confirmer")).toBeDisabled();
    expect(screen.getByText("liste.export_champs_aucune_selection")).toBeInTheDocument();
  });

  it("appelle onConfirm/onCancel", () => {
    const { onConfirm, onCancel } = setup(["prenom"]);
    fireEvent.click(screen.getByText("liste.export_champs_confirmer"));
    fireEvent.click(screen.getByText("formulaire.annuler"));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
