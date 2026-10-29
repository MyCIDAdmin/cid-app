import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as api from "../../api/reisen";
import ReisenPage from "../../pages/reisen/ReisenPage";
import { meineAngaben, punkt, reise } from "../../test/reisenDaten";
import { renderWithProviders } from "../../test/renderWithProviders";
import { useAuthStore } from "../../store/authStore";
import type { Laenderprofil } from "../../types/reisen";
import ChecklisteTab from "./ChecklisteTab";
import ExportKnoepfe from "./ExportKnoepfe";
import InfosTab from "./InfosTab";
import MeineReiseTab from "./MeineReiseTab";
import SaisonTab from "./SaisonTab";
import SteckbriefeAdmin from "./SteckbriefeAdmin";

vi.mock("../../api/reisen");
vi.mock("../../pages/evenements/CovoituragePage", () => ({ default: () => <div /> }));
vi.mock("../../utils/telechargement", () => ({ declencherTelechargement: vi.fn() }));

const profil: Laenderprofil = {
  id: "p1",
  land: "Algerien",
  einreise: "<p>Visum nötig</p>",
  waehrung: "Dinar",
  zeitverschiebung: "-1 Stunde",
  steckdose: "Typ C/F",
  amtliche_hinweise: "diplo.de",
  weitere_infos: "",
  stand: "2026-10-01",
};

beforeEach(() => {
  vi.mocked(api.listTeilgruppen).mockResolvedValue({ gruppen: [] });
  vi.mocked(api.listUnterkuenfte).mockResolvedValue([]);
  vi.mocked(api.listInfos).mockResolvedValue([]);
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  useAuthStore.setState({ user: null });
});

describe("Checkliste", () => {
  it("zeigt gemeinsame und eigene Punkte und hakt für sich ab", async () => {
    vi.mocked(api.listCheckliste).mockResolvedValue([
      punkt(),
      punkt({ id: "c2", titel: "Powerbank", persoenlich: true, kann_aendern: true }),
    ]);
    renderWithProviders(<ChecklisteTab reise={reise({ voll: true, meine: meineAngaben() })} />);
    fireEvent.click(await screen.findByLabelText("Reisepass prüfen"));
    await waitFor(() => expect(api.setzeChecklisteErledigt).toHaveBeenCalledWith("r1", "c1", true));
    expect(screen.getByLabelText("Powerbank")).toBeInTheDocument();
  });

  it("zeigt der Organisation, wie viele erledigt haben, und markiert Überfälliges", async () => {
    vi.mocked(api.listCheckliste).mockResolvedValue([
      punkt({ erledigt_zahl: 2, gesamt: 5, frist: "2026-01-01", ueberfaellig: true }),
    ]);
    renderWithProviders(<ChecklisteTab reise={reise({ voll: true, kann_verwalten: true })} />);
    expect(await screen.findByTestId("checkliste-zaehler")).toHaveTextContent("checkliste.zaehler");
    expect(screen.getByText(/checkliste.ueberfaellig/)).toBeInTheDocument();
  });

  it("legt einen persönlichen Punkt an, wenn man nicht zur Organisation gehört", async () => {
    vi.mocked(api.listCheckliste).mockResolvedValue([]);
    vi.mocked(api.createCheckliste).mockResolvedValue([]);
    renderWithProviders(<ChecklisteTab reise={reise({ voll: true, meine: meineAngaben() })} />);
    fireEvent.change(await screen.findByLabelText("checkliste.titel"), {
      target: { value: "Ladekabel" },
    });
    fireEvent.click(screen.getByRole("button", { name: "checkliste.hinzufuegen" }));
    await waitFor(() =>
      expect(api.createCheckliste).toHaveBeenCalledWith("r1", {
        titel: "Ladekabel",
        frist: null,
        persoenlich: true,
        teilgruppe: null,
      }),
    );
  });
});

