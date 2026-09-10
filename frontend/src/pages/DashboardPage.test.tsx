import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import DashboardPage from "./DashboardPage";

describe("DashboardPage", () => {
  it("affiche le titre du tableau de bord", () => {
    render(<DashboardPage />);
    expect(screen.getByRole("heading")).toBeInTheDocument();
  });
});
