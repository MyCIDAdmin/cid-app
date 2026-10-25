import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "../../test/renderWithProviders";
import * as useCotisationsHooks from "../../hooks/useCotisations";
import type { ArticleCatalogue } from "../../types/cotisation";
import AktionDialog from "./AktionDialog";

vi.mock("../ui/RichTextEditor", () => ({
  default: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <textarea aria-label="editor" value={value} onChange={(e) => onChange(e.target.value)} />
  ),
}));

vi.mock("../../hooks/useCotisations", async () => {
  const actual = await vi.importActual<typeof useCotisationsHooks>("../../hooks/useCotisations");
  return { ...actual, useCreerArticleCatalogue: vi.fn(), useModifierArticleCatalogue: vi.fn() };
});

const vorhandene: ArticleCatalogue = {
  id: "a1",
  libelle: "Spende Vereinsheim",
  montant: "10.00",
  actif: true,
  type_fixe: null,
  beschreibung: "<p>Alt</p>",
  dringend: true,
  frist: "2099-01-01",
  zielbetrag: "500.00",
  oeffentlich: true,
  erinnerungen: false,
  betrag_erhoehbar: false,
  gesammelt: "0.00",
  beitragende: 0,
  fortschritt: 0,
  abgelaufen: false,
  created_at: "2026-10-01T10:00:00Z",
  updated_at: "2026-10-01T10:00:00Z",
};

function mutationen(creer = vi.fn(), modifier = vi.fn()) {
  vi.mocked(useCotisationsHooks.useCreerArticleCatalogue).mockReturnValue({
    mutate: creer,
    isPending: false,
  } as unknown as ReturnType<typeof useCotisationsHooks.useCreerArticleCatalogue>);
  vi.mocked(useCotisationsHooks.useModifierArticleCatalogue).mockReturnValue({
    mutate: modifier,
    isPending: false,
  } as unknown as ReturnType<typeof useCotisationsHooks.useModifierArticleCatalogue>);
  return { creer, modifier };
}

describe("AktionDialog", () => {
  beforeEach(() => vi.clearAllMocks());

  it("legt eine neue Aktion mit allen Feldern an", () => {
    const { creer } = mutationen();
    renderWithProviders(<AktionDialog onClose={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("catalogue_articles.champ_libelle"), {
      target: { value: "Busfahrt Finale" },
    });
    fireEvent.change(screen.getByLabelText("catalogue_articles.champ_montant"), {
      target: { value: "15" },
    });
    fireEvent.change(screen.getByLabelText("editor"), { target: { value: "<p>Text</p>" } });
    fireEvent.change(screen.getByLabelText("aktion.dialog.frist"), {
      target: { value: "2099-05-01" },
    });
    fireEvent.change(screen.getByLabelText("aktion.dialog.zielbetrag"), {
      target: { value: "300" },
    });
    fireEvent.click(screen.getByLabelText(/^aktion\.dialog\.dringend(?!_)/));
    fireEvent.click(screen.getByLabelText(/^aktion\.dialog\.erinnerungen(?!_)/));
    fireEvent.click(screen.getByText("catalogue_articles.enregistrer"));

    expect(creer).toHaveBeenCalledTimes(1);
    expect(creer.mock.calls[0][0]).toEqual({
      libelle: "Busfahrt Finale",
      montant: "15",
      beschreibung: "<p>Text</p>",
      dringend: true,
      frist: "2099-05-01",
      zielbetrag: "300",
      oeffentlich: false,
      erinnerungen: true,
      betrag_erhoehbar: false,
    });
  });

  it("lehnt Erinnerungen ohne Frist und Zielbetrag ab", () => {
    const { creer } = mutationen();
    renderWithProviders(<AktionDialog onClose={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("catalogue_articles.champ_libelle"), {
      target: { value: "X" },
    });
    fireEvent.change(screen.getByLabelText("catalogue_articles.champ_montant"), {
      target: { value: "5" },
    });
    fireEvent.click(screen.getByLabelText(/^aktion\.dialog\.erinnerungen(?!_)/));
    fireEvent.click(screen.getByText("catalogue_articles.enregistrer"));

    expect(creer).not.toHaveBeenCalled();
    expect(screen.getByText("aktion.dialog.fehler_erinnerung_ohne_ziel")).toBeInTheDocument();
  });

  it("bearbeitet eine vorhandene Aktion und sendet leere Felder als null", () => {
    const { modifier } = mutationen();
    renderWithProviders(<AktionDialog article={vorhandene} onClose={vi.fn()} />);

    expect(screen.getByLabelText("catalogue_articles.champ_libelle")).toHaveValue(
      "Spende Vereinsheim",
    );
    fireEvent.change(screen.getByLabelText("aktion.dialog.frist"), { target: { value: "" } });
    fireEvent.change(screen.getByLabelText("aktion.dialog.zielbetrag"), { target: { value: "" } });
    fireEvent.click(screen.getByText("catalogue_articles.enregistrer"));

    expect(modifier).toHaveBeenCalledTimes(1);
    const aufruf = modifier.mock.calls[0][0];
    expect(aufruf.id).toBe("a1");
    expect(aufruf.payload).toMatchObject({ frist: null, zielbetrag: null, dringend: true });
  });

  it("schließt mit Escape", () => {
    mutationen();
    const onClose = vi.fn();
    renderWithProviders(<AktionDialog onClose={onClose} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("sendet den Schalter für den Mindestbetrag und benennt das Betragsfeld um", () => {
    const { creer } = mutationen();
    renderWithProviders(<AktionDialog onClose={vi.fn()} />);

    expect(screen.getByLabelText("catalogue_articles.champ_montant")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText(/^aktion\.dialog\.betrag_erhoehbar(?!_)/));
    expect(screen.getByLabelText("aktion.dialog.mindestbetrag")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("catalogue_articles.champ_libelle"), {
      target: { value: "Spendenaktion" },
    });
    fireEvent.change(screen.getByLabelText("aktion.dialog.mindestbetrag"), {
      target: { value: "10" },
    });
    fireEvent.click(screen.getByText("catalogue_articles.enregistrer"));

    expect(creer.mock.calls[0][0]).toMatchObject({ betrag_erhoehbar: true, montant: "10" });
  });
});
