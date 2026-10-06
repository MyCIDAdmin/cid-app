import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "../../test/renderWithProviders";
import BelegButton from "./BelegButton";

vi.mock("../../utils/telechargement", () => ({ declencherTelechargement: vi.fn() }));

describe("BelegButton", () => {
  it("lädt den Beleg und löst den Download aus", async () => {
    const { declencherTelechargement } = await import("../../utils/telechargement");
    const holen = vi.fn().mockResolvedValue(new Blob(["pdf"]));
    renderWithProviders(<BelegButton holen={holen} dateiname="beleg.pdf" />);
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() => expect(declencherTelechargement).toHaveBeenCalled());
    expect(holen).toHaveBeenCalledOnce();
  });

  it("zeigt eine Fehlermeldung, wenn der Beleg fehlt", async () => {
    const holen = vi.fn().mockRejectedValue(new Error("nein"));
    renderWithProviders(<BelegButton holen={holen} dateiname="beleg.pdf" />);
    fireEvent.click(screen.getByRole("button"));
    expect(await screen.findByText(/./, { selector: "span.text-status-dangerText" })).toBeVisible();
  });
});
