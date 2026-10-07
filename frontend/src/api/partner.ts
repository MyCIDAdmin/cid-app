/** API — Business Partner & Lieferanten (/partenaires/). */
import type {
  BewertungDaten,
  Partner,
  PartnerBewertung,
  PartnerDetail,
  PartnerFiltre,
  PartnerKategorie,
  PartnerSchreibDaten,
  PartnerVerknuepfung,
  VerknuepfungDaten,
  ZielOption,
  ZielTyp,
} from "../types/partner";
import { apiClient } from "./client";

function listenParams(f: PartnerFiltre) {
  return {
    q: f.q?.trim() || undefined,
    typ: f.typ || undefined,
    statut: f.statut || undefined,
    kategorie: f.kategorie?.length ? f.kategorie.join(",") : undefined,
    bevorzugt: f.bevorzugt ? "1" : undefined,
    min_note: f.min_note ?? undefined,
    ordering: f.ordering || undefined,
    projet: f.projet || undefined,
    evenement: f.evenement || undefined,
    produit: f.produit || undefined,
  };
}

export async function getPartnerListe(filtre: PartnerFiltre): Promise<Partner[]> {
  const { data } = await apiClient.get<Partner[]>("/partenaires/partner/", {
    params: listenParams(filtre),
  });
  return data;
}

export async function getPartner(id: string): Promise<PartnerDetail> {
  const { data } = await apiClient.get<PartnerDetail>(`/partenaires/partner/${id}/`);
  return data;
}

export async function creerPartner(daten: PartnerSchreibDaten): Promise<Partner> {
  const { data } = await apiClient.post<Partner>("/partenaires/partner/", daten);
  return data;
}

export async function aendernPartner(id: string, daten: PartnerSchreibDaten): Promise<Partner> {
  const { data } = await apiClient.patch<Partner>(`/partenaires/partner/${id}/`, daten);
  return data;
}

export async function setzeArchiv(id: string, archivieren: boolean): Promise<Partner> {
  const aktion = archivieren ? "archivieren" : "reaktivieren";
  const { data } = await apiClient.post<Partner>(`/partenaires/partner/${id}/${aktion}/`);
  return data;
}

export async function verknuepfen(
  id: string,
  daten: VerknuepfungDaten,
): Promise<PartnerVerknuepfung> {
  const { data } = await apiClient.post<PartnerVerknuepfung>(
    `/partenaires/partner/${id}/verknuepfen/`,
    daten,
  );
  return data;
}

export async function loescheVerknuepfung(id: string): Promise<void> {
  await apiClient.delete(`/partenaires/verknuepfungen/${id}/`);
}

export async function getBewertungen(id: string): Promise<PartnerBewertung[]> {
  const { data } = await apiClient.get<PartnerBewertung[]>(
    `/partenaires/partner/${id}/bewertungen/`,
  );
  return data;
}

export async function bewerten(id: string, daten: BewertungDaten): Promise<PartnerBewertung> {
  const { data } = await apiClient.post<PartnerBewertung>(
    `/partenaires/partner/${id}/bewertungen/`,
    daten,
  );
  return data;
}

export async function loescheBewertung(id: string): Promise<void> {
  await apiClient.delete(`/partenaires/bewertungen/${id}/`);
}

export async function getKategorien(): Promise<PartnerKategorie[]> {
  const { data } = await apiClient.get<PartnerKategorie[]>("/partenaires/kategorien/");
  return data;
}

export async function creerKategorie(
  daten: Pick<PartnerKategorie, "nom" | "nom_fr">,
): Promise<PartnerKategorie> {
  const { data } = await apiClient.post<PartnerKategorie>("/partenaires/kategorien/", daten);
  return data;
}

export async function aendernKategorie(
  id: string,
  daten: Partial<Pick<PartnerKategorie, "nom" | "nom_fr" | "actif">>,
): Promise<PartnerKategorie> {
  const { data } = await apiClient.patch<PartnerKategorie>(`/partenaires/kategorien/${id}/`, daten);
  return data;
}

export async function getZiele(typ: ZielTyp, q: string): Promise<ZielOption[]> {
  const { data } = await apiClient.get<ZielOption[]>("/partenaires/ziele/", {
    params: { typ, q: q.trim() || undefined },
  });
  return data;
}
