import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "../../test/renderWithProviders";
import ShareButton from "./ShareButton";

function oeffnen() {
  fireEvent.click(screen.getByLabelText("partage.bouton_aria"));
}

describe("ShareButton", () => {
  const originalShare = navigator.share;
  const originalClipboard = navigator.clipboard;

  afterEach(() => {
    Object.defineProperty(navigator, "share", { value: originalShare, configurable: true });
    Object.defineProperty(navigator, "clipboard", {
      value: originalClipboard,
      configurable: true,
    });
    vi.restoreAllMocks();
  });

  it("öffnet beim Klick ein Fenster mit dem vorgeschlagenen Text, ohne sofort zu teilen", () => {
    const shareMock = vi.fn();
    Object.defineProperty(navigator, "share", { value: shareMock, configurable: true });

    renderWithProviders(
      <ShareButton path="/evenements?evenement=e1" titre="AG Berlin" texte="Le 12 mars" />,
    );
    oeffnen();

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByLabelText("partage.text_label")).toHaveValue("Le 12 mars");
    expect(shareMock).not.toHaveBeenCalled();
  });

  it("teilt über die Systemfunktion mit dem geänderten Text", async () => {
    const shareMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "share", { value: shareMock, configurable: true });

    renderWithProviders(
      <ShareButton path="/evenements?evenement=e1" titre="AG Berlin" texte="Le 12 mars" />,
    );
    oeffnen();
    fireEvent.change(screen.getByLabelText("partage.text_label"), {
      target: { value: "Kommt alle vorbei! Le 12 mars" },
    });
    fireEvent.click(screen.getByText("partage.system_teilen"));

    await waitFor(() => expect(shareMock).toHaveBeenCalledTimes(1));
    expect(shareMock.mock.calls[0][0]).toMatchObject({
      title: "AG Berlin",
      text: "Kommt alle vorbei! Le 12 mars",
    });
    expect(shareMock.mock.calls[0][0].url).toContain("/evenements?evenement=e1");
  });

  it("verwendet den geänderten Text in den Links der Netzwerke", () => {
    Object.defineProperty(navigator, "share", { value: undefined, configurable: true });

    renderWithProviders(<ShareButton path="/fil?publication=p1" titre="Eine Publikation" />);
    oeffnen();
    fireEvent.change(screen.getByLabelText("partage.text_label"), {
      target: { value: "Mein eigener Text" },
    });

    const hrefs = ["partage.whatsapp", "partage.facebook", "partage.x", "partage.email"].map(
      (k) => screen.getByText(k).closest("a")?.getAttribute("href") ?? "",
    );
    hrefs.forEach((h) => expect(decodeURIComponent(h)).toContain("Mein eigener Text"));
    expect(screen.queryByText("partage.system_teilen")).not.toBeInTheDocument();
  });

  it("setzt den Vorschlag beim erneuten Öffnen zurück", () => {
    Object.defineProperty(navigator, "share", { value: undefined, configurable: true });

    renderWithProviders(<ShareButton path="/x" titre="T" texte="Vorschlag" />);
    oeffnen();
    fireEvent.change(screen.getByLabelText("partage.text_label"), { target: { value: "Anders" } });
    fireEvent.click(screen.getByLabelText("partage.schliessen"));
    oeffnen();

    expect(screen.getByLabelText("partage.text_label")).toHaveValue("Vorschlag");
  });

  it("kopiert den Link allein oder Text und Link zusammen", async () => {
    Object.defineProperty(navigator, "share", { value: undefined, configurable: true });
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });

    renderWithProviders(<ShareButton path="/boutique?produit=p1" titre="Maillot" texte="Neu!" />);
    oeffnen();
    fireEvent.click(screen.getByText("partage.copier_lien"));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(writeText.mock.calls[0][0]).toContain("/boutique?produit=p1");
    expect(writeText.mock.calls[0][0]).not.toContain("Neu!");
    expect(await screen.findByText("partage.lien_copie")).toBeInTheDocument();

    fireEvent.click(screen.getByText("partage.copier_text"));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(2));
    expect(writeText.mock.calls[1][0]).toMatch(/^Neu!\n.*\/boutique\?produit=p1$/);
  });

  it("schließt mit Escape und per Klick auf den Hintergrund", () => {
    Object.defineProperty(navigator, "share", { value: undefined, configurable: true });

    renderWithProviders(<ShareButton path="/votes?session=s1" titre="Abstimmung" />);
    oeffnen();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    oeffnen();
    const hintergrund = screen.getByRole("dialog").parentElement as HTMLElement;
    fireEvent.mouseDown(hintergrund);
    fireEvent.click(hintergrund);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("teilt die übergebene Adresse statt des App-Pfads (Beitragsaktionen)", () => {
    Object.defineProperty(navigator, "share", { value: undefined, configurable: true });

    renderWithProviders(
      <ShareButton
        path="/aktion/a1"
        url="https://api.example.org/api/v1/aktionen/a1/teilen/"
        titre="Busfahrt"
      />,
    );
    oeffnen();

    expect(
      screen.getByText(/api\.example\.org\/api\/v1\/aktionen\/a1\/teilen\//),
    ).toBeInTheDocument();
    const wa = screen.getByText("partage.whatsapp").closest("a")?.getAttribute("href") ?? "";
    expect(decodeURIComponent(wa)).toContain("https://api.example.org/api/v1/aktionen/a1/teilen/");
  });

  it("löst keinen Klick der umgebenden Karte aus", () => {
    Object.defineProperty(navigator, "share", { value: undefined, configurable: true });
    const karteKlick = vi.fn();

    renderWithProviders(
      <div onClick={karteKlick}>
        <ShareButton path="/x" titre="T" />
      </div>,
    );
    oeffnen();
    fireEvent.click(screen.getByRole("dialog"));
    fireEvent.click(screen.getByText("partage.copier_lien"));

    expect(karteKlick).not.toHaveBeenCalled();
  });
});
