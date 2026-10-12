import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as useCotisationsHooks from "../../hooks/useCotisations";
import * as useMembresHooks from "../../hooks/useMembres";
import * as useRbacHooks from "../../hooks/useRbac";
import { renderWithProviders } from "../../test/renderWithProviders";
import type { Zahlungseingang } from "../../types/zahlungseingang";
import ZahlungsImportPage from "./ZahlungsImportPage";

vi.mock("../../hooks/useRbac", async () => {
  const actual = await vi.importActual<typeof useRbacHooks>("../../hooks/useRbac");
  return { ...actual, usePageAccess: vi.fn() };
});
vi.mock("../../hooks/useCotisations", async () => {
  const actual = await vi.importActual<typeof useCotisationsHooks>("../../hooks/useCotisations");
  return {
    ...actual,
    useZahlungseingaenge: vi.fn(),
    useAendereZahlungseingang: vi.fn(),
    useZahlungseingangAktion: vi.fn(),
  };
});
vi.mock("../../hooks/useMembres", async () => {
  const actual = await vi.importActual<typeof useMembresHooks>("../../hooks/useMembres");
  return { ...actual, useMembresList: vi.fn() };
});
vi.mock("../membres/ImportAssistent", () => ({
  default: ({ art }: { art: string }) => <div data-testid="assistent">{art}</div>,
}));

function eingang(teil: Partial<Zahlungseingang> = {}): Zahlungseingang {
  return {
    id: 1,
    datum: "2026-09-28",
    betrag: "45.00",
    mode_paiement: "virement_sepa",
    referenz: "REF-1",
    verwendungszweck: "Beitrag Amira",
    membre: null,
    membre_info: null,
    type_article: "",
    annee: 2026,
    libelle: "",
    status: "offen",
    cotisation: null,
    hinweis: "",
    quelle_datei: "",
    fehlt: ["Mitglied", "Artikel"],
    created_at: "2026-10-01T10:00:00Z",
    ...teil,
  };
}

const aendern = vi.fn();
const aktion = vi.fn();

function einrichten(eintraege: Zahlungseingang[], modifiable = true) {
  vi.mocked(useRbacHooks.usePageAccess).mockReturnValue({
    accessible: true,
    modifiable,
    isLoading: false,
  });
  vi.mocked(useCotisationsHooks.useZahlungseingaenge).mockReturnValue({
    data: { next: null, previous: null, results: eintraege },
    isLoading: false,
    isError: false,
  } as unknown as ReturnType<typeof useCotisationsHooks.useZahlungseingaenge>);
  vi.mocked(useCotisationsHooks.useAendereZahlungseingang).mockReturnValue({
    mutate: aendern,
    isPending: false,
    error: null,
  } as unknown as ReturnType<typeof useCotisationsHooks.useAendereZahlungseingang>);
  vi.mocked(useCotisationsHooks.useZahlungseingangAktion).mockReturnValue({
    mutate: aktion,
    isPending: false,
    error: null,
  } as unknown as ReturnType<typeof useCotisationsHooks.useZahlungseingangAktion>);
  vi.mocked(useMembresHooks.useMembresList).mockReturnValue({
    data: {
      next: null,
      previous: null,
      results: [{ id: "m1", prenom: "Amira", nom: "Ben Ali", email: "amira@example.org" }],
    },
  } as unknown as ReturnType<typeof useMembresHooks.useMembresList>);
}

describe("ZahlungsImportPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("zeigt Assistent und offene Zahlung; Buchen ist gesperrt, solange etwas fehlt", () => {
    einrichten([eingang()]);
    renderWithProviders(<ZahlungsImportPage />);
    expect(screen.getByTestId("assistent")).toHaveTextContent("zahlungen");
    expect(screen.getByText("REF-1")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /buchen|valider/i })).toBeDisabled();
  });

  it("ordnet ein Mitglied zu", () => {
    einrichten([eingang()]);
    renderWithProviders(<ZahlungsImportPage />);
    const suche = screen.getAllByRole("searchbox").find((el) => el.className.includes("w-48"))!;
    fireEvent.change(suche, { target: { value: "Amira" } });
    fireEvent.click(screen.getByRole("button", { name: /Amira Ben Ali/ }));
    expect(aendern).toHaveBeenCalledWith({ id: 1, payload: { membre: "m1" } });
  });

  it("bucht einen vollständigen offenen Eintrag", () => {
    einrichten([
      eingang({
        fehlt: [],
        type_article: "cotisation",
        membre: "m1",
        membre_info: {
          id: "m1",
          numero_membre: "CID-1",
          prenom: "Amira",
          nom: "Ben Ali",
          email: "amira@example.org",
        },
      }),
    ]);
    renderWithProviders(<ZahlungsImportPage />);
    fireEvent.click(screen.getByRole("button", { name: /buchen|valider/i }));
    expect(aktion).toHaveBeenCalledWith({ id: 1, aktion: "buchen" });
  });

  it("blendet Import und Aktionen im Lesemodus aus", () => {
    einrichten([eingang()], false);
    renderWithProviders(<ZahlungsImportPage />);
    expect(screen.queryByTestId("assistent")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /verwerfen|écarter/i })).toBeDisabled();
  });
});
