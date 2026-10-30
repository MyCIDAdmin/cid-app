import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import * as api from "../api/reisen";
import type { EntscheidungEingabe } from "../api/reisen";
import type { AnkunftGruppe, LaenderprofilEingabe, ReiseEingabe, Wert } from "../types/reisen";

/** Nach jeder Änderung werden alle Reise-Abfragen neu geladen (kleine Datenmengen). */
function useAendern<V, R = unknown>(fn: (v: V) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["reisen"] }),
  });
}

export const useReisenListe = (
  params: { meine?: boolean; rencontre?: string } = {},
  aktiv = true,
) =>
  useQuery({
    queryKey: ["reisen", "liste", params],
    queryFn: () => api.listReisen(params),
    enabled: aktiv,
  });

export const useReise = (id: string | undefined) =>
  useQuery({
    queryKey: ["reisen", "detail", id],
    queryFn: () => api.getReise(id as string),
    enabled: Boolean(id),
    retry: false,
  });

export const useTeilnehmer = (id: string, aktiv = true) =>
  useQuery({
    queryKey: ["reisen", "teilnehmer", id],
    queryFn: () => api.listTeilnehmer(id),
    enabled: aktiv,
  });
export const useUebersicht = (id: string, aktiv = true) =>
  useQuery({
    queryKey: ["reisen", "uebersicht", id],
    queryFn: () => api.getUebersicht(id),
    enabled: aktiv,
  });
export const useUnterkuenfte = (id: string, aktiv = true) =>
  useQuery({
    queryKey: ["reisen", "unterkuenfte", id],
    queryFn: () => api.listUnterkuenfte(id),
    enabled: aktiv,
  });
export const useEntscheidungen = (id: string) =>
  useQuery({
    queryKey: ["reisen", "entscheidungen", id],
    queryFn: () => api.listEntscheidungen(id),
  });
export const useInfos = (id: string, aktiv = true) =>
  useQuery({ queryKey: ["reisen", "infos", id], queryFn: () => api.listInfos(id), enabled: aktiv });
export const useAufgaben = (id: string, aktiv = true) =>
  useQuery({
    queryKey: ["reisen", "aufgaben", id],
    queryFn: () => api.listAufgaben(id),
    enabled: aktiv,
  });
export const useKosten = (id: string, aktiv = true) =>
  useQuery({
    queryKey: ["reisen", "kosten", id],
    queryFn: () => api.getKosten(id),
    enabled: aktiv,
  });
export const useReiseOeffentlich = (id: string | undefined) =>
  useQuery({
    queryKey: ["reisen", "oeffentlich", id],
    queryFn: () => api.getReiseOeffentlich(id as string),
    enabled: Boolean(id),
    retry: false,
  });
export const useMitgliederSuche = (q: string) =>
  useQuery({
    queryKey: ["reisen", "suche", q],
    queryFn: () => api.sucheMitglieder(q),
    enabled: q.trim().length >= 2,
  });
export const useStadionVorschlag = (rencontre: string | undefined) =>
  useQuery({
    queryKey: ["reisen", "stadion", rencontre],
    queryFn: () => api.getStadionVorschlag(rencontre as string),
    enabled: Boolean(rencontre),
  });

export const useReiseAnlegen = () => useAendern((d: ReiseEingabe) => api.createReise(d));
export const useReiseAendern = (id: string) =>
  useAendern((d: ReiseEingabe) => api.updateReise(id, d));
export const useReiseLoeschen = (id: string) => useAendern(() => api.deleteReise(id));
export const useBeitreten = (id: string) =>
  useAendern((d: { status: "interessiert" | "dabei"; nachricht?: string; token?: string }) =>
    api.beitreten(id, d),
  );
export const useAbsagen = (id: string) => useAendern(() => api.absagen(id));
export const useEinladen = (id: string) => useAendern((ids: string[]) => api.einladen(id, ids));
export const useAnfrageEntscheiden = (id: string) =>
  useAendern((v: { tid: string; zusage: boolean }) => api.entscheideAnfrage(id, v.tid, v.zusage));
export const useTeilnehmerEntfernen = (id: string) =>
  useAendern((tid: string) => api.entferneTeilnehmer(id, tid));
export const useRolleSetzen = (id: string) =>
  useAendern((v: { tid: string; rolle: string }) => api.setzeRolle(id, v.tid, v.rolle));
export const useUebernehmen = (id: string) => useAendern(() => api.uebernehmen(id));
export const useRegelnBestaetigen = (id: string) => useAendern(() => api.bestaetigeRegeln(id));
export const useMeineAendern = (id: string) =>
  useAendern((d: Parameters<typeof api.updateMeine>[1]) => api.updateMeine(id, d));
export const useEtappeAnlegen = (id: string) =>
  useAendern((d: Parameters<typeof api.createEtappe>[1]) => api.createEtappe(id, d));
export const useEtappeLoeschen = (id: string) =>
  useAendern((eid: string) => api.deleteEtappe(id, eid));
export const useUnterkunftAnlegen = (id: string) =>
  useAendern((d: Parameters<typeof api.createUnterkunft>[1]) => api.createUnterkunft(id, d));
export const useUnterkunftLoeschen = (id: string) =>
  useAendern((uid: string) => api.deleteUnterkunft(id, uid));
