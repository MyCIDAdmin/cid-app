/**
 * Hooks React Query — module adhesions.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import * as adhesionsApi from "../api/adhesions";
import type {
  CampagneCreatePayload,
  ErwachsenerPayload,
  OffreCreatePayload,
  RabaisCreatePayload,
  SouscrireEspecesPayload,
  SouscrirePayload,
  ValiderJustificatifPayload,
} from "../types/adhesion";

const adhesionsKeys = {
  all: ["adhesions"] as const,
  campagneActive: () => [...adhesionsKeys.all, "campagne-active"] as const,
  campagnes: () => [...adhesionsKeys.all, "campagnes"] as const,
  mesSouscriptions: () => [...adhesionsKeys.all, "mes-souscriptions"] as const,
  familienpakete: (campagne?: string) =>
    [...adhesionsKeys.all, "familienpakete", campagne ?? "alle"] as const,
  justificatifsEnAttente: () => [...adhesionsKeys.all, "justificatifs-en-attente"] as const,
};

/** 404 attendu tant qu'aucune campagne n'est publiée — pas une erreur transitoire à retenter. */
export function useCampagneActive() {
  return useQuery({
    queryKey: adhesionsKeys.campagneActive(),
    queryFn: () => adhesionsApi.getCampagneActive(),
    retry: false,
  });
}

export function useCampagnes() {
  return useQuery({
    queryKey: adhesionsKeys.campagnes(),
    queryFn: () => adhesionsApi.listCampagnes(),
  });
}

/**
 * `options.enabled` (ajouté le 2026-09-26, plan "Öffentliche mycid.org-Startseite" section C.2)
 * — MembershipSection.tsx doit pouvoir désactiver cette requête pour un visiteur non connecté
 * (l'endpoint reste authentifié, voir SouscriptionPermission côté backend, inchangé) sans
 * dupliquer ce hook. Par défaut `true` : tous les appels existants (MonAdhesionPage) gardent
 * leur comportement inchangé.
 */
export function useMesSouscriptions(options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: adhesionsKeys.mesSouscriptions(),
    queryFn: () => adhesionsApi.listMesSouscriptions(),
    enabled: options.enabled ?? true,
  });
}

export function useCreerCampagne() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CampagneCreatePayload) => adhesionsApi.creerCampagne(payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: adhesionsKeys.campagnes() }),
  });
}

export function useModifierFristCampagne() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, date }: { id: string; date: string | null }) =>
      adhesionsApi.modifierFristCampagne(id, date),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: adhesionsKeys.all }),
  });
}

export function useModifierAlterKind() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, alter }: { id: string; alter: number }) =>
      adhesionsApi.modifierAlterKind(id, alter),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: adhesionsKeys.all }),
  });
}

export function usePublierCampagne() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => adhesionsApi.publierCampagne(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adhesionsKeys.campagnes() });
      queryClient.invalidateQueries({ queryKey: adhesionsKeys.campagneActive() });
    },
  });
}

export function useCloturerCampagne() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => adhesionsApi.cloturerCampagne(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adhesionsKeys.campagnes() });
      queryClient.invalidateQueries({ queryKey: adhesionsKeys.campagneActive() });
    },
  });
}

export function useSouscrire() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: SouscrirePayload) => adhesionsApi.souscrire(payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: adhesionsKeys.mesSouscriptions() }),
  });
}

/**
 * Souscription + paiement immédiat en espèces pour un autre membre (ajouté le 2026-09-21,
 * F-015) — utilisé par PaiementEspecesForm (CotisationsEnAttentePage), voir
 * adhesionsApi.souscrireEspeces. Invalide aussi les cotisations (la Cotisation liée créée/
 * confirmée doit disparaître de "Ausstehende Zahlungen"), même principe que useInscrireEspeces
 * (evenements).
 */
export function useSouscrireEspeces() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: SouscrireEspecesPayload) => adhesionsApi.souscrireEspeces(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adhesionsKeys.campagnes() });
      queryClient.invalidateQueries({ queryKey: adhesionsKeys.campagneActive() });
      queryClient.invalidateQueries({ queryKey: ["cotisations"] });
    },
  });
}

/** Upload/remplacement d'un justificatif (AHM-20) — voir adhesionsApi.uploaderJustificatif. */
export function useUploaderJustificatif() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ souscriptionId, fichier }: { souscriptionId: string; fichier: File }) =>
      adhesionsApi.uploaderJustificatif(souscriptionId, fichier),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: adhesionsKeys.mesSouscriptions() }),
  });
}

/** File de validation RH+ (AHM-20, RICEFW R-ADH-05). */
export function useJustificatifsEnAttente() {
  return useQuery({
    queryKey: adhesionsKeys.justificatifsEnAttente(),
    queryFn: () => adhesionsApi.listSouscriptionsEnAttenteJustificatif(),
  });
}

export function useHistoriqueJustificatifs() {
  return useQuery({
    queryKey: [...adhesionsKeys.justificatifsEnAttente(), "historique"],
    queryFn: () => adhesionsApi.listSouscriptionsAvecJustificatif(),
  });
}

export function useValiderJustificatif() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: ValiderJustificatifPayload }) =>
      adhesionsApi.validerJustificatif(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adhesionsKeys.justificatifsEnAttente() });
      queryClient.invalidateQueries({ queryKey: adhesionsKeys.mesSouscriptions() });
    },
  });
}

