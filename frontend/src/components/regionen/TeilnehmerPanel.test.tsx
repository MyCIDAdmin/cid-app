import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as hooks from "../../hooks/useRegionen";
import { renderWithProviders } from "../../test/renderWithProviders";
import TeilnehmerPanel from "./TeilnehmerPanel";

vi.mock("../../hooks/useRegionen", () => ({
  useTeilnehmer: vi.fn(),
  useAnwesenheitSetzen: vi.fn(),
}));

const setzen = vi.fn();

function mock(data: unknown) {
  vi.mocked(hooks.useTeilnehmer).mockReturnValue({
    data,
    isLoading: false,
    isError: false,
  } as unknown as ReturnType<typeof hooks.useTeilnehmer>);
  vi.mocked(hooks.useAnwesenheitSetzen).mockReturnValue({
    mutate: setzen,
    isPending: false,
  } as never);
}

describe("TeilnehmerPanel", () => {
  beforeEach(() => vi.clearAllMocks());

  it("hakt Anwesenheit ab, sobald sie möglich ist", () => {
    mock([
      { user: "u1", name: "Mia Muster", anwesend: false },
      { user: "u2", name: "", anwesend: true },
    ]);
    renderWithProviders(<TeilnehmerPanel slug="nord" id="v1" anwesenheitMoeglich />);
    fireEvent.click(screen.getByLabelText("Mia Muster"));
    expect(setzen).toHaveBeenCalledWith(
      { slug: "nord", id: "v1", user: "u1", anwesend: true },
      expect.any(Object),
    );
    expect(screen.getByLabelText("teilnehmer_ohne_name")).toBeChecked();
  });

  it("zeigt vorher nur die Namen ohne Häkchen", () => {
    mock([{ user: "u1", name: "Mia Muster", anwesend: false }]);
    renderWithProviders(<TeilnehmerPanel slug="nord" id="v1" anwesenheitMoeglich={false} />);
    expect(screen.getByText("Mia Muster")).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("zeigt den leeren Zustand", () => {
    mock([]);
    renderWithProviders(<TeilnehmerPanel slug="nord" id="v1" anwesenheitMoeglich={false} />);
    expect(screen.getByText("keine_teilnehmer")).toBeInTheDocument();
  });
});
