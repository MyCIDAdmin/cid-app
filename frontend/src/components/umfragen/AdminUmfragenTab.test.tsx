import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as hooks from "../../hooks/useUmfragen";
import { renderWithProviders } from "../../test/renderWithProviders";
import { umfrage } from "../../test/umfrageFixture";
import AdminUmfragenTab from "./AdminUmfragenTab";

vi.mock("../../hooks/useUmfragen", async () => {
  const actual = await vi.importActual<typeof hooks>("../../hooks/useUmfragen");
  return {
    ...actual,
    useUmfragen: vi.fn(),
    useUmfrageErstellen: vi.fn(),
    useUmfrageAendern: vi.fn(),
    useUmfrageAktion: vi.fn(),
    useUmfrageLoeschen: vi.fn(),
    useUmfrageBild: vi.fn(),
  };
});

const aktion = vi.fn();

function mut(fn = vi.fn()) {
  return { mutate: fn, mutateAsync: fn, isPending: false };
}

describe("AdminUmfragenTab", () => {
  beforeEach(() => {
    aktion.mockReset();
    vi.mocked(hooks.useUmfragen).mockReturnValue({
      data: [
        umfrage({ id: "a", titel: "Entwurf", veroeffentlicht: false, anzahl_teilnahmen: 0 }),
        umfrage({ id: "b", titel: "Live", anzahl_teilnahmen: 4 }),
      ],
    } as unknown as ReturnType<typeof hooks.useUmfragen>);
    for (const name of [
      "useUmfrageErstellen",
      "useUmfrageAendern",
      "useUmfrageLoeschen",
      "useUmfrageBild",
    ] as const) {
      vi.mocked(hooks[name]).mockReturnValue(mut() as never);
    }
    vi.mocked(hooks.useUmfrageAktion).mockReturnValue(mut(aktion) as never);
  });

  it("veröffentlicht Entwürfe und kündigt veröffentlichte Umfragen an", () => {
    renderWithProviders(<AdminUmfragenTab modifiable />);
    fireEvent.click(screen.getByRole("button", { name: "admin.veroeffentlichen" }));
    expect(aktion).toHaveBeenCalledWith(
      { id: "a", aktion: "veroeffentlichen" },
      expect.any(Object),
    );
    fireEvent.click(screen.getByRole("button", { name: "admin.ankuendigen" }));
    expect(aktion).toHaveBeenCalledWith({ id: "b", aktion: "ankuendigen" }, expect.any(Object));
  });

  it("zeigt Lesenden keine Aktionen", () => {
    renderWithProviders(<AdminUmfragenTab modifiable={false} />);
    expect(
      screen.queryByRole("button", { name: "admin.veroeffentlichen" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "admin.neu" })).toBeDisabled();
  });
});
