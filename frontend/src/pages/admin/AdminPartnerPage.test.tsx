import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as usePartnerHooks from "../../hooks/usePartner";
import { useAuthStore } from "../../store/authStore";
import { renderWithProviders } from "../../test/renderWithProviders";
import type { Partner, PartnerKategorie } from "../../types/partner";
import AdminPartnerPage from "./AdminPartnerPage";

vi.mock("../../hooks/usePartner", async () => {
  const actual = await vi.importActual<typeof usePartnerHooks>("../../hooks/usePartner");
  return {
    ...actual,
    usePartnerListe: vi.fn(),
    usePartnerKategorien: vi.fn(),
    useCreerPartner: vi.fn(),
    useCreerKategorie: vi.fn(),
    useAendernKategorie: vi.fn(),
  };
});

const catering: PartnerKategorie = {
  id: "k1",
  nom: "Catering",
  nom_fr: "Restauration",
  actif: true,
};
const druck: PartnerKategorie = { id: "k2", nom: "Druck", nom_fr: "", actif: true };

function partner(extra: Partial<Partner> = {}): Partner {
  return {
    id: "p1",
    nom: "Lecker GmbH",
    typ: "lieferant",
    statut: "aktiv",
    bevorzugt: true,
    kategorien: ["k1"],
    kategorien_namen: ["Catering"],
    logo_url: null,
    hauptkontakt_name: "",
    email: "",
    telefon: "",
    website: "",
    adresse: "",
    code_postal: "",
    ville: "Köln",
    pays: "Deutschland",
    ust_id: "",
    zahlungsziel_tage: null,
    notizen: "",
    bewertung_schnitt: 4.5,
    bewertung_anzahl: 2,
    verknuepfungen_anzahl: 3,
    created_at: "2026-10-01T10:00:00Z",
    updated_at: "2026-10-01T10:00:00Z",
    ...extra,
  };
}

function setzeRolle(role: "rh" | "bureau_admin") {
  useAuthStore.setState({
    accessToken: "a",
    refreshToken: "r",
    isAuthenticated: true,
    user: { id: "u", email: "u@example.com", role, langue_preferee: "de" },
  });
}

function letzterFilter() {
  const aufrufe = vi.mocked(usePartnerHooks.usePartnerListe).mock.calls;
  return aufrufe[aufrufe.length - 1][0];
}

describe("AdminPartnerPage", () => {
  beforeEach(() => {
    vi.mocked(usePartnerHooks.usePartnerListe).mockReturnValue({
      data: [
        partner(),
        partner({
          id: "p2",
          nom: "Druckerei Müller",
          bevorzugt: false,
          kategorien: ["k2"],
          kategorien_namen: ["Druck"],
          bewertung_schnitt: null,
          bewertung_anzahl: 0,
        }),
      ],
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof usePartnerHooks.usePartnerListe>);
    vi.mocked(usePartnerHooks.usePartnerKategorien).mockReturnValue({
      data: [catering, druck],
    } as unknown as ReturnType<typeof usePartnerHooks.usePartnerKategorien>);
    const leer = { mutate: vi.fn(), isPending: false, isError: false };
    vi.mocked(usePartnerHooks.useCreerPartner).mockReturnValue(
      leer as unknown as ReturnType<typeof usePartnerHooks.useCreerPartner>,
    );
    vi.mocked(usePartnerHooks.useCreerKategorie).mockReturnValue(
      leer as unknown as ReturnType<typeof usePartnerHooks.useCreerKategorie>,
    );
    vi.mocked(usePartnerHooks.useAendernKategorie).mockReturnValue(
      leer as unknown as ReturnType<typeof usePartnerHooks.useAendernKategorie>,
    );
    setzeRolle("bureau_admin");
  });

  it("listet Partner mit Kategorien, Ort, Bewertung und Verknüpfungen", () => {
    renderWithProviders(<AdminPartnerPage />);
    expect(screen.getByText("Lecker GmbH")).toBeInTheDocument();
    expect(screen.getByText("Druckerei Müller")).toBeInTheDocument();
    expect(screen.getAllByText("Köln")).toHaveLength(2);
    expect(screen.getByText("4.5")).toBeInTheDocument();
    expect(screen.getByText("noch_keine_bewertung")).toBeInTheDocument();
  });

  it("filtert nach Kategorie, Typ, Mindestnote und bevorzugt", () => {
    renderWithProviders(<AdminPartnerPage />);
    fireEvent.click(screen.getByRole("button", { name: /Catering|Restauration/ }));
    expect(letzterFilter().kategorie).toEqual(["k1"]);
    fireEvent.change(screen.getByLabelText("feld_typ"), { target: { value: "lieferant" } });
    expect(letzterFilter().typ).toBe("lieferant");
    fireEvent.change(screen.getByLabelText("min_note"), { target: { value: "4" } });
    expect(letzterFilter().min_note).toBe(4);
    fireEvent.click(screen.getByLabelText("nur_bevorzugte"));
    expect(letzterFilter().bevorzugt).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: /Catering|Restauration/ }));
    expect(letzterFilter().kategorie).toEqual([]);
  });

  it("zeigt Schreib-Aktionen für Bureau Admin", () => {
    renderWithProviders(<AdminPartnerPage />);
    expect(screen.getByRole("button", { name: "neuer_partner" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "kategorien_verwalten" })).toBeInTheDocument();
  });

  it("blendet Schreib-Aktionen für die Rolle RH aus", () => {
    setzeRolle("rh");
    renderWithProviders(<AdminPartnerPage />);
    expect(screen.queryByRole("button", { name: "neuer_partner" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "kategorien_verwalten" })).not.toBeInTheDocument();
    expect(screen.getByText("nur_lesen")).toBeInTheDocument();
  });

  it("legt einen Partner über das Formular an", () => {
    const mutate = vi.fn();
    vi.mocked(usePartnerHooks.useCreerPartner).mockReturnValue({
      mutate,
      isPending: false,
      isError: false,
    } as unknown as ReturnType<typeof usePartnerHooks.useCreerPartner>);
    renderWithProviders(<AdminPartnerPage />);
    fireEvent.click(screen.getByRole("button", { name: "neuer_partner" }));
    fireEvent.change(screen.getByLabelText("feld_nom"), { target: { value: "Neu AG" } });
    fireEvent.click(screen.getByRole("button", { name: "speichern" }));
    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({ nom: "Neu AG", typ: "partner", zahlungsziel_tage: null }),
      expect.anything(),
    );
  });
});
