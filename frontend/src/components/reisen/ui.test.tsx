import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { Countdown, Fehler } from "./ui";

afterEach(cleanup);

describe("Reise-Bausteine", () => {
  it("Fehler zeigt nichts bei leerem Text und sonst eine Meldung", () => {
    const { rerender } = render(<Fehler text="" />);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    rerender(<Fehler text="Das ging schief" />);
    expect(screen.getByRole("alert")).toHaveTextContent("Das ging schief");
  });

  it("Countdown ohne Frist bleibt leer", () => {
    const { container } = render(<Countdown frist={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("Countdown zeigt für eine künftige Frist eine Restzeit", () => {
    const frist = new Date(Date.now() + 3 * 3600_000).toISOString();
    const { container } = render(<Countdown frist={frist} />);
    expect(container).not.toBeEmptyDOMElement();
  });
});