/**
 * Gestion des offres/rabais (demande utilisateur du 2026-09-16) — CampagneAdhesionSerializer
 * niche déjà `offres`/`offres[].rabais` en entier (voir types/adhesion.ts) : il suffit
 * d'invalider adhesionsKeys.campagnes() après chaque mutation pour que la liste des campagnes
 * (et donc le panneau de gestion par campagne) reflète l'état à jour, sans requête séparée.
 */
export function useCreerOffre() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: OffreCreatePayload) => adhesionsApi.creerOffre(payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: adhesionsKeys.campagnes() }),
  });
}

export function useModifierOffre() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Partial<OffreCreatePayload> }) =>
      adhesionsApi.modifierOffre(id, payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: adhesionsKeys.campagnes() }),
  });
}

export function useSupprimerOffre() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => adhesionsApi.supprimerOffre(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: adhesionsKeys.campagnes() }),
  });
}

/** Upload/remplacement de l'icône d'une offre — voir adhesionsApi.televerserIconeOffre. */
export function useTeleverserIconeOffre() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, fichier }: { id: string; fichier: File }) =>
      adhesionsApi.televerserIconeOffre(id, fichier),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: adhesionsKeys.campagnes() }),
  });
}

export function useCreerRabais() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: RabaisCreatePayload) => adhesionsApi.creerRabais(payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: adhesionsKeys.campagnes() }),
  });
}

export function useModifierRabais() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Partial<RabaisCreatePayload> }) =>
      adhesionsApi.modifierRabais(id, payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: adhesionsKeys.campagnes() }),
  });
}

export function useSupprimerRabais() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => adhesionsApi.supprimerRabais(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: adhesionsKeys.campagnes() }),
  });
}

/** Stornieren/zurückziehen (demande utilisateur du 2026-09-16) — membre propriétaire ou RH+. */
export function useAnnulerSouscription() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => adhesionsApi.annulerSouscription(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adhesionsKeys.mesSouscriptions() });
      queryClient.invalidateQueries({ queryKey: adhesionsKeys.justificatifsEnAttente() });
    },
  });
}

export function useKindLoeschen() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ souscriptionId, kindId }: { souscriptionId: string; kindId: string }) =>
      adhesionsApi.kindLoeschen(souscriptionId, kindId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: adhesionsKeys.all }),
  });
}

export function useErwachsenerAendern() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (v: {
      souscriptionId: string;
      erwachsenerId: string;
      payload: Partial<Pick<ErwachsenerPayload, "vorname" | "nachname" | "email">>;
    }) => adhesionsApi.erwachsenerAendern(v.souscriptionId, v.erwachsenerId, v.payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: adhesionsKeys.all }),
  });
}

export function useEinladungErneutSenden() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (v: { souscriptionId: string; erwachsenerId: string }) =>
      adhesionsApi.einladungErneutSenden(v.souscriptionId, v.erwachsenerId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: adhesionsKeys.all }),
  });
}

/** Büro : Angebot einer Person im Paket ändern. */
export function usePersonAngebot() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (v: { typ: "kind" | "erwachsener"; id: string; angebot: string }) =>
      adhesionsApi.personAngebotZuweisen(v.typ, v.id, v.angebot),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: adhesionsKeys.all }),
  });
}

/** Öffentliche Einladungsseite — der Token ist das Geheimnis. */
export function useEinladung(token: string) {
  return useQuery({
    queryKey: [...adhesionsKeys.all, "einladung", token],
    queryFn: () => adhesionsApi.getEinladung(token),
    retry: false,
  });
}

export function useEinladungAnnehmen(token: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => adhesionsApi.einladungAnnehmen(token),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: adhesionsKeys.all }),
  });
}

export function useEinladungAblehnen(token: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => adhesionsApi.einladungAblehnen(token),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: adhesionsKeys.all }),
  });
}

/** Offene Einladungen an die Adresse des angemeldeten Kontos (Hinweis in der App). */
export function useMeineEinladungen() {
  return useQuery({
    queryKey: [...adhesionsKeys.all, "meine-einladungen"],
    queryFn: () => adhesionsApi.listMeineEinladungen(),
    retry: false,
  });
}

/** Büro-Übersicht der Familienpakete (R34). */
export function useFamilienpakete(campagne?: string) {
  return useQuery({
    queryKey: adhesionsKeys.familienpakete(campagne),
    queryFn: () => adhesionsApi.listFamilienpakete(campagne),
  });
}

/** Personen aus dem letzten Familienpaket (Vorschlag zum Übernehmen). */
export function useVorjahrFamilie(campagne: string | undefined) {
  return useQuery({
    queryKey: [...adhesionsKeys.all, "vorjahr-familie", campagne],
    queryFn: () => adhesionsApi.getVorjahrFamilie(campagne as string),
    enabled: !!campagne,
    retry: false,
  });
}

/** Büro : Familienpaket-Bericht ohne Personenbezug. */
export function useFamilienbericht(campagne?: string) {
  return useQuery({
    queryKey: [...adhesionsKeys.all, "familienbericht", campagne],
    queryFn: () => adhesionsApi.getFamilienbericht(campagne),
  });
}
