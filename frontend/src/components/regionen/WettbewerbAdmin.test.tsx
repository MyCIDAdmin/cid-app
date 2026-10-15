import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as hooks from "../../hooks/useRegionen";
import { renderWithProviders } from "../../test/renderWithProviders";
import type { WettbewerbSaison } from "../../types/regionen";
import WettbewerbAdmin from "./WettbewerbAdmin";

vi.mock("../../hooks/useRegionen", () => ({
  useSaisonAnlegen: vi.fn(),
  useSaisonAendern: vi.fn(),
  useSaisonLoeschen: vi.fn(),
  useSaisonEinfrieren: vi.fn(),
  usePunkteNachbuchen: vi.fn(),
  useRegelnSpeichern: vi.fn(),
}));

const regeln = {
  punkte_veranstaltung: 50,
  punkte_anwesend: 2,
  max_anwesende: 25,
  punkte_erstteilnehmer: 3,
  punkte_neumitglied: 20,
  max_treffen_monat: 8,
};
const alt: WettbewerbSaison = {
  id: "s0",
  name: "Saison 2025/26",
  start: "2025-09-01",
  ende: "2026-08-31",
  preis: "",
  eingefroren: false,
  laufend: false,
};
const m = {
  anlegen: vi.fn(),
  einfrieren: vi.fn(),
  regeln: vi.fn(),
};

function stub(fn: unknown) {
  return { mutate: fn, isPending: false } as never;
}

describe("WettbewerbAdmin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(hooks.useSaisonAnlegen).mockReturnValue(stub(m.anlegen));
    vi.mocked(hooks.useSaisonAendern).mockReturnValue(stub(vi.fn()));
    vi.mocked(hooks.useSaisonLoeschen).mockReturnValue(stub(vi.fn()));
    vi.mocked(hooks.useSaisonEinfrieren).mockReturnValue(stub(m.einfrieren));
    vi.mocked(hooks.usePunkteNachbuchen).mockReturnValue(stub(vi.fn()));
    vi.mocked(hooks.useRegelnSpeichern).mockReturnValue(stub(m.regeln));
  });

  it("legt eine Saison an", () => {
    renderWithProviders(<WettbewerbAdmin saisons={[]} regeln={regeln} />);
    const knopf = screen.getByText("wettbewerb.saison_anlegen");
    expect(knopf).toBeDisabled();
    fireEvent.change(screen.getByLabelText("wettbewerb.saison_name"), {
      target: { value: " Saison 2026/27 " },
    });
    fireEvent.change(screen.getByLabelText("wettbewerb.saison_start"), {
      target: { value: "2026-09-01" },
    });
    fireEvent.change(screen.getByLabelText("wettbewerb.saison_ende"), {
      target: { value: "2027-08-31" },
    });
    fireEvent.click(knopf);
    expect(m.anlegen).toHaveBeenCalledWith(
      { name: "Saison 2026/27", start: "2026-09-01", ende: "2027-08-31", preis: "" },
      expect.any(Object),
    );
  });

  it("friert eine beendete Saison erst nach Rückfrage ein", () => {
    renderWithProviders(<WettbewerbAdmin saisons={[alt]} regeln={regeln} />);
    fireEvent.click(screen.getByText("wettbewerb.einfrieren"));
    expect(m.einfrieren).not.toHaveBeenCalled();
    expect(screen.getByText("wettbewerb.einfrieren_frage")).toBeInTheDocument();
    fireEvent.click(screen.getByText("wettbewerb.bestaetigen"));
    expect(m.einfrieren).toHaveBeenCalledWith("s0", expect.any(Object));
  });

  it("bietet Einfrieren nicht für laufende oder eingefrorene Saisons an", () => {
    const laufend = { ...alt, id: "s2", ende: "2999-01-01", laufend: true };
    const fertig = { ...alt, id: "s3", eingefroren: true };
    renderWithProviders(<WettbewerbAdmin saisons={[laufend, fertig]} regeln={regeln} />);
    expect(screen.queryByText("wettbewerb.einfrieren")).not.toBeInTheDocument();
    expect(screen.getAllByText("wettbewerb.status_eingefroren")).toHaveLength(1);
  });

  it("speichert die Regeln als Zahlen", () => {
    renderWithProviders(<WettbewerbAdmin saisons={[]} regeln={regeln} />);
    fireEvent.change(screen.getByLabelText("wettbewerb.regel.punkte_anwesend"), {
      target: { value: "4" },
    });
    fireEvent.click(screen.getByText("speichern"));
    expect(m.regeln).toHaveBeenCalledWith({ ...regeln, punkte_anwesend: 4 }, expect.any(Object));
  });
});