export const useEntscheidungAnlegen = (id: string) =>
  useAendern((d: EntscheidungEingabe) => api.createEntscheidung(id, d));
export const useEntscheidungLoeschen = (id: string) =>
  useAendern((eid: string) => api.deleteEntscheidung(id, eid));
export const useOptionAnlegen = (id: string) =>
  useAendern((v: { eid: string; daten: Record<string, unknown> }) =>
    api.createOption(id, v.eid, v.daten),
  );
export const useOptionLoeschen = (id: string) =>
  useAendern((oid: string) => api.deleteOption(id, oid));
export const useAbstimmen = (id: string) =>
  useAendern((v: { eid: string; stimmen: { option: string; wert?: Wert }[] }) =>
    api.stimmeAb(id, v.eid, v.stimmen),
  );
export const useBeschliessen = (id: string) =>
  useAendern((v: { eid: string; option?: string | null; begruendung?: string }) =>
    api.beschliesse(id, v.eid, { option: v.option, begruendung: v.begruendung }),
  );
export const useVerlaengern = (id: string) =>
  useAendern((v: { eid: string; frist: string }) => api.verlaengere(id, v.eid, v.frist));
export const useInfoAnlegen = (id: string) =>
  useAendern((d: Parameters<typeof api.createInfo>[1]) => api.createInfo(id, d));
export const useInfoLoeschen = (id: string) => useAendern((iid: string) => api.deleteInfo(id, iid));
export const useInfoGelesen = (id: string) => useAendern((iid: string) => api.infoGelesen(id, iid));
export const useAufgabeAnlegen = (id: string) =>
  useAendern((d: Record<string, unknown>) => api.createAufgabe(id, d));
export const useAufgabeAendern = (id: string) =>
  useAendern((v: { aid: string; daten: Record<string, unknown> }) =>
    api.updateAufgabe(id, v.aid, v.daten),
  );
export const useAufgabeLoeschen = (id: string) =>
  useAendern((aid: string) => api.deleteAufgabe(id, aid));
export const useKostenAnlegen = (id: string) =>
  useAendern((d: Record<string, unknown>) => api.createKosten(id, d));
export const useKostenLoeschen = (id: string) =>
  useAendern((kid: string) => api.deleteKosten(id, kid));

// --- Welle 2 -----------------------------------------------------------------------------
export const useTeilgruppen = (id: string, aktiv = true) =>
  useQuery({
    queryKey: ["reisen", "teilgruppen", id],
    queryFn: () => api.listTeilgruppen(id),
    enabled: aktiv,
  });
export const useTeilgruppeAnlegen = (id: string) =>
  useAendern((v: { name: string; teilnehmer: string[] }) => api.createTeilgruppe(id, v));
export const useTeilgruppeAendern = (id: string) =>
  useAendern((v: { gid: string; name?: string; teilnehmer?: string[] }) =>
    api.updateTeilgruppe(id, v.gid, { name: v.name, teilnehmer: v.teilnehmer }),
  );
export const useTeilgruppeLoeschen = (id: string) =>
  useAendern((gid: string) => api.deleteTeilgruppe(id, gid));

export const useGemeinsameAnkunft = (id: string, aktiv = true) =>
  useQuery({
    queryKey: ["reisen", "ankunft", id],
    queryFn: () => api.getGemeinsameAnkunft(id),
    enabled: aktiv,
  });
export const useAnkunftZustimmung = (id: string) =>
  useAendern((v: { gruppe: Pick<AnkunftGruppe, "typ" | "ort" | "tag">; zustimmen: boolean }) =>
    api.setzeAnkunftZustimmung(id, v.gruppe, v.zustimmen),
  );

export const useCheckliste = (id: string, aktiv = true) =>
  useQuery({
    queryKey: ["reisen", "checkliste", id],
    queryFn: () => api.listCheckliste(id),
    enabled: aktiv,
  });
export const useChecklisteAnlegen = (id: string) =>
  useAendern(
    (v: {
      titel: string;
      frist?: string | null;
      persoenlich?: boolean;
      teilgruppe?: string | null;
    }) => api.createCheckliste(id, v),
  );
export const useChecklisteLoeschen = (id: string) =>
  useAendern((pid: string) => api.deleteCheckliste(id, pid));
export const useChecklisteErledigt = (id: string) =>
  useAendern((v: { pid: string; erledigt: boolean }) =>
    api.setzeChecklisteErledigt(id, v.pid, v.erledigt),
  );

export const useSaison = (aktiv = true) =>
  useQuery({ queryKey: ["reisen", "saison"], queryFn: api.getSaison, enabled: aktiv });
export const useLaenderprofile = (aktiv = true) =>
  useQuery({
    queryKey: ["reisen", "laenderprofile"],
    queryFn: api.listLaenderprofile,
    enabled: aktiv,
  });
export const useLaenderprofilSpeichern = () =>
  useAendern((v: { id?: string; daten: LaenderprofilEingabe }) =>
    api.saveLaenderprofil(v.daten, v.id),
  );
export const useLaenderprofilLoeschen = () =>
  useAendern((id: string) => api.deleteLaenderprofil(id));

export const useUmfeld = (id: string) =>
  useQuery({
    queryKey: ["reisen", "umfeld", id],
    queryFn: () => api.getUmfeld(id),
    staleTime: 30 * 60 * 1000,
  });
