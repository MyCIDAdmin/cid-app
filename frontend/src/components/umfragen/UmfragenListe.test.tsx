import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import * as hooks from "../../hooks/useUmfragen";
import { renderWithProviders } from "../../test/renderWithProviders";
import { umfrage } from "../../test/umfrageFixture";
import UmfragenListe from "./UmfragenListe";

vi.mock("../../hooks/useUmfragen", async () => {
  const actual = await vi.importActual<typeof hooks>("../../hooks/useUmfragen");
  return { ...actual, useUmfragen: vi.fn() };
});

describe("UmfragenListe", () => {
  it("verlinkt jede Umfrage und markiert die Teilnahme", () => {
    vi.mocked(hooks.useUmfragen).mockReturnValue({
      data: [umfrage({ teilgenommen: true })],
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof hooks.useUmfragen>);
    renderWithProviders(<UmfragenListe />);
    expect(screen.getByRole("link")).toHaveAttribute("href", "/umfragen/u1");
    expect(screen.getByText(/status.teilgenommen/)).toBeInTheDocument();
  });

  it("zeigt einen Leerhinweis", () => {
    vi.mocked(hooks.useUmfragen).mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof hooks.useUmfragen>);
    renderWithProviders(<UmfragenListe />);
    expect(screen.getByText("leer")).toBeInTheDocument();
  });
});
