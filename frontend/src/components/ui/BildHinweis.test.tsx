import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { renderWithProviders } from "../../test/renderWithProviders";
import BildHinweis from "./BildHinweis";

describe("BildHinweis", () => {
  it("zeigt den Hinweis zur gewählten Variante", () => {
    renderWithProviders(<BildHinweis variante="projekt" />);
    expect(screen.getByText(/bild_hinweis\.projekt/)).toBeInTheDocument();
  });
});
