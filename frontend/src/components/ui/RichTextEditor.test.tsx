import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import RichTextEditor from "./RichTextEditor";

describe("RichTextEditor", () => {
  it("affiche la barre d'outils et le contenu initial en mode édition", async () => {
    render(<RichTextEditor value="<p>Bonjour le monde</p>" onChange={vi.fn()} />);

    expect(screen.getByRole("toolbar")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText("Bonjour le monde")).toBeInTheDocument();
    });
    // L'éditeur est bien éditable — pas de "readonly"/contentEditable=false.
    expect(screen.getByRole("textbox")).toHaveAttribute("contenteditable", "true");
  });

  it("masque la barre d'outils en mode lecture seule (readOnly)", async () => {
    render(<RichTextEditor value="<p>Aperçu</p>" onChange={vi.fn()} readOnly />);

    expect(screen.queryByRole("toolbar")).not.toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText("Aperçu")).toBeInTheDocument();
    });
    expect(screen.getByRole("textbox")).toHaveAttribute("contenteditable", "false");
  });

  it("expose un bouton par fonction de formatage principale", () => {
    render(<RichTextEditor value="" onChange={vi.fn()} />);

    // Un smoke test volontairement peu couplé au libellé i18n exact (traductions chargées de
    // façon asynchrone via i18next-http-backend, voir src/i18n.ts) — on vérifie le NOMBRE de
    // contrôles de la barre d'outils plutôt que leur texte, même principe que
    // ConfirmDialog.test.tsx (getAllByRole("button") par position).
    const boutons = screen.getAllByRole("button");
    // gras, italique, souligné, H2, H3, liste à puces, liste numérotée, 3x alignement, lien,
    // annuler, rétablir = 13 contrôles.
    expect(boutons).toHaveLength(13);
  });
});
