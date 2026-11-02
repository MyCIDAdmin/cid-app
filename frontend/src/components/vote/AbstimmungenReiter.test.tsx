import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { renderWithProviders } from "../../test/renderWithProviders";
import AbstimmungenReiter from "./AbstimmungenReiter";

describe("AbstimmungenReiter", () => {
  it("zeigt beide Reiter und markiert den aktiven", () => {
    renderWithProviders(<AbstimmungenReiter aktiv="wahlen" />);
    const wahlen = screen.getByText("abstimmungen_reiter.wahlen").closest("a");
    const abstimmungen = screen.getByText("abstimmungen_reiter.abstimmungen").closest("a");
    expect(wahlen).toHaveAttribute("href", "/wahlen");
    expect(wahlen).toHaveAttribute("aria-current", "page");
    expect(abstimmungen).toHaveAttribute("href", "/votes");
    expect(abstimmungen).not.toHaveAttribute("aria-current");
  });
});
