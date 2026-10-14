import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "../../test/renderWithProviders";
import TeilenPanel from "./TeilenPanel";

describe("TeilenPanel", () => {
  it("kopiert Link und beide Texte", async () => {
    const schreibe = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText: schreibe } });
    renderWithProviders(<TeilenPanel url="https://x/y" texte={{ de: "Hallo", fr: "Salut" }} />);
    const knoepfe = screen.getAllByText("teilen_kopieren");
    expect(knoepfe).toHaveLength(3);
    fireEvent.click(knoepfe[2]);
    await waitFor(() => expect(schreibe).toHaveBeenCalledWith("Salut"));
    expect(await screen.findByText("teilen_kopiert")).toBeInTheDocument();
  });

  it("bleibt still, wenn das Kopieren verweigert wird", async () => {
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error("denied")) },
    });
    renderWithProviders(<TeilenPanel url="https://x/y" texte={{ de: "Hallo", fr: "Salut" }} />);
    fireEvent.click(screen.getAllByText("teilen_kopieren")[0]);
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalled());
    expect(screen.queryByText("teilen_kopiert")).not.toBeInTheDocument();
  });
});
