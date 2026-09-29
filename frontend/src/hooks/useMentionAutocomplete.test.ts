import { useState } from "react";
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as useCommunauteHooks from "./useCommunaute";
import { useMentionAutocomplete } from "./useMentionAutocomplete";

vi.mock("./useCommunaute", async () => {
  const actual = await vi.importActual<typeof useCommunauteHooks>("./useCommunaute");
  return { ...actual, useRechercherMembres: vi.fn() };
});

const sana = { id: "m2", prenom: "Sana", nom: "Werfelli", photo: null };
const hamza = { id: "m3", prenom: "Hamza", nom: "Meddeb", photo: null };

function mockRecherche(data: (typeof sana)[]) {
  vi.mocked(useCommunauteHooks.useRechercherMembres).mockReturnValue({
    data,
    isLoading: false,
    isError: false,
  } as unknown as ReturnType<typeof useCommunauteHooks.useRechercherMembres>);
}

// Hook de test : porte son propre `texte` (useState), comme un composeur réel — voir
// docstring de useMentionAutocomplete.ts (texte/setTexte fournis par l'appelant, pas gérés
// en interne).
function useHarness(initial = "") {
  const [texte, setTexte] = useState(initial);
  const mention = useMentionAutocomplete(texte, setTexte);
  return { texte, setTexte, ...mention };
}

describe("useMentionAutocomplete", () => {
  beforeEach(() => {
    mockRecherche([]);
  });

  it("ne propose aucune suggestion et n'interroge pas l'annuaire sans '@' en fin de texte", () => {
    renderHook(() => useHarness("Bonjour à tous"));
    expect(useCommunauteHooks.useRechercherMembres).toHaveBeenLastCalledWith("", false);
  });

  it("interroge l'annuaire et propose au plus 5 suggestions quand le texte se termine par '@mot'", () => {
    const dix = Array.from({ length: 10 }, (_, i) => ({
      id: `m${i}`,
      prenom: `Membre${i}`,
      nom: "Test",
      photo: null,
    }));
    mockRecherche(dix);

    const { result } = renderHook(() => useHarness("Coucou @Sa"));

    expect(useCommunauteHooks.useRechercherMembres).toHaveBeenLastCalledWith("Sa", true);
    expect(result.current.suggestions).toHaveLength(5);
  });

  it("choisirMention remplace le token '@mot' par '@Prénom ' et mémorise le membre", () => {
    const { result } = renderHook(() => useHarness("Regarde ça @Sa"));

    act(() => {
      result.current.choisirMention(sana);
    });

    expect(result.current.texte).toBe("Regarde ça @Sana ");
    expect(result.current.mentionsPourEnvoi(result.current.texte)).toEqual([sana.id]);
  });

  it("mentionsPourEnvoi exclut un membre dont le token a été supprimé du texte après coup", () => {
    const { result } = renderHook(() => useHarness("@Sa"));

    act(() => {
      result.current.choisirMention(sana);
    });
    expect(result.current.mentionsPourEnvoi(result.current.texte)).toEqual([sana.id]);

    act(() => {
      result.current.setTexte("Finalement je supprime la mention");
    });
    expect(result.current.mentionsPourEnvoi(result.current.texte)).toEqual([]);
  });

  it("mémorise plusieurs mentions distinctes sans doublon si le même membre est choisi deux fois", () => {
    const { result } = renderHook(() => useHarness("@Sa"));

    act(() => {
      result.current.choisirMention(sana);
    });
    act(() => {
      result.current.choisirMention(hamza);
    });
    act(() => {
      result.current.choisirMention(sana);
    });

    const texteFinal = `${result.current.texte} @Hamza`;
    expect(result.current.mentionsPourEnvoi(texteFinal).sort()).toEqual(
      [sana.id, hamza.id].sort(),
    );
  });

  it("reinitialiser vide les mentions mémorisées", () => {
    const { result } = renderHook(() => useHarness("@Sa"));

    act(() => {
      result.current.choisirMention(sana);
    });
    act(() => {
      result.current.reinitialiser();
    });

    expect(result.current.mentionsPourEnvoi(result.current.texte)).toEqual([]);
  });
});
