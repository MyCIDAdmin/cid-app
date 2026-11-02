import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as boutiqueApi from "../../api/boutique";
import { renderWithProviders } from "../../test/renderWithProviders";
import type { Produit, Reservierung } from "../../types/boutique";
import GestionReservierungenTab from "./GestionReservierungenTab";

vi.mock("../../api/boutique", async () => {
  const actual = await vi.importActual<typeof boutiqueApi>("../../api/boutique");
  return {
    ...actual,
    listReservierungen: vi.fn(),
    listProduits: vi.fn(),
    reservierungAktion: vi.fn(),
  };
});

const eintrag: Reservierung = {
  id: "r1",
  produit: "p1",
  produit_nom: "Spieltag-Ticket",
  variante: null,
  variante_label: "",
  membre: "m1",
  membre_info: { id: "m1", prenom: "Amira", nom: "Ben Ali", email: "amira@example.org" },
  quantite: 2,
  statut: "aktiv",
  bemerkung: "",
  created_at: "2026-10-12T10:00:00Z",
};

describe("GestionReservierungenTab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(boutiqueApi.listProduits).mockResolvedValue({
      next: null,
      previous: null,
      results: [],
    });
    vi.mocked(boutiqueApi.listReservierungen).mockResolvedValue({
      next: null,
      previous: null,
      results: [eintrag],
    });
  });

  const zweite: Reservierung = {
    ...eintrag,
    id: "r2",
    membre: "m2",
    membre_info: { id: "m2", prenom: "Jonas", nom: "Weber", email: "jonas@example.org" },
    quantite: 1,
  };

  const artikel = (over: Record<string, unknown> = {}) =>
    ({
      id: "p1",
      nom: "Spieltag-Ticket",
      reservierung_modus: "nur_reservieren",
      reservierung_frist: null,
      reservierung_max_gesamt: null,
      reservierung_verfuegbar: null,
      ...over,
    }) as unknown as Produit;

  const mitArtikel = (over: Record<string, unknown> = {}) =>
    vi.mocked(boutiqueApi.listProduits).mockResolvedValue({
      next: null,
      previous: null,
      results: [artikel(over)],
    });

  it("listet Reservierungen je Artikel und markiert nach Bestätigung als abgeholt", async () => {
    vi.mocked(boutiqueApi.reservierungAktion).mockResolvedValue(eintrag);
    renderWithProviders(<GestionReservierungenTab />);

    expect(await screen.findByRole("region", { name: "Spieltag-Ticket" })).toBeInTheDocument();
    fireEvent.click(screen.getByText("reservierungen_tab.abholen"));
    expect(boutiqueApi.reservierungAktion).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "reservierungen_tab.blatt.abholen.knopf" }));

    await waitFor(() =>
      expect(boutiqueApi.reservierungAktion).toHaveBeenCalledWith("r1", "abholen"),
    );
  });

  it("gibt eine Reservierung erst nach Bestätigung frei", async () => {
    vi.mocked(boutiqueApi.reservierungAktion).mockResolvedValue(eintrag);
    renderWithProviders(<GestionReservierungenTab />);
    await screen.findByText("Amira Ben Ali");
    fireEvent.click(screen.getByText("reservierungen_tab.stornieren"));
    expect(boutiqueApi.reservierungAktion).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole("button", { name: "reservierungen_tab.blatt.stornieren.knopf" }),
    );
    await waitFor(() =>
      expect(boutiqueApi.reservierungAktion).toHaveBeenCalledWith("r1", "stornieren"),
    );
  });

  it("wendet eine Sammelaktion auf alle angekreuzten Reservierungen an", async () => {
    vi.mocked(boutiqueApi.listReservierungen).mockResolvedValue({
      next: null,
      previous: null,
      results: [eintrag, zweite],
    });
    vi.mocked(boutiqueApi.reservierungAktion).mockResolvedValue(eintrag);
    renderWithProviders(<GestionReservierungenTab />);
    await screen.findByText("Jonas Weber");

    fireEvent.click(screen.getByLabelText("reservierungen_tab.alle_auswaehlen"));
    expect(screen.getByText("reservierungen_tab.ausgewaehlt")).toBeInTheDocument();
    fireEvent.click(screen.getByText("reservierungen_tab.bulk_abholen"));
    fireEvent.click(screen.getByRole("button", { name: "reservierungen_tab.blatt.abholen.knopf" }));

    await waitFor(() => expect(boutiqueApi.reservierungAktion).toHaveBeenCalledTimes(2));
    expect(boutiqueApi.reservierungAktion).toHaveBeenCalledWith("r1", "abholen");
    expect(boutiqueApi.reservierungAktion).toHaveBeenCalledWith("r2", "abholen");
  });

  it("zeigt Fortschritt gegen die Obergrenze", async () => {
    mitArtikel({ reservierung_max_gesamt: 10, reservierung_verfuegbar: 4 });
    renderWithProviders(<GestionReservierungenTab />);
    const balken = await screen.findByRole("progressbar");
    await waitFor(() => expect(balken).toHaveAttribute("aria-valuenow", "6"));
    expect(balken).toHaveAttribute("aria-valuemax", "10");
  });

  it("warnt, wenn die Frist vorbei ist und noch Stück offen sind", async () => {
    mitArtikel({ reservierung_frist: "2020-01-01T10:00:00Z" });
    renderWithProviders(<GestionReservierungenTab />);
    expect(await screen.findByText("reservierungen_tab.offen_nach_frist")).toBeInTheDocument();
    expect(screen.getByText("reservierungen_tab.frist_vorbei")).toBeInTheDocument();
  });

  it("zeigt keine Warnung bei laufender Frist", async () => {
    mitArtikel({ reservierung_frist: "2999-01-01T10:00:00Z" });
    renderWithProviders(<GestionReservierungenTab />);
    await screen.findByText("Amira Ben Ali");
    await waitFor(() =>
      expect(screen.getByText("reservierungen_tab.frist_bis")).toBeInTheDocument(),
    );
    expect(screen.queryByText("reservierungen_tab.offen_nach_frist")).not.toBeInTheDocument();
  });

  it("startet mit dem Artikelfilter aus dem Überblick", async () => {
    renderWithProviders(<GestionReservierungenTab startProdukt="p1" />);
    await screen.findByText("Amira Ben Ali");
    expect(boutiqueApi.listReservierungen).toHaveBeenCalledWith(
      expect.objectContaining({ produit: "p1" }),
    );
  });

  it("sperrt Aktionen und Auswahl im Lesemodus", async () => {
    renderWithProviders(<GestionReservierungenTab modifiable={false} />);
    await screen.findByText("Amira Ben Ali");
    expect(screen.getByText("reservierungen_tab.abholen")).toBeDisabled();
    expect(screen.getByText("reservierungen_tab.stornieren")).toBeDisabled();
    expect(screen.getByLabelText("reservierungen_tab.auswaehlen")).toBeDisabled();
  });
});
