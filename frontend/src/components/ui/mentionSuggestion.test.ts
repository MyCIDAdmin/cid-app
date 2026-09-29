import { describe, expect, it, vi } from "vitest";

import { creerSuggestionMention } from "./mentionSuggestion";

describe("creerSuggestionMention", () => {
  it("transmet la requête à rechercher() et limite le résultat à 5 suggestions", async () => {
    const dix = Array.from({ length: 10 }, (_, i) => ({ id: `m${i}`, label: `Membre ${i}` }));
    const rechercher = vi.fn().mockResolvedValue(dix);

    const options = creerSuggestionMention(rechercher);
    const resultat = await options.items?.({ query: "Sa", editor: {} as never });

    expect(rechercher).toHaveBeenCalledWith("Sa");
    expect(resultat).toHaveLength(5);
    expect(resultat).toEqual(dix.slice(0, 5));
  });

  it("renvoie une liste vide quand rechercher() ne trouve rien", async () => {
    const rechercher = vi.fn().mockResolvedValue([]);
    const options = creerSuggestionMention(rechercher);

    const resultat = await options.items?.({ query: "inconnu", editor: {} as never });

    expect(resultat).toEqual([]);
  });
});
