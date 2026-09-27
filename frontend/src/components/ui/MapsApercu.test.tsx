import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { renderWithProviders } from "../../test/renderWithProviders";
import MapsApercu from "./MapsApercu";

describe("MapsApercu", () => {
  it("affiche l'adresse et une vignette d'aperçu générée depuis le texte", () => {
    renderWithProviders(<MapsApercu adresse="Alexanderplatz, Berlin" />);
    expect(screen.getByText("Alexanderplatz, Berlin")).toBeInTheDocument();
    const iframe = screen.getByTitle("Alexanderplatz, Berlin");
    expect(iframe).toHaveAttribute(
      "src",
      "https://www.google.com/maps?q=Alexanderplatz%2C%20Berlin&output=embed",
    );
  });

  it("affiche un lien vers l'URL Maps fournie par l'admin, sans l'utiliser pour la vignette", () => {
    renderWithProviders(
      <MapsApercu adresse="Alexanderplatz, Berlin" mapsUrl="https://share.google/abc123" />,
    );
    expect(screen.getByText("maps.ouvrir").closest("a")).toHaveAttribute(
      "href",
      "https://share.google/abc123",
    );
    expect(screen.getByTitle("Alexanderplatz, Berlin")).toHaveAttribute(
      "src",
      expect.stringContaining("q=Alexanderplatz"),
    );
  });

  it("ne rend rien sans adresse", () => {
    const { container } = renderWithProviders(<MapsApercu adresse="" mapsUrl="https://x.test" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("n'affiche pas de lien externe quand aucune URL Maps n'est fournie", () => {
    renderWithProviders(<MapsApercu adresse="Alexanderplatz, Berlin" />);
    expect(screen.queryByText("maps.ouvrir")).not.toBeInTheDocument();
  });
});
