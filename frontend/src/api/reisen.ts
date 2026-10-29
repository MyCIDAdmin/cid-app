/** API des Moduls „Reisen & Fahrgemeinschaften“ (Backend: apps.reisen, Präfix /reisen/). */
import { apiClient } from "./client";
import type {
  AnkunftGruppe,
  Aufgabe,
  ChecklistePunkt,
  Entscheidung,
  Etappe,
  GemeinsameAnkunft,
  Info,
  Kosten,
  Laenderprofil,
  LaenderprofilEingabe,
  MeineAngaben,
  ReiseDetail,
  ReiseEingabe,
  ReiseListItem,
  ReiseOeffentlich,
  SaisonSpiel,
  StadionVorschlag,
  TeilgruppenListe,
  Teilnehmer,
  Uebersicht,
  Unterkunft,
  Wert,
} from "../types/reisen";

const b = (id: string) => `/reisen/${id}`;

export async function listReisen(
  params: { meine?: boolean; rencontre?: string; q?: string } = {},
): Promise<ReiseListItem[]> {
  const { data } = await apiClient.get<ReiseListItem[]>("/reisen/", {
    params: { ...params, meine: params.meine ? 1 : undefined },
  });
  return data;
}
export async function getReise(id: string): Promise<ReiseDetail> {
  return (await apiClient.get<ReiseDetail>(`${b(id)}/`)).data;
}
export async function createReise(daten: ReiseEingabe): Promise<{ id: string }> {
  return (await apiClient.post<{ id: string }>("/reisen/", daten)).data;
}
export async function updateReise(id: string, daten: ReiseEingabe): Promise<void> {
  await apiClient.patch(`${b(id)}/`, daten);
}
export async function deleteReise(id: string): Promise<void> {
  await apiClient.delete(`${b(id)}/`);
}
export async function getStadionVorschlag(rencontre: string): Promise<StadionVorschlag> {
  return (
    await apiClient.get<StadionVorschlag>("/reisen/stadion-vorschlag/", { params: { rencontre } })
  ).data;
}
export async function sucheMitglieder(q: string): Promise<{ id: string; name: string }[]> {
  return (await apiClient.get("/reisen/mitglieder-suche/", { params: { q } })).data;
}
export async function perLink(token: string): Promise<{ id: string; neu: boolean }> {
  return (await apiClient.post("/reisen/per-link/", { token })).data;
}
export async function beitreten(
  id: string,
  daten: { status: "interessiert" | "dabei"; nachricht?: string; token?: string },
): Promise<ReiseListItem> {
  return (await apiClient.post<ReiseListItem>(`${b(id)}/beitreten/`, daten)).data;
}
export async function absagen(id: string): Promise<void> {
  await apiClient.post(`${b(id)}/absagen/`);
}
export async function einladen(id: string, membreIds: string[]): Promise<{ eingeladen: number }> {
  return (await apiClient.post(`${b(id)}/einladen/`, { membre_ids: membreIds })).data;
}
export async function listTeilnehmer(id: string): Promise<Teilnehmer[]> {
  return (await apiClient.get<Teilnehmer[]>(`${b(id)}/teilnehmer/`)).data;
}
export async function entscheideAnfrage(id: string, tid: string, zusage: boolean): Promise<void> {
  await apiClient.post(`${b(id)}/teilnehmer/${tid}/entscheiden/`, { zusage });
}
export async function entferneTeilnehmer(id: string, tid: string): Promise<void> {
  await apiClient.post(`${b(id)}/teilnehmer/${tid}/entfernen/`);
}
export async function setzeRolle(id: string, tid: string, rolle: string): Promise<void> {
  await apiClient.post(`${b(id)}/teilnehmer/${tid}/rolle/`, { rolle });
}
export async function uebernehmen(id: string): Promise<void> {
  await apiClient.post(`${b(id)}/uebernehmen/`);
}
export async function bestaetigeRegeln(id: string): Promise<void> {
  await apiClient.post(`${b(id)}/regeln-bestaetigen/`);
}
export async function updateMeine(id: string, daten: Partial<MeineAngaben>): Promise<MeineAngaben> {
  return (await apiClient.patch<MeineAngaben>(`${b(id)}/meine/`, daten)).data;
}
export async function createEtappe(id: string, daten: Partial<Etappe>): Promise<Etappe> {
  return (await apiClient.post<Etappe>(`${b(id)}/etappen/`, daten)).data;
}
export async function deleteEtappe(id: string, eid: string): Promise<void> {
  await apiClient.delete(`${b(id)}/etappen/${eid}/`);
}
export async function listUnterkuenfte(id: string): Promise<Unterkunft[]> {
  return (await apiClient.get<Unterkunft[]>(`${b(id)}/unterkuenfte/`)).data;
}
export async function createUnterkunft(id: string, daten: Partial<Unterkunft>): Promise<void> {
  await apiClient.post(`${b(id)}/unterkuenfte/`, daten);
}
export async function deleteUnterkunft(id: string, uid: string): Promise<void> {
  await apiClient.delete(`${b(id)}/unterkuenfte/${uid}/`);
}
export async function getUebersicht(id: string): Promise<Uebersicht> {
  return (await apiClient.get<Uebersicht>(`${b(id)}/uebersicht/`)).data;
}
export async function listEntscheidungen(id: string): Promise<Entscheidung[]> {
  return (await apiClient.get<Entscheidung[]>(`${b(id)}/entscheidungen/`)).data;
}
export interface EntscheidungEingabe {
  typ: string;
  baustein?: string;
  titel: string;
  beschreibung?: string;
  mehrfach?: boolean;
  frist?: string | null;
  teilgruppe?: string | null;
  optionen?: Record<string, unknown>[];
}
export async function createEntscheidung(id: string, daten: EntscheidungEingabe): Promise<void> {
  await apiClient.post(`${b(id)}/entscheidungen/`, daten);
}
export async function deleteEntscheidung(id: string, eid: string): Promise<void> {
  await apiClient.delete(`${b(id)}/entscheidungen/${eid}/`);
}
export async function createOption(
  id: string,
  eid: string,
  daten: Record<string, unknown>,
): Promise<void> {
  await apiClient.post(`${b(id)}/entscheidungen/${eid}/optionen/`, daten);
}
export async function deleteOption(id: string, oid: string): Promise<void> {
  await apiClient.delete(`${b(id)}/optionen/${oid}/`);
}
export async function stimmeAb(
  id: string,
  eid: string,
  stimmen: { option: string; wert?: Wert }[],
): Promise<Entscheidung> {
  return (
    await apiClient.post<Entscheidung>(`${b(id)}/entscheidungen/${eid}/stimmen/`, { stimmen })
  ).data;
}
export async function beschliesse(
  id: string,
  eid: string,
  daten: { option?: string | null; begruendung?: string },
): Promise<Entscheidung> {
  return (await apiClient.post<Entscheidung>(`${b(id)}/entscheidungen/${eid}/beschliessen/`, daten))
    .data;
}
export async function verlaengere(id: string, eid: string, frist: string): Promise<Entscheidung> {
  return (
    await apiClient.post<Entscheidung>(`${b(id)}/entscheidungen/${eid}/verlaengern/`, { frist })
  ).data;
}
export async function listInfos(id: string): Promise<Info[]> {
  return (await apiClient.get<Info[]>(`${b(id)}/infos/`)).data;
}
export async function createInfo(id: string, daten: Partial<Info>): Promise<void> {
  await apiClient.post(`${b(id)}/infos/`, daten);
}
export async function deleteInfo(id: string, iid: string): Promise<void> {
  await apiClient.delete(`${b(id)}/infos/${iid}/`);
}
export async function infoGelesen(id: string, iid: string): Promise<void> {
  await apiClient.post(`${b(id)}/infos/${iid}/gelesen/`);
}
export async function listAufgaben(id: string): Promise<Aufgabe[]> {
  return (await apiClient.get<Aufgabe[]>(`${b(id)}/aufgaben/`)).data;
}
export async function createAufgabe(id: string, daten: Record<string, unknown>): Promise<void> {
  await apiClient.post(`${b(id)}/aufgaben/`, daten);
}
export async function updateAufgabe(
  id: string,
  aid: string,
  daten: Record<string, unknown>,
): Promise<void> {
  await apiClient.patch(`${b(id)}/aufgaben/${aid}/`, daten);
}
export async function deleteAufgabe(id: string, aid: string): Promise<void> {
  await apiClient.delete(`${b(id)}/aufgaben/${aid}/`);
}
export async function getKosten(id: string): Promise<Kosten> {
  return (await apiClient.get<Kosten>(`${b(id)}/kosten/`)).data;
}
export async function createKosten(id: string, daten: Record<string, unknown>): Promise<Kosten> {
  return (await apiClient.post<Kosten>(`${b(id)}/kosten/`, daten)).data;
}
export async function deleteKosten(id: string, kid: string): Promise<void> {
  await apiClient.delete(`${b(id)}/kosten/${kid}/`);
}
export async function getReiseOeffentlich(id: string): Promise<ReiseOeffentlich> {
  return (await apiClient.get<ReiseOeffentlich>(`/reisen/oeffentlich/${id}/`)).data;
}
export function teilenUrlDerReise(id: string): string {
  const basis = (apiClient.defaults.baseURL ?? "").replace(/\/$/, "");
  return basis.startsWith("http")
    ? `${basis}/reisen/oeffentlich/${id}/teilen/`
    : `${window.location.origin}/reise/${id}`;
}

