import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { renderWithProviders } from "../../test/renderWithProviders";
import PartnerLogos from "./PartnerLogos";

describe("PartnerLogos", () => {
  it("rendert nichts ohne Logos", () => {
    const { container } = renderWithProviders(<PartnerLogos logos={[]} />);
    expect(container).toBeEmptyDOMElement();
    const leer = renderWithProviders(<PartnerLogos logos={undefined} />);
    expect(leer.container).toBeEmptyDOMElement();
  });

  it("zeigt Logos und verlinkt nur sichere Webseiten", () => {
    renderWithProviders(
      <PartnerLogos
        logos={[
          {
            id: "1",
            nom: "Sponsor AG",
            logo_url: "https://cdn.example/a.png",
            website: "https://sponsor.example",
            rolle: "sponsor",
          },
          {
            id: "2",
            nom: "Böse GmbH",
            logo_url: "https://cdn.example/b.png",
            website: "javascript:alert(1)",
            rolle: "kooperation",
          },
        ]}
      />,
    );
    expect(screen.getByAltText("Sponsor AG")).toHaveAttribute("src", "https://cdn.example/a.png");
    expect(screen.getByRole("link")).toHaveAttribute("href", "https://sponsor.example");
    expect(screen.getAllByRole("link")).toHaveLength(1);
    expect(screen.getByAltText("Böse GmbH")).toBeInTheDocument();
  });
});
