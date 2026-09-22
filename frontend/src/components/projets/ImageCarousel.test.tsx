import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ProjetImage } from "../../types/projets";
import ImageCarousel from "./ImageCarousel";

function image(overrides: Partial<ProjetImage> = {}): ProjetImage {
  return {
    id: "img-1",
    projet: "p1",
    image: "https://cdn.example.de/kachel/img-1.jpg",
    ordre: 0,
    uploaded_by: null,
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("ImageCarousel", () => {
  it("affiche un espace réservé quand aucune image n'est fournie", () => {
    const { container } = render(<ImageCarousel images={[]} titre="Rénovation local" />);
    expect(container.querySelector("img")).not.toBeInTheDocument();
  });

  it("affiche la première image et masque les contrôles quand il n'y en a qu'une seule", () => {
    render(<ImageCarousel images={[image()]} titre="Rénovation local" />);
    expect(screen.getByRole("img")).toHaveAttribute("src", "https://cdn.example.de/kachel/img-1.jpg");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  describe("avec plusieurs images", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("passe automatiquement d'une image à l'autre après l'intervalle configuré (point 1.1)", () => {
      render(
        <ImageCarousel
          images={[image({ id: "img-1" }), image({ id: "img-2", image: "https://cdn.example.de/kachel/img-2.jpg" })]}
          titre="Rénovation local"
          intervalMs={1000}
        />,
      );
      expect(screen.getByRole("img")).toHaveAttribute("src", "https://cdn.example.de/kachel/img-1.jpg");

      act(() => {
        vi.advanceTimersByTime(1000);
      });
      expect(screen.getByRole("img")).toHaveAttribute("src", "https://cdn.example.de/kachel/img-2.jpg");

      // Boucle : revient à la première image après la 2e.
      act(() => {
        vi.advanceTimersByTime(1000);
      });
      expect(screen.getByRole("img")).toHaveAttribute("src", "https://cdn.example.de/kachel/img-1.jpg");
    });

    it("expose des flèches précédente/suivante et des puces de navigation", () => {
      render(
        <ImageCarousel
          images={[image({ id: "img-1" }), image({ id: "img-2" })]}
          titre="Rénovation local"
        />,
      );
      // 2 flèches + 2 puces (une par image).
      expect(screen.getAllByRole("button")).toHaveLength(4);
    });
  });
});
