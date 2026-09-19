/**
 * Tests — useDeepLinkCible (ajouté le 2026-09-19, lien profond depuis une notification, voir
 * docstring du hook). jsdom implémente `scrollIntoView` en no-op par défaut (absent en
 * réalité) : on le simule ici pour vérifier qu'il est bien appelé.
 */
import { render } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { useDeepLinkCible } from "./useDeepLinkCible";

function wrapper(route: string) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <MemoryRouter initialEntries={[route]}>{children}</MemoryRouter>;
  };
}

function Sonde({ param, ids }: { param: string; ids: string[] }) {
  const { cibleId, refCible } = useDeepLinkCible(param);
  return (
    <div>
      <span data-testid="cible-id">{cibleId ?? "aucune"}</span>
      {ids.map((id) => (
        <div key={id} data-testid={`element-${id}`} ref={refCible(id)}>
          {id}
        </div>
      ))}
    </div>
  );
}

describe("useDeepLinkCible", () => {
  it("renvoie null quand le paramètre de requête est absent", () => {
    const { getByTestId } = render(<Sonde param="evenement" ids={["e1", "e2"]} />, {
      wrapper: wrapper("/evenements"),
    });
    expect(getByTestId("cible-id").textContent).toBe("aucune");
  });

  it("lit l'id ciblé depuis le paramètre de requête", () => {
    const { getByTestId } = render(<Sonde param="evenement" ids={["e1", "e2"]} />, {
      wrapper: wrapper("/evenements?evenement=e2"),
    });
    expect(getByTestId("cible-id").textContent).toBe("e2");
  });

  it("scrolle et met en évidence uniquement l'élément ciblé", () => {
    const scrollIntoView = vi.fn();
    HTMLElement.prototype.scrollIntoView = scrollIntoView;

    const { getByTestId } = render(<Sonde param="publication" ids={["p1", "p2"]} />, {
      wrapper: wrapper("/fil?publication=p2"),
    });

    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(getByTestId("element-p2").classList.contains("cid-highlight-cible")).toBe(true);
    expect(getByTestId("element-p1").classList.contains("cid-highlight-cible")).toBe(false);
  });
});
