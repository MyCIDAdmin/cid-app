import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import TabLeiste from "./TabLeiste";

const TABS = [
  { id: "a", label: "Überblick" },
  { id: "b", label: "Kandidaturen" },
  { id: "c", label: "Wahlausschuss" },
];

describe("TabLeiste", () => {
  it("scrollt bei vielen Reitern seitlich, statt die Seite zu verbreitern", () => {
    render(<TabLeiste tabs={TABS} aktiv="a" onChange={() => {}} ariaLabel="Reiter" />);
    expect(screen.getByRole("tablist")).toHaveClass("overflow-x-auto");
    for (const tab of screen.getAllByRole("tab")) {
      expect(tab).toHaveClass("shrink-0", "whitespace-nowrap");
    }
  });

  it("markiert den aktiven Reiter und meldet Klicks", () => {
    const onChange = vi.fn();
    render(<TabLeiste tabs={TABS} aktiv="b" onChange={onChange} ariaLabel="Reiter" />);
    expect(screen.getByRole("tab", { name: "Kandidaturen" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    fireEvent.click(screen.getByRole("tab", { name: "Wahlausschuss" }));
    expect(onChange).toHaveBeenCalledWith("c");
  });
});
