/** Hooks React Query — module finances. */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import * as api from "../api/finances";
import type { DepensePayload, DepensesFiltres } from "../types/finances";

const keys = {
  all: ["finances"] as const,
  categories: () => [...keys.all, "categories"] as const,
  depenses: (f: DepensesFiltres) => [...keys.all, "depenses", f] as const,
  budget: (annee: number) => [...keys.all, "budget", annee] as const,
};

export function useCategories() {
  return useQuery({ queryKey: keys.categories(), queryFn: api.listCategories });
}

export function useDepenses(filtres: DepensesFiltres = {}) {
  return useQuery({ queryKey: keys.depenses(filtres), queryFn: () => api.listDepenses(filtres) });
}

export function useBudget(annee: number) {
  return useQuery({ queryKey: keys.budget(annee), queryFn: () => api.getBudget(annee) });
}

/** Une dépense approuvée change les KPIs/le bilan du module Statistiken & KPIs : on invalide
 * donc aussi ["stats"]. */
function useInvalider() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: keys.all });
    qc.invalidateQueries({ queryKey: ["stats"] });
  };
}

export function useCreerCategorie() {
  const invalider = useInvalider();
  return useMutation({ mutationFn: api.creerCategorie, onSuccess: invalider });
}

export function useModifierCategorie() {
  const invalider = useInvalider();
  return useMutation({
    mutationFn: ({
      id,
      patch,
    }: {
      id: string;
      patch: Parameters<typeof api.modifierCategorie>[1];
    }) => api.modifierCategorie(id, patch),
    onSuccess: invalider,
  });
}

export function useCreerDepense() {
  const invalider = useInvalider();
  return useMutation({
    mutationFn: (p: DepensePayload) => api.creerDepense(p),
    onSuccess: invalider,
  });
}

export function useModifierDepense() {
  const invalider = useInvalider();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Partial<DepensePayload> }) =>
      api.modifierDepense(id, payload),
    onSuccess: invalider,
  });
}

export function useSupprimerDepense() {
  const invalider = useInvalider();
  return useMutation({ mutationFn: api.supprimerDepense, onSuccess: invalider });
}

export function useApprouverDepense() {
  const invalider = useInvalider();
  return useMutation({ mutationFn: api.approuverDepense, onSuccess: invalider });
}

export function useRejeterDepense() {
  const invalider = useInvalider();
  return useMutation({
    mutationFn: ({ id, motif }: { id: string; motif: string }) => api.rejeterDepense(id, motif),
    onSuccess: invalider,
  });
}

export function useDefinirBudget() {
  const invalider = useInvalider();
  return useMutation({
    mutationFn: ({
      annee,
      lignes,
    }: {
      annee: number;
      lignes: { categorie: string; montant: string }[];
    }) => api.definirBudget(annee, lignes),
    onSuccess: invalider,
  });
}
