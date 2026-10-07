import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as usePartnerHooks from "../../hooks/usePartner";
import { useAuthStore } from "../../store/authStore";
import { renderWithProviders } from "../../test/renderWithProviders";
import type { PartnerDetail } from "../../types/partner";
import PartnerDetailPage from "./PartnerDetailPage";

vi.mock("../../hooks/usePartner", async () => {
  const actual = await vi.importActual<typeof usePartnerHooks>("../../hooks/usePartner");
  return {
    ...actual,
    usePartner: vi.fn(),
    usePartnerKategorien: vi.fn(),
    useAendernPartner: vi.fn(),
    useSetzeArchiv: vi.fn(),
    useVerknuepfen: vi.fn(),
    useLoescheVerknuepfung: vi.fn(),
    useZiele: vi.fn(),
    useBewertungen: vi.fn(),
    useBewerten: vi.fn(),
    useLoescheBewertung: vi.fn(),
  };
});

const detail: PartnerDetail = {
  id: "p1",
  nom: "Lecker GmbH",
  typ: "lieferant",
  statut: "aktiv",
  bevorzugt: false,
  auf_startseite: false,
  kategorien: [],
  kategorien_namen: [],
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
  zahlungsziel_tage: 14,
  notizen: "",
  bewertung_schnitt: 4,
  bewertung_anzahl: 1,
  verknuepfungen_anzahl: 1,
  created_at: "2026-10-01T10:00:00Z",
  updated_at: "2026-10-01T10:00:00Z",
  kontakte: [
    {
      id: "c1",
      partner: "p1",
      name: "Anna Muster",
      funktion: "Vertrieb",
      email: "anna@lecker.de",
      telefon: "",
      hauptkontakt: true,
    },
  ],
  dokumente: [
    {
      id: "d1",
      partner: "p1",
      typ: "vertrag",
      titel: "Rahmenvertrag",
      datei_url: "https://files.example/v.pdf",
      gueltig_bis: "2099-12-31",
      notiz: "",
      hochgeladen_von_name: "Ghazi",
      created_at: "2026-10-01T10:00:00Z",
    },
  ],
  verknuepfungen: [
    {
      id: "v1",
      ziel_typ: "projet",
      ziel_id: "pr1",
      ziel_label: "Sommerfest",
      rolle: "lieferant",
      notiz: "Getränke",
      logo_anzeigen: false,
      created_at: "2026-10-01T10:00:00Z",
    },
  ],
};

function mutation() {
  return { mutate: vi.fn(), isPending: false, isError: false };
}

function setzeRolle(role: "rh" | "bureau_admin") {
  useAuthStore.setState({
    accessToken: "a",
    refreshToken: "r",
    isAuthenticated: true,
    user: { id: "u", email: "u@example.com", role, langue_preferee: "de" },
  });
}

