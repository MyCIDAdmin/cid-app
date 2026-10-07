import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as usePartnerHooks from "../../hooks/usePartner";
import { renderWithProviders } from "../../test/renderWithProviders";
import type { PartnerKontakt } from "../../types/partner";
import KontaktePanel from "./KontaktePanel";

vi.mock("../../hooks/usePartner", async () => {
  const actual = await vi.importActual<typeof usePartnerHooks>("../../hooks/usePartner");
  return {
    ...actual,
    useCreerKontakt: vi.fn(),
    useAendernKontakt: vi.fn(),
    useLoescheKontakt: vi.fn(),
  };
});

const kontakte: PartnerKontakt[] = [
  {
    id: "c1",
    partner: "p1",
    name: "Anna Muster",
    funktion: "Vertrieb",
    email: "anna@lecker.de",
    telefon: "",
    hauptkontakt: true,
  },
  {
    id: "c2",
    partner: "p1",
    name: "Ben Beispiel",
    funktion: "",
    email: "",
    telefon: "0221 123",
    hauptkontakt: false,
  },
];

function mutation() {
  return { mutate: vi.fn(), isPending: false, isError: false, error: null };
}

describe("KontaktePanel", () => {
  const anlegen = mutation();
  const aendern = mutation();
  const loeschen = mutation();

  beforeEach(() => {
    [anlegen, aendern, loeschen].forEach((m) => m.mutate.mockClear());
    vi.mocked(usePartnerHooks.useCreerKontakt).mockReturnValue(
      anlegen as unknown as ReturnType<typeof usePartnerHooks.useCreerKontakt>,
    );
    vi.mocked(usePartnerHooks.useAendernKontakt).mockReturnValue(
      aendern as unknown as ReturnType<typeof usePartnerHooks.useAendernKontakt>,
    );
    vi.mocked(usePartnerHooks.useLoescheKontakt).mockReturnValue(
      loeschen as unknown as ReturnType<typeof usePartnerHooks.useLoescheKontakt>,
    );
  });

  it("markiert den Hauptkontakt und bietet nur anderen die Festlegung an", () => {
    renderWithProviders(<KontaktePanel partnerId="p1" kontakte={kontakte} schreibbar />);
    expect(screen.getByText("hauptkontakt")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "zum_hauptkontakt_machen" })).toHaveLength(1);
  });

  it("macht einen anderen Kontakt zum Hauptkontakt", () => {
    renderWithProviders(<KontaktePanel partnerId="p1" kontakte={kontakte} schreibbar />);
    const knöpfe = screen.getAllByRole("button", { name: /hauptkontakt/ });
    fireEvent.click(knöpfe[0]);
    expect(aendern.mutate).toHaveBeenCalledWith({ id: "c2", daten: { hauptkontakt: true } });
  });

  it("legt eine neue Ansprechperson an", () => {
    renderWithProviders(<KontaktePanel partnerId="p1" kontakte={[]} schreibbar />);
    expect(screen.getByText("keine_kontakte")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "kontakt_neu" }));
    fireEvent.change(screen.getByLabelText("kontakt_name"), { target: { value: "Cem" } });
    fireEvent.change(screen.getByLabelText("feld_email"), { target: { value: "cem@x.de" } });
    fireEvent.click(screen.getByRole("button", { name: "speichern" }));
    expect(anlegen.mutate).toHaveBeenCalledWith(
      { name: "Cem", funktion: "", email: "cem@x.de", telefon: "" },
      expect.anything(),
    );
  });

  it("löscht eine Ansprechperson", () => {
    renderWithProviders(<KontaktePanel partnerId="p1" kontakte={kontakte} schreibbar />);
    fireEvent.click(screen.getAllByRole("button", { name: /kontakt_entfernen/ })[1]);
    expect(loeschen.mutate).toHaveBeenCalledWith("c2");
  });

  it("ist ohne Schreibrecht nur lesbar", () => {
    renderWithProviders(<KontaktePanel partnerId="p1" kontakte={kontakte} schreibbar={false} />);
    expect(screen.getByText("Anna Muster")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "kontakt_neu" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /kontakt_entfernen/ })).not.toBeInTheDocument();
  });
});
