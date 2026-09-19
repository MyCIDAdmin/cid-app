import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "../../test/renderWithProviders";
import ShareButton from "./ShareButton";

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

  it("utilise navigator.share quand disponible, sans ouvrir le menu de secours", async () => {
    const shareMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "share", { value: shareMock, configurable: true });

    renderWithProviders(
      <ShareButton path="/evenements?evenement=e1" titre="AG Berlin" texte="Le 12 mars" />,
    );
    fireEvent.click(screen.getByLabelText("partage.bouton_aria"));

    await waitFor(() =>
      expect(shareMock).toHaveBeenCalledWith(
        expect.objectContaining({ title: "AG Berlin", text: "Le 12 mars" }),
      ),
    );
    expect(shareMock.mock.calls[0][0].url).toContain("/evenements?evenement=e1");
    expect(screen.queryByText("partage.whatsapp")).not.toBeInTheDocument();
  });

  it("ouvre un menu de secours avec les réseaux et le lien quand navigator.share est absent", () => {
    Object.defineProperty(navigator, "share", { value: undefined, configurable: true });

    renderWithProviders(<ShareButton path="/fil?publication=p1" titre="Une publication" />);
    fireEvent.click(screen.getByLabelText("partage.bouton_aria"));

    expect(screen.getByText("partage.whatsapp")).toBeInTheDocument();
    expect(screen.getByText("partage.facebook")).toBeInTheDocument();
    expect(screen.getByText("partage.x")).toBeInTheDocument();
    expect(screen.getByText("partage.email")).toBeInTheDocument();
    expect(screen.getByText("partage.copier_lien")).toBeInTheDocument();
  });

  it("copie le lien dans le presse-papier et confirme brièvement", async () => {
    Object.defineProperty(navigator, "share", { value: undefined, configurable: true });
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });

    renderWithProviders(<ShareButton path="/boutique?produit=p1" titre="Maillot" />);
    fireEvent.click(screen.getByLabelText("partage.bouton_aria"));
    fireEvent.click(screen.getByText("partage.copier_lien"));

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(writeText.mock.calls[0][0]).toContain("/boutique?produit=p1");
    expect(await screen.findByText("partage.lien_copie")).toBeInTheDocument();
  });

  it("ferme le menu de secours au clic extérieur", () => {
    Object.defineProperty(navigator, "share", { value: undefined, configurable: true });

    renderWithProviders(
      <div>
        <ShareButton path="/votes?session=s1" titre="Session de vote" />
        <button type="button">ailleurs</button>
      </div>,
    );
    fireEvent.click(screen.getByLabelText("partage.bouton_aria"));
    expect(screen.getByText("partage.whatsapp")).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByText("ailleurs"));
    expect(screen.queryByText("partage.whatsapp")).not.toBeInTheDocument();
  });
});
