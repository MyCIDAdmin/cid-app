import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import FilterUmschalter from "./FilterUmschalter";
import { filterBlockKlasse } from "../../utils/filter";

describe("FilterUmschalter", () => {
  it("ist nur auf dem Handy sichtbar (md:hidden) und meldet das Umschalten", () => {
    const umschalten = vi.fn();
    render(<FilterUmschalter offen={false} onUmschalten={umschalten} controls="x" />);
    const knopf = screen.getByRole("button");
    expect(knopf).toHaveClass("md:hidden");
    expect(knopf).toHaveAttribute("aria-expanded", "false");
    expect(knopf).toHaveAttribute("aria-controls", "x");
    fireEvent.click(knopf);
    expect(umschalten).toHaveBeenCalledTimes(1);
  });

  it("zeigt die Zahl aktiver Filter nur, wenn es welche gibt", () => {
    const { rerender } = render(<FilterUmschalter offen onUmschalten={() => {}} aktiv={0} />);
    expect(screen.getByRole("button")).not.toHaveTextContent(/\d/);
    rerender(<FilterUmschalter offen onUmschalten={() => {}} aktiv={3} />);
    expect(screen.getByRole("button")).toHaveTextContent("3");
  });

  it("filterBlockKlasse : eingeklappt nur ab md, aufgeklappt immer", () => {
    expect(filterBlockKlasse(false)).toBe("hidden md:flex");
    expect(filterBlockKlasse(true)).toBe("flex");
  });
});
