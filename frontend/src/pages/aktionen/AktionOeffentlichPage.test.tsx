import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "../../test/renderWithProviders";
import * as useAktionenHooks from "../../hooks/useAktionen";
import { useAuthStore } from "../../store/authStore";
import type { AktionOeffentlich } from "../../types/cotisation";
import AktionOeffentlichPage from "./AktionOeffentlichPage";

vi.mock("../../hooks/useAktionen", () => ({ useAktionOeffentlich: vi.fn() }));

const aktion: AktionOeffentlich = {
  id: "abc",
  titel: "Busfahrt zum Finale",
  beschreibung: "<p>Wir brauchen <strong>Unterstützung</strong>.</p>",
  betrag: "15.00",
  frist: "2099-06-01",
  abgelaufen: false,
  dringend: true,
  zielbetrag: "300.00",
  gesammelt: "120.00",
  beitragende: 6,
  fortschritt: 40,
};

function zeige(data: Partial<ReturnType<typeof useAktionenHooks.useAktionOeffentlich>>) {
  vi.mocked(useAktionenHooks.useAktionOeffentlich).mockReturnValue(
    data as ReturnType<typeof useAktionenHooks.useAktionOeffentlich>,
  );
}

function rendern() {
  return renderWithProviders(<AktionOeffentlichPage />, {
    route: "/aktion/abc",
    path: "/aktion/:id",
  });
}

describe("AktionOeffentlichPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({ user: null, isAuthenticated: false });
  });

  it("zeigt Titel, Beschreibung, Fortschritt und den Beitragen-Link", () => {
    zeige({ data: aktion, isLoading: false, isError: false });
    rendern();
    expect(screen.getByRole("heading", { name: "Busfahrt zum Finale" })).toBeInTheDocument();
    expect(screen.getByText("Unterstützung")).toBeInTheDocument();
    expect(screen.getByText("40 %")).toBeInTheDocument();
    const link = screen.getByText(/aktion.oeffentlich.beitragen/).closest("a");
    expect(link).toHaveAttribute("href", "/cotisation?aktion=abc");
    expect(screen.getByText("aktion.oeffentlich.login_hinweis")).toBeInTheDocument();
  });

  it("entfernt Skripte aus der Beschreibung", () => {
    zeige({
      data: { ...aktion, beschreibung: "<p>Hallo</p><script>window.hack=1</script>" },
      isLoading: false,
      isError: false,
    });
    const { container } = rendern();
    expect(container.querySelector("script")).toBeNull();
    expect(screen.getByText("Hallo")).toBeInTheDocument();
  });

  it("zeigt bei abgelaufener Aktion keinen Beitragen-Button", () => {
    zeige({ data: { ...aktion, abgelaufen: true }, isLoading: false, isError: false });
    rendern();
    expect(screen.getByText("aktion.oeffentlich.beendet")).toBeInTheDocument();
    expect(screen.queryByText(/aktion.oeffentlich.beitragen/)).not.toBeInTheDocument();
  });

  it("zeigt einen Hinweis, wenn die Aktion nicht öffentlich ist", () => {
    zeige({ data: undefined, isLoading: false, isError: true });
    rendern();
    expect(screen.getByTestId("aktion-nicht-gefunden")).toBeInTheDocument();
  });
});
