import { createRef } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import MentionSuggestionListe, {
  type MentionSuggestionListeHandle,
} from "./MentionSuggestionListe";

const items = [
  { id: "m1", label: "Sana Werfelli" },
  { id: "m2", label: "Hamza Meddeb" },
];

describe("MentionSuggestionListe", () => {
  it("n'affiche rien quand la liste est vide", () => {
    const { container } = render(<MentionSuggestionListe items={[]} command={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("affiche chaque suggestion et appelle command() au clic", () => {
    const command = vi.fn();
    render(<MentionSuggestionListe items={items} command={command} />);

    expect(screen.getByText("Sana Werfelli")).toBeInTheDocument();
    expect(screen.getByText("Hamza Meddeb")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Hamza Meddeb"));
    expect(command).toHaveBeenCalledWith(items[1]);
  });

  it("navigue au clavier (haut/bas) et valide la sélection avec Entrée via la ref exposée", () => {
    const command = vi.fn();
    const ref = createRef<MentionSuggestionListeHandle>();
    render(<MentionSuggestionListe ref={ref} items={items} command={command} />);

    // Sélection initiale : le premier élément (index 0). Chaque appel doit être flushé (act())
    // avant le suivant, sans quoi "Enter" lirait encore l'`index` d'avant la flèche bas (état
    // React non re-rendu entre les deux appels synchrones).
    act(() => {
      ref.current?.onKeyDown({ event: { key: "ArrowDown" } as KeyboardEvent });
    });
    act(() => {
      ref.current?.onKeyDown({ event: { key: "Enter" } as KeyboardEvent });
    });

    expect(command).toHaveBeenCalledWith(items[1]);
  });

  it("Échap n'est pas géré par la liste elle-même (renvoie false)", () => {
    const ref = createRef<MentionSuggestionListeHandle>();
    render(<MentionSuggestionListe ref={ref} items={items} command={vi.fn()} />);

    const gere = ref.current?.onKeyDown({ event: { key: "Escape" } as KeyboardEvent });
    expect(gere).toBe(false);
  });
});
