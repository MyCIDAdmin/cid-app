import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { renderWithProviders } from "../../test/renderWithProviders";
import InfoTip from "./InfoTip";

describe("InfoTip", () => {
  it("blendet den Hinweis per Klick ein und mit Escape wieder aus", () => {
    renderWithProviders(<InfoTip k="kosten" />);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("info"));
    expect(screen.getByRole("tooltip")).toHaveTextContent("tip.kosten");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });
});
