import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import FormatierterText from "./FormatierterText";

describe("FormatierterText", () => {
  it("zeigt HTML formatiert und entfernt Skripte und Ereignisse", () => {
    const { container } = render(
      <FormatierterText
        text={'<p><strong>fett</strong><img src=x onerror="alert(1)"></p><script>x()</script>'}
      />,
    );
    expect(screen.getByText("fett").tagName).toBe("STRONG");
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("[onerror]")).toBeNull();
  });

  it("zeigt älteren Klartext mit Zeilenumbrüchen und ohne HTML-Auswertung", () => {
    render(<FormatierterText text={"Zeile 1\nZeile 2 & mehr"} />);
    const p = screen.getByText(/Zeile 1/);
    expect(p.tagName).toBe("P");
    expect(p.className).toContain("whitespace-pre-line");
  });
});
