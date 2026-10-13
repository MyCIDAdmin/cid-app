import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import * as hooks from "../../hooks/useKalender";
import { eintrag } from "../../test/kalenderFixture";
import { renderWithProviders } from "../../test/renderWithProviders";
import OeffentlicherKalenderPage from "./OeffentlicherKalenderPage";

vi.mock("../../hooks/useKalender", async () => {
  const actual = await vi.importActual<typeof hooks>("../../hooks/useKalender");
  return { ...actual, useOeffentlicheEintraege: vi.fn() };
});

describe("OeffentlicherKalenderPage", () => {
  it("zeigt öffentliche Termine und einen Login-Link", () => {
    vi.mocked(hooks.useOeffentlicheEintraege).mockReturnValue({
      data: [eintrag({ titel: "Sommerfest", sichtbarkeit: "oeffentlich" })],
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof hooks.useOeffentlicheEintraege>);
    renderWithProviders(<OeffentlicherKalenderPage />);
    expect(screen.getByText("Sommerfest")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "oeffentlich.anmelden" })).toHaveAttribute(
      "href",
      "/login",
    );
  });

  it("zeigt einen Leerhinweis", () => {
    vi.mocked(hooks.useOeffentlicheEintraege).mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof hooks.useOeffentlicheEintraege>);
    renderWithProviders(<OeffentlicherKalenderPage />);
    expect(screen.getByText("oeffentlich.leer")).toBeInTheDocument();
  });
});