describe("Meine Reise: gemeinsame Anreise", () => {
  it("fragt erst nach der Einwilligung und zeigt dann anonyme Treffer", async () => {
    vi.mocked(api.updateMeine).mockResolvedValue(meineAngaben());
    vi.mocked(api.getGemeinsameAnkunft).mockResolvedValue({
      offen: true,
      gruppen: [
        {
          typ: "ankunft",
          ort: "Tunis",
          tag: "2027-03-10",
          von: "10:00",
          bis: "11:30",
          weitere: 2,
          ich_zugestimmt: false,
          kontakte: [],
        },
      ],
    });
    vi.mocked(api.setzeAnkunftZustimmung).mockResolvedValue({ offen: true, gruppen: [] });
    renderWithProviders(<MeineReiseTab reise={reise({ voll: true, meine: meineAngaben() })} />);
    expect(api.getGemeinsameAnkunft).not.toHaveBeenCalled();
    fireEvent.click(screen.getByLabelText("ankunft.offen"));
    await waitFor(() =>
      expect(api.updateMeine).toHaveBeenCalledWith("r1", { offen_gemeinsame_anreise: true }),
    );
  });

  it("zeigt den Treffer und die Kontakte erst bei beidseitiger Zustimmung", async () => {
    vi.mocked(api.getGemeinsameAnkunft).mockResolvedValue({
      offen: true,
      gruppen: [
        {
          typ: "ankunft",
          ort: "Tunis",
          tag: "2027-03-10",
          von: "10:00",
          bis: "11:30",
          weitere: 2,
          ich_zugestimmt: true,
          kontakte: ["Sami B."],
        },
      ],
    });
    vi.mocked(api.setzeAnkunftZustimmung).mockResolvedValue({ offen: true, gruppen: [] });
    renderWithProviders(
      <MeineReiseTab
        reise={reise({ voll: true, meine: meineAngaben({ offen_gemeinsame_anreise: true }) })}
      />,
    );
    expect(await screen.findByText(/Sami B\./)).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("ankunft.kontakt"));
    await waitFor(() =>
      expect(api.setzeAnkunftZustimmung).toHaveBeenCalledWith(
        "r1",
        { typ: "ankunft", ort: "Tunis", tag: "2027-03-10" },
        false,
      ),
    );
  });

  it("bietet die Freigabe „nur meine Teilgruppe“ an", () => {
    renderWithProviders(<MeineReiseTab reise={reise({ voll: true, meine: meineAngaben() })} />);
    expect(screen.getAllByRole("option", { name: "freigabe.teilgruppe" })).toHaveLength(3);
  });
});

describe("Infos mit Ländersteckbrief", () => {
  it("zeigt den Steckbrief mit Stand, wenn es einen für das Reiseland gibt", async () => {
    renderWithProviders(<InfosTab reise={reise({ voll: true, laenderprofil: profil })} />);
    expect(await screen.findByText("Dinar")).toBeInTheDocument();
    expect(screen.getByText(/Visum nötig/)).toBeInTheDocument();
    expect(screen.getByText(/steckbrief.stand/)).toBeInTheDocument();
  });
});

describe("Saison", () => {
  it("listet Auswärtsspiele mit den Reisen dazu und dem Weg zur Planung", async () => {
    vi.mocked(api.getSaison).mockResolvedValue([
      {
        rencontre: "m1",
        gegner: "ES Tunis",
        competition: "Ligue 1",
        datum: "2027-03-12T18:00:00Z",
        reisen: [],
      },
    ]);
    renderWithProviders(<SaisonTab />);
    const karte = await screen.findByTestId("saison-m1");
    expect(karte).toHaveTextContent("ES Tunis");
    expect(screen.getByText("saison.keine_reise")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "saison.reise_planen" })).toHaveAttribute(
      "href",
      "/reisen/neu?rencontre=m1",
    );
  });
});

describe("Export", () => {
  it("lädt die Namensliste mit dem gewählten Filter", async () => {
    vi.mocked(api.listTeilgruppen).mockResolvedValue({
      gruppen: [{ id: "g1", name: "Zug", anzahl: 2, ich_bin_mitglied: false }],
    });
    vi.mocked(api.exportiere).mockResolvedValue({
      blob: new Blob(["x"]),
      nomFichier: "liste.xlsx",
    });
    renderWithProviders(<ExportKnoepfe reise={reise({ voll: true, kann_verwalten: true })} />);
    await screen.findByRole("option", { name: "Zug" });
    fireEvent.change(screen.getByLabelText("export.filter"), { target: { value: "g:g1" } });
    fireEvent.click(screen.getByRole("button", { name: "export.namensliste" }));
    await waitFor(() =>
      expect(api.exportiere).toHaveBeenCalledWith("r1", "namensliste", { teilgruppe: "g1" }),
    );
  });
});

describe("Ländersteckbriefe", () => {
  it("legt einen Steckbrief an", async () => {
    vi.mocked(api.listLaenderprofile).mockResolvedValue([profil]);
    vi.mocked(api.saveLaenderprofil).mockResolvedValue(profil);
    renderWithProviders(<SteckbriefeAdmin />);
    expect(await screen.findByText("Algerien")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "steckbrief.neu" }));
    fireEvent.change(screen.getByLabelText("steckbrief.land"), { target: { value: "Marokko" } });
    fireEvent.click(screen.getByRole("button", { name: "steckbrief.speichern" }));
    await waitFor(() =>
      expect(api.saveLaenderprofil).toHaveBeenCalledWith(
        expect.objectContaining({ land: "Marokko" }),
        undefined,
      ),
    );
  });

  it("zeigt den Reiter nur dem Bureau", async () => {
    vi.mocked(api.listReisen).mockResolvedValue([]);
    useAuthStore.setState({ user: null });
    const { unmount } = renderWithProviders(<ReisenPage />);
    expect(screen.queryByRole("tab", { name: "tab_steckbriefe" })).not.toBeInTheDocument();
    expect(screen.getByText("saison.titel")).toBeInTheDocument();
    unmount();
  });
});