describe("PartnerDetailPage", () => {
  const bewerten = mutation();
  const verknuepfen = mutation();
  const archiv = mutation();

  beforeEach(() => {
    bewerten.mutate.mockClear();
    verknuepfen.mutate.mockClear();
    archiv.mutate.mockClear();
    vi.mocked(usePartnerHooks.usePartner).mockReturnValue({
      data: detail,
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof usePartnerHooks.usePartner>);
    vi.mocked(usePartnerHooks.usePartnerKategorien).mockReturnValue({
      data: [],
    } as unknown as ReturnType<typeof usePartnerHooks.usePartnerKategorien>);
    vi.mocked(usePartnerHooks.useAendernPartner).mockReturnValue(
      mutation() as unknown as ReturnType<typeof usePartnerHooks.useAendernPartner>,
    );
    vi.mocked(usePartnerHooks.useSetzeArchiv).mockReturnValue(
      archiv as unknown as ReturnType<typeof usePartnerHooks.useSetzeArchiv>,
    );
    vi.mocked(usePartnerHooks.useVerknuepfen).mockReturnValue(
      verknuepfen as unknown as ReturnType<typeof usePartnerHooks.useVerknuepfen>,
    );
    vi.mocked(usePartnerHooks.useLoescheVerknuepfung).mockReturnValue(
      mutation() as unknown as ReturnType<typeof usePartnerHooks.useLoescheVerknuepfung>,
    );
    vi.mocked(usePartnerHooks.useZiele).mockReturnValue({
      data: [{ id: "pr2", label: "Weihnachtsmarkt" }],
    } as unknown as ReturnType<typeof usePartnerHooks.useZiele>);
    vi.mocked(usePartnerHooks.useBewertungen).mockReturnValue({
      data: [],
    } as unknown as ReturnType<typeof usePartnerHooks.useBewertungen>);
    vi.mocked(usePartnerHooks.useBewerten).mockReturnValue(
      bewerten as unknown as ReturnType<typeof usePartnerHooks.useBewerten>,
    );
    vi.mocked(usePartnerHooks.useLoescheBewertung).mockReturnValue(
      mutation() as unknown as ReturnType<typeof usePartnerHooks.useLoescheBewertung>,
    );
    setzeRolle("bureau_admin");
  });

  function rendern() {
    return renderWithProviders(<PartnerDetailPage />, {
      route: "/admin/partner/p1",
      path: "/admin/partner/:id",
    });
  }

  it("zeigt Stammdaten und Verknüpfungen", () => {
    rendern();
    expect(screen.getByRole("heading", { name: "Lecker GmbH" })).toBeInTheDocument();
    expect(screen.getByDisplayValue("Köln")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sommerfest" })).toHaveAttribute(
      "href",
      "/projets/pr1",
    );
    expect(screen.getByText("Getränke", { exact: false })).toBeInTheDocument();
  });

  it("verknüpft mit einem Ziel samt Rolle", () => {
    rendern();
    fireEvent.change(screen.getByLabelText("verknuepfung_ziel"), { target: { value: "pr2" } });
    fireEvent.change(screen.getByLabelText("verknuepfung_rolle"), { target: { value: "sponsor" } });
    fireEvent.click(screen.getByRole("button", { name: "verknuepfen" }));
    expect(verknuepfen.mutate).toHaveBeenCalledWith(
      expect.objectContaining({ ziel_typ: "projet", ziel_id: "pr2", rolle: "sponsor" }),
      expect.anything(),
    );
  });

  it("verlangt alle vier Kriterien, bevor bewertet werden kann", () => {
    rendern();
    const speichern = screen.getByRole("button", { name: "bewertung_speichern" });
    expect(speichern).toBeDisabled();
    const kriterien = ["qualitaet", "preis_leistung", "zuverlaessigkeit", "kommunikation"];
    kriterien.slice(0, 3).forEach((k) => {
      fireEvent.click(screen.getAllByRole("radio", { name: `kriterium_${k}: sterne_n` })[3]);
    });
    expect(speichern).toBeDisabled();
    fireEvent.click(screen.getAllByRole("radio", { name: "kriterium_kommunikation: sterne_n" })[4]);
    expect(speichern).toBeEnabled();
    fireEvent.change(screen.getByLabelText("bewertung_kommentar"), { target: { value: "Top" } });
    fireEvent.click(speichern);
    expect(bewerten.mutate).toHaveBeenCalledWith(
      {
        qualitaet: 4,
        preis_leistung: 4,
        zuverlaessigkeit: 4,
        kommunikation: 5,
        kommentar: "Top",
        verknuepfung: null,
      },
      expect.anything(),
    );
  });

  it("archiviert den Partner", () => {
    rendern();
    fireEvent.click(screen.getByRole("button", { name: "archivieren" }));
    expect(archiv.mutate).toHaveBeenCalledWith(true);
  });

  it("ist für die Rolle RH schreibgeschützt", () => {
    setzeRolle("rh");
    rendern();
    expect(screen.queryByRole("button", { name: "archivieren" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "verknuepfen" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "bewertung_speichern" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("feld_nom")).toBeDisabled();
  });
});
