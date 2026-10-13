import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import * as hooks from "../../hooks/useKalender";
import { renderWithProviders } from "../../test/renderWithProviders";
import OffeneDienste from "./OffeneDienste";

vi.mock("../../hooks/useKalender", async () => {
  const actual = await vi.importActual<typeof hooks>("../../hooks/useKalender");
  return { ...actual, useOffeneDienste: vi.fn(), useDienstAktion: vi.fn() };
});

describe("OffeneDienste", () => {
  it("listet freie Dienste und trägt ein", () => {
    const eintragen = vi.fn().mockResolvedValue({});
    vi.mocked(hooks.useDienstAktion).mockReturnValue({
      mutateAsync: eintragen,
    } as unknown as ReturnType<typeof hooks.useDienstAktion>);
    vi.mocked(hooks.useOffeneDienste).mockReturnValue({
      data: [
        {
          id: "d1",
          titel: "Kasse",
          termin_titel: "",
          evenement_titel: "Sommerfest",
          beginn: new Date(2026, 10, 1, 18).toISOString(),
          ende: null,
          benoetigt: 2,
          besetzt: 0,
          frei: 2,
          ich_eingetragen: false,
        },
      ],
      isError: false,
    } as unknown as ReturnType<typeof hooks.useOffeneDienste>);
    renderWithProviders(<OffeneDienste />);
    expect(screen.getByText("Kasse")).toBeInTheDocument();
    fireEvent.click(screen.getByText("dienste.eintragen"));
    expect(eintragen).toHaveBeenCalledWith({ id: "d1", aktion: "eintragen" });
  });

  it("rendert nichts ohne freie Dienste", () => {
    vi.mocked(hooks.useOffeneDienste).mockReturnValue({
      data: [],
      isError: false,
    } as unknown as ReturnType<typeof hooks.useOffeneDienste>);
    renderWithProviders(<OffeneDienste />);
    expect(screen.queryByTestId("offene-dienste")).not.toBeInTheDocument();
  });
});
