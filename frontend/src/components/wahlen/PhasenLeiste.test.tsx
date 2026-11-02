import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import PhasenLeiste from "./PhasenLeiste";

describe("PhasenLeiste", () => {
  it("zeigt sieben Phasen und markiert die laufende", () => {
    render(<PhasenLeiste phase={2} />);
    const punkte = screen.getAllByRole("listitem");
    expect(punkte).toHaveLength(7);
    expect(punkte[2]).toHaveAttribute("aria-current", "step");
    expect(punkte[0]).not.toHaveAttribute("aria-current");
  });
});