// --- Welle 2 -----------------------------------------------------------------------------
export async function listTeilgruppen(id: string): Promise<TeilgruppenListe> {
  return (await apiClient.get<TeilgruppenListe>(`${b(id)}/teilgruppen/`)).data;
}
export async function createTeilgruppe(
  id: string,
  daten: { name: string; teilnehmer: string[] },
): Promise<void> {
  await apiClient.post(`${b(id)}/teilgruppen/`, daten);
}
export async function updateTeilgruppe(
  id: string,
  gid: string,
  daten: { name?: string; teilnehmer?: string[] },
): Promise<void> {
  await apiClient.patch(`${b(id)}/teilgruppen/${gid}/`, daten);
}
export async function deleteTeilgruppe(id: string, gid: string): Promise<void> {
  await apiClient.delete(`${b(id)}/teilgruppen/${gid}/`);
}

export async function getGemeinsameAnkunft(id: string): Promise<GemeinsameAnkunft> {
  return (await apiClient.get<GemeinsameAnkunft>(`${b(id)}/gemeinsame-ankunft/`)).data;
}
export async function setzeAnkunftZustimmung(
  id: string,
  gruppe: Pick<AnkunftGruppe, "typ" | "ort" | "tag">,
  zustimmen: boolean,
): Promise<GemeinsameAnkunft> {
  return (
    await apiClient.post<GemeinsameAnkunft>(`${b(id)}/gemeinsame-ankunft/`, {
      ...gruppe,
      zustimmen,
    })
  ).data;
}

