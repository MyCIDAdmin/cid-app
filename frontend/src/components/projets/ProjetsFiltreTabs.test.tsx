import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import ProjetsFiltreTabs from "./ProjetsFiltreTabs";

describe("ProjetsFiltreTabs", () => {
  it("affiche les 3 onglets (All/Active/Completed) et signale le changement d'onglet actif", () => {
    const onChange = vi.fn();
    render(<ProjetsFiltreTabs valeur="tous" onChange={onChange} />);

    expect(screen.getByText("filtre.tous")).toBeInTheDocument();
    expect(screen.getByText("filtre.actifs")).toBeInTheDocument();
    expect(screen.getByText("filtre.termines")).toBeInTheDocument();
    expect(screen.getByText("filtre.tous")).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(screen.getByText("filtre.actifs"));

    expect(onChange).toHaveBeenCalledWith("actifs");
  });
});
