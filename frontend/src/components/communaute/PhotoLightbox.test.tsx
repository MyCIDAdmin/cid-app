import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "../../test/renderWithProviders";
import type { Photo } from "../../types/communaute";
import PhotoLightbox from "./PhotoLightbox";

function photo(overrides: Partial<Photo> = {}): Photo {
  return {
    id: "p1",
    album: "a1",
    membre: { id: "m1", prenom: "Sana", nom: "Werfelli", photo: null },
    image: "https://cid-media.example.com/photos/p1.jpg",
    legende: "But de la victoire !",
    est_masquee: false,
    created_at: "2026-01-01T10:00:00Z",
    nombre_likes: 4,
    jaime: false,
    est_proprietaire: false,
    commentaires: [],
    ...overrides,
  };
}

describe("PhotoLightbox", () => {
  it("affiche la photo à l'index courant, en grand, avec sa légende", () => {
    const photos = [photo({ id: "p1", legende: "But de la victoire !" })];
    renderWithProviders(
      <PhotoLightbox photos={photos} index={0} onClose={vi.fn()} onNavigate={vi.fn()} />,
    );

    expect(screen.getByAltText("But de la victoire !")).toBeInTheDocument();
    expect(screen.getByText("But de la victoire !")).toBeInTheDocument();
  });

  it("n'affiche ni flèches ni compteur pour un album d'une seule photo", () => {
    renderWithProviders(
      <PhotoLightbox photos={[photo()]} index={0} onClose={vi.fn()} onNavigate={vi.fn()} />,
    );

    expect(screen.queryByLabelText("visionneuse.image_suivante")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("visionneuse.image_precedente")).not.toBeInTheDocument();
  });

  it("ferme au clic sur le bouton fermer", () => {
    const onClose = vi.fn();
    renderWithProviders(
      <PhotoLightbox photos={[photo()]} index={0} onClose={onClose} onNavigate={vi.fn()} />,
    );

    fireEvent.click(screen.getByLabelText("visionneuse.fermer"));

    expect(onClose).toHaveBeenCalled();
  });

  it("ferme au clic sur le fond (en dehors de la photo)", () => {
    const onClose = vi.fn();
    renderWithProviders(
      <PhotoLightbox photos={[photo()]} index={0} onClose={onClose} onNavigate={vi.fn()} />,
    );

    fireEvent.click(screen.getByRole("dialog"));

    expect(onClose).toHaveBeenCalled();
  });

  it("ne ferme pas au clic sur la photo elle-même", () => {
    const onClose = vi.fn();
    renderWithProviders(
      <PhotoLightbox photos={[photo()]} index={0} onClose={onClose} onNavigate={vi.fn()} />,
    );

    fireEvent.click(screen.getByAltText("But de la victoire !"));

    expect(onClose).not.toHaveBeenCalled();
  });

  it("navigue vers la photo suivante/précédente au clic sur les flèches, avec retour au début en boucle", () => {
    const photos = [photo({ id: "p1" }), photo({ id: "p2" }), photo({ id: "p3" })];
    const onNavigate = vi.fn();
    renderWithProviders(
      <PhotoLightbox photos={photos} index={2} onClose={vi.fn()} onNavigate={onNavigate} />,
    );

    expect(screen.getByText("visionneuse.compteur")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("visionneuse.image_suivante"));
    expect(onNavigate).toHaveBeenCalledWith(0);

    fireEvent.click(screen.getByLabelText("visionneuse.image_precedente"));
    expect(onNavigate).toHaveBeenCalledWith(1);
  });

  it("répond aux flèches clavier et à Échap", () => {
    const photos = [photo({ id: "p1" }), photo({ id: "p2" })];
    const onNavigate = vi.fn();
    const onClose = vi.fn();
    renderWithProviders(
      <PhotoLightbox photos={photos} index={0} onClose={onClose} onNavigate={onNavigate} />,
    );

    fireEvent.keyDown(document, { key: "ArrowRight" });
    expect(onNavigate).toHaveBeenCalledWith(1);

    fireEvent.keyDown(document, { key: "ArrowLeft" });
    expect(onNavigate).toHaveBeenCalledWith(1); // (0 - 1 + 2) % 2

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });
});
