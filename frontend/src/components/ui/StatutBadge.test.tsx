import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import StatutBadge from "./StatutBadge";

describe("StatutBadge", () => {
  it("rend un badge distinct pour chaque statut", () => {
    const { rerender } = render(<StatutBadge statut="actif" />);
    expect(screen.getByText(/actif/i)).toBeInTheDocument();

    rerender(<StatutBadge statut="en_attente" />);
    expect(screen.getByText(/en_attente|attente/i)).toBeInTheDocument();

    rerender(<StatutBadge statut="inactif" />);
    expect(screen.getByText(/inactif/i)).toBeInTheDocument();
  });
});