export async function listCheckliste(id: string): Promise<ChecklistePunkt[]> {
  return (await apiClient.get<ChecklistePunkt[]>(`${b(id)}/checkliste/`)).data;
}
export async function createCheckliste(
  id: string,
  daten: {
    titel: string;
    frist?: string | null;
    persoenlich?: boolean;
    teilgruppe?: string | null;
  },
): Promise<ChecklistePunkt[]> {
  return (await apiClient.post<ChecklistePunkt[]>(`${b(id)}/checkliste/`, daten)).data;
}
export async function deleteCheckliste(id: string, pid: string): Promise<void> {
  await apiClient.delete(`${b(id)}/checkliste/${pid}/`);
}
export async function setzeChecklisteErledigt(
  id: string,
  pid: string,
  erledigt: boolean,
): Promise<ChecklistePunkt[]> {
  return (
    await apiClient.post<ChecklistePunkt[]>(`${b(id)}/checkliste/${pid}/erledigt/`, { erledigt })
  ).data;
}

export async function exportiere(
  id: string,
  art: "excel" | "namensliste",
  params: { unterkunft?: string; teilgruppe?: string } = {},
): Promise<{ blob: Blob; nomFichier: string }> {
  const { data, headers } = await apiClient.get(`${b(id)}/export-${art}/`, {
    params,
    responseType: "blob",
  });
  const treffer = /filename="?([^"]+)"?/.exec(String(headers["content-disposition"] ?? ""));
  return { blob: data, nomFichier: treffer?.[1] ?? `${art}.xlsx` };
}

export async function getSaison(): Promise<SaisonSpiel[]> {
  return (await apiClient.get<SaisonSpiel[]>("/reisen/saison/")).data;
}

export async function listLaenderprofile(): Promise<Laenderprofil[]> {
  return (await apiClient.get<Laenderprofil[]>("/reisen/laenderprofile/")).data;
}
export async function saveLaenderprofil(
  daten: LaenderprofilEingabe,
  id?: string,
): Promise<Laenderprofil> {
  return id
    ? (await apiClient.patch<Laenderprofil>(`/reisen/laenderprofile/${id}/`, daten)).data
    : (await apiClient.post<Laenderprofil>("/reisen/laenderprofile/", daten)).data;
}
export async function deleteLaenderprofil(id: string): Promise<void> {
  await apiClient.delete(`/reisen/laenderprofile/${id}/`);
}
