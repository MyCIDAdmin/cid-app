/**
 * Hooks React Query — module membres. Une seule clé de cache racine
 * ("membres") invalidée après chaque mutation : le volume (~300 fiches) ne
 * justifie pas une invalidation plus fine pour l'instant.
 */
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import * as membresApi from "../api/membres";
import type { MembresListFilters } from "../api/membres";
import type { ImportArt, MembreFormValues, StatutMembre } from "../types/membre";

const membresKeys = {
  all: ["membres"] as const,
  list: (filters: MembresListFilters, pageUrl: string | null) =>
    [...membresKeys.all, "list", filters, pageUrl] as const,
  detail: (id: string) => [...membresKeys.all, "detail", id] as const,
  moi: () => [...membresKeys.all, "moi"] as const,
  monHistorique: () => [...membresKeys.all, "mon-historique"] as const,
  rapprochement: () => [...membresKeys.all, "rapprochement"] as const,
};

export function useMembresList(
  filters: MembresListFilters,
  pageUrl: string | null,
  options: { enabled?: boolean } = {},
) {
  return useQuery({
    queryKey: membresKeys.list(filters, pageUrl),
    queryFn: () => (pageUrl ? membresApi.getMembresPage(pageUrl) : membresApi.listMembres(filters)),
    placeholderData: keepPreviousData,
    enabled: options.enabled ?? true,
  });
}

export function useMembre(id: string | undefined) {
  return useQuery({
    queryKey: membresKeys.detail(id ?? ""),
    queryFn: () => membresApi.getMembre(id as string),
    enabled: Boolean(id),
  });
}

/** Fiche du compte connecté (bouton "Mein Profil" du menu utilisateur, ajouté le 2026-09-28) —
 * `retry: false` même raisonnement que useCampagneActive (hooks/useAdhesions.ts) : un 404 ici est
 * un état attendu (aucune fiche Membre liée à ce compte), pas une erreur transitoire à retenter.
 * `enabled` (défaut true) permet à MembreFormPage de n'appeler cette requête qu'en mode profil
 * (voir MembreFormPage.tsx, qui appelle aussi useMembre — les deux hooks doivent toujours être
 * appelés sans condition, seule leur activation varie, cf règles des Hooks React). */
export function useMembreMoi(options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: membresKeys.moi(),
    queryFn: membresApi.getMembreMoi,
    retry: false,
    enabled: options.enabled ?? true,
  });
}

/** Historique de statut par année du compte connecté (widget "Mitgliedschaftsverlauf",
 * MonAdhesionPage.tsx) — voir membresApi.getMonHistoriqueStatut. */
export function useMonHistoriqueStatut() {
  return useQuery({
    queryKey: membresKeys.monHistorique(),
    queryFn: membresApi.getMonHistoriqueStatut,
  });
}

export function useUpdateMembreMoi() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (values: Partial<MembreFormValues>) => membresApi.updateMembreMoi(values),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: membresKeys.all }),
  });
}

export function useTeleverserPhotoMembreMoi() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (fichier: File) => membresApi.televerserPhotoMembreMoi(fichier),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: membresKeys.all }),
  });
}

export function useCreateMembre() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (values: MembreFormValues) => membresApi.createMembre(values),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: membresKeys.all }),
  });
}

export function useUpdateMembre(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (values: Partial<MembreFormValues>) => membresApi.updateMembre(id, values),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: membresKeys.all }),
  });
}

export function useDeleteMembre() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => membresApi.deleteMembre(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: membresKeys.all }),
  });
}

export function useChangerStatutMembre(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (statut: StatutMembre) => membresApi.changerStatutMembre(id, statut),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: membresKeys.all }),
  });
}

/** Import Excel, Prüfphase (aucune écriture) — voir membresApi.pruefenImport. */
export function usePruefenImport(art: ImportArt) {
  return useMutation({
    mutationFn: (fichier: File) => membresApi.pruefenImport(art, fichier),
  });
}

/** Import Excel, Bestätigungsphase. Invalide la liste membres (nouvelles fiches / écrasements ;
 * l'historique peut aussi changer le statut courant). */
export function useBestaetigenImport(art: ImportArt) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ fichier, ueberschreiben }: { fichier: File; ueberschreiben: number[] }) =>
      membresApi.bestaetigenImport(art, fichier, ueberschreiben),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: membresKeys.all }),
  });
}

/** Zuordnung (Rapprochement) — Konten mit Vorschlägen, RH+. */
export function useRapprochementList() {
  return useQuery({
    queryKey: membresKeys.rapprochement(),
    queryFn: membresApi.getRapprochement,
  });
}

export function useFusionnerRapprochement() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ inscritId, importeId }: { inscritId: string; importeId: string }) =>
      membresApi.fusionnerRapprochement(inscritId, importeId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: membresKeys.all }),
  });
}

export function useEcarterRapprochement() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (inscritId: string) => membresApi.ecarterRapprochement(inscritId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: membresKeys.rapprochement() }),
  });
}
