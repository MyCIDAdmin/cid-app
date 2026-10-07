import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as usePartnerHooks from "../../hooks/usePartner";
import { renderWithProviders } from "../../test/renderWithProviders";
import type { PartnerDokument } from "../../types/partner";
import { tageBis } from "../../utils/partner";
import DokumentePanel from "./DokumentePanel";

vi.mock("../../hooks/usePartner", async () => {
  const actual = await vi.importActual<typeof usePartnerHooks>("../../hooks/usePartner");
  return { ...actual, useLadeDokumentHoch: vi.fn(), useLoescheDokument: vi.fn() };
});

function dok(extra: Partial<PartnerDokument> = {}): PartnerDokument {
  return {
    id: "d1",
    partner: "p1",
    typ: "vertrag",
    titel: "Rahmenvertrag",
    datei_url: "https://files.example/v.pdf",
    gueltig_bis: null,
    notiz: "",
    hochgeladen_von_name: "Ghazi",
    created_at: "2026-10-01T10:00:00Z",
    ...extra,
  };
}

function mutation() {
  return { mutate: vi.fn(), isPending: false, isError: false, error: null };
}

describe("tageBis", () => {
  it("zählt Kalendertage ab heute", () => {
    const heute = new Date(2026, 9, 7, 15, 30);
    expect(tageBis("2026-10-07", heute)).toBe(0);
    expect(tageBis("2026-10-21", heute)).toBe(14);
    expect(tageBis("2026-10-01", heute)).toBe(-6);
  });
});

describe("DokumentePanel", () => {
  const hochladen = mutation();
  const loeschen = mutation();

  beforeEach(() => {
    hochladen.mutate.mockClear();
    loeschen.mutate.mockClear();
    vi.mocked(usePartnerHooks.useLadeDokumentHoch).mockReturnValue(
      hochladen as unknown as ReturnType<typeof usePartnerHooks.useLadeDokumentHoch>,
    );
    vi.mocked(usePartnerHooks.useLoescheDokument).mockReturnValue(
      loeschen as unknown as ReturnType<typeof usePartnerHooks.useLoescheDokument>,
    );
  });

  it("listet Dokumente mit Link und warnt vor baldigem Vertragsende", () => {
    const bald = new Date();
    bald.setDate(bald.getDate() + 10);
    const iso = `${bald.getFullYear()}-${String(bald.getMonth() + 1).padStart(2, "0")}-${String(
      bald.getDate(),
    ).padStart(2, "0")}`;
    renderWithProviders(
      <DokumentePanel partnerId="p1" dokumente={[dok({ gueltig_bis: iso })]} schreibbar />,
    );
    expect(screen.getByRole("link", { name: "Rahmenvertrag" })).toHaveAttribute(
      "href",
      "https://files.example/v.pdf",
    );
    expect(screen.getByText(/in_tagen/)).toBeInTheDocument();
  });

  it("lädt ein Dokument mit Typ und Vertragsende hoch", () => {
    renderWithProviders(<DokumentePanel partnerId="p1" dokumente={[]} schreibbar />);
    expect(screen.getByText("keine_dokumente")).toBeInTheDocument();
    const datei = new File(["%PDF"], "v.pdf", { type: "application/pdf" });
    fireEvent.change(screen.getByLabelText("dokument_titel"), { target: { value: "Vertrag 27" } });
    fireEvent.change(screen.getByLabelText("dokument_datei"), { target: { files: [datei] } });
    fireEvent.change(screen.getByLabelText("vertragsende"), { target: { value: "2027-06-30" } });
    fireEvent.click(screen.getByRole("button", { name: "dokument_hochladen" }));
    expect(hochladen.mutate).toHaveBeenCalledWith(
      { datei, titel: "Vertrag 27", typ: "vertrag", gueltig_bis: "2027-06-30", notiz: undefined },
      expect.anything(),
    );
  });

  it("löscht ein Dokument", () => {
    renderWithProviders(<DokumentePanel partnerId="p1" dokumente={[dok()]} schreibbar />);
    fireEvent.click(screen.getByRole("button", { name: /dokument_entfernen/ }));
    expect(loeschen.mutate).toHaveBeenCalledWith("d1");
  });

  it("zeigt ohne Schreibrecht kein Upload-Formular", () => {
    renderWithProviders(<DokumentePanel partnerId="p1" dokumente={[dok()]} schreibbar={false} />);
    expect(screen.queryByLabelText("dokument_titel")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /dokument_entfernen/ })).not.toBeInTheDocument();
  });
});
