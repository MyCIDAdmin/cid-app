import { fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { renderWithProviders } from "../../test/renderWithProviders";
import { useUiStore } from "../../store/uiStore";
import ThemeToggle from "./ThemeToggle";

describe("ThemeToggle", () => {
  beforeEach(() => {
    useUiStore.setState({ theme: "light" });
    document.documentElement.classList.remove("dark");
  });

  afterEach(() => {
    useUiStore.setState({ theme: "light" });
    document.documentElement.classList.remove("dark");
  });

  it("affiche le bouton pour passer en sombre quand le thème est clair", () => {
    renderWithProviders(<ThemeToggle />);
    expect(screen.getByLabelText("action.mode_sombre")).toBeInTheDocument();
  });

  it("passe en sombre au clic : state + classe sur <html>", () => {
    renderWithProviders(<ThemeToggle />);
    fireEvent.click(screen.getByLabelText("action.mode_sombre"));
    expect(useUiStore.getState().theme).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(screen.getByLabelText("action.mode_clair")).toBeInTheDocument();
  });

  it("repasse en clair sur un second clic", () => {
    renderWithProviders(<ThemeToggle />);
    fireEvent.click(screen.getByLabelText("action.mode_sombre"));
    fireEvent.click(screen.getByLabelText("action.mode_clair"));
    expect(useUiStore.getState().theme).toBe("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });
});
