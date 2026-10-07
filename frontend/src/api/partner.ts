/** API — Business Partner & Lieferanten (/partenaires/). */
import type {
  Angebot,
  AngebotDaten,
  BannerPartner,
  BewertungDaten,
  DokumentDaten,
  EinnahmeDaten,
  ImportErgebnis,
  Partner,
  PartnerBewertung,
  PartnerDetail,
  PartnerDokument,
  PartnerEinnahme,
  PartnerFiltre,
  PartnerKategorie,
  PartnerKontakt,
  PartnerKontaktDaten,
  PartnerReporting,
  PartnerReportingFiltre,
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

// --- Ansprechpersonen -------------------------------------------------------------------

export async function creerKontakt(
  partnerId: string,
  daten: PartnerKontaktDaten,
): Promise<PartnerKontakt> {
  const { data } = await apiClient.post<PartnerKontakt>("/partenaires/kontakte/", {
    ...daten,
    partner: partnerId,
  });
  return data;
}

export async function aendernKontakt(
  id: string,
  daten: Partial<PartnerKontaktDaten>,
): Promise<PartnerKontakt> {
  const { data } = await apiClient.patch<PartnerKontakt>(`/partenaires/kontakte/${id}/`, daten);
  return data;
}

export async function loescheKontakt(id: string): Promise<void> {
  await apiClient.delete(`/partenaires/kontakte/${id}/`);
}

// --- Logo -------------------------------------------------------------------------------

export async function ladeLogoHoch(id: string, datei: File): Promise<Partner> {
  const formData = new FormData();
  formData.append("logo", datei);
  const { data } = await apiClient.post<Partner>(`/partenaires/partner/${id}/logo/`, formData);
  return data;
}

export async function entferneLogo(id: string): Promise<Partner> {
  const { data } = await apiClient.delete<Partner>(`/partenaires/partner/${id}/logo/`);
  return data;
}

// --- Dokumente --------------------------------------------------------------------------

export async function ladeDokumentHoch(
  partnerId: string,
  daten: DokumentDaten,
): Promise<PartnerDokument> {
  const formData = new FormData();
  formData.append("datei", daten.datei);
  formData.append("titel", daten.titel);
  formData.append("typ", daten.typ);
  if (daten.gueltig_bis) formData.append("gueltig_bis", daten.gueltig_bis);
  if (daten.notiz) formData.append("notiz", daten.notiz);
  const { data } = await apiClient.post<PartnerDokument>(
    `/partenaires/partner/${partnerId}/dokumente/`,
    formData,
  );
  return data;
}

export async function aendernDokument(
  id: string,
  daten: Partial<Pick<PartnerDokument, "titel" | "typ" | "gueltig_bis" | "notiz">>,
): Promise<PartnerDokument> {
  const { data } = await apiClient.patch<PartnerDokument>(`/partenaires/dokumente/${id}/`, daten);
  return data;
}

export async function loescheDokument(id: string): Promise<void> {
  await apiClient.delete(`/partenaires/dokumente/${id}/`);
}

// --- Verknüpfung (Logo-Haken) -------------------------------------------------------------

export async function aendernVerknuepfung(
  id: string,
  daten: Partial<Pick<PartnerVerknuepfung, "notiz" | "logo_anzeigen">>,
): Promise<PartnerVerknuepfung> {
  const { data } = await apiClient.patch<PartnerVerknuepfung>(
    `/partenaires/verknuepfungen/${id}/`,
    daten,
  );
  return data;
}

// --- Angebotsvergleich --------------------------------------------------------------------

export async function getAngebote(projetId: string): Promise<Angebot[]> {
  const { data } = await apiClient.get<Angebot[]>("/partenaires/angebote/", {
    params: { projet: projetId },
  });
  return data;
}

export async function creerAngebot(daten: AngebotDaten): Promise<Angebot> {
  const { data } = await apiClient.post<Angebot>("/partenaires/angebote/", daten);
  return data;
}

export async function loescheAngebot(id: string): Promise<void> {
  await apiClient.delete(`/partenaires/angebote/${id}/`);
}

export async function angebotAktion(
  id: string,
  aktion: "zuschlag" | "zuruecksetzen",
): Promise<Angebot> {
  const { data } = await apiClient.post<Angebot>(`/partenaires/angebote/${id}/${aktion}/`);
  return data;
}

// --- Import aus Ausgaben --------------------------------------------------------------------

export async function importAusgaben(bestaetigen: boolean): Promise<ImportErgebnis> {
  const { data } = await apiClient.post<ImportErgebnis>("/partenaires/import-ausgaben/", {
    bestaetigen,
  });
  return data;
}

export async function getEinnahmen(partnerId: string): Promise<PartnerEinnahme[]> {
  const { data } = await apiClient.get<PartnerEinnahme[]>("/partenaires/einnahmen/", {
    params: { partner: partnerId },
  });
  return data;
}

export async function creerEinnahme(daten: EinnahmeDaten): Promise<PartnerEinnahme> {
  const { data } = await apiClient.post<PartnerEinnahme>("/partenaires/einnahmen/", daten);
  return data;
}

export async function loescheEinnahme(id: string): Promise<void> {
  await apiClient.delete(`/partenaires/einnahmen/${id}/`);
}

function reportingParams(f: PartnerReportingFiltre) {
  return {
    q: f.q.trim() || undefined,
    typ: f.typ || undefined,
    statut: f.statut || undefined,
    kategorie: f.kategorie.length ? f.kategorie.join(",") : undefined,
    rolle: f.rolle || undefined,
    ziel_typ: f.ziel_typ || undefined,
    bevorzugt: f.bevorzugt ? "1" : undefined,
    auf_startseite: f.auf_startseite ? "1" : undefined,
    von: f.von || undefined,
    bis: f.bis || undefined,
    min_umsatz: f.min_umsatz.trim() || undefined,
    max_umsatz: f.max_umsatz.trim() || undefined,
    sortierung: f.sortierung,
  };
}

export async function getReporting(filtre: PartnerReportingFiltre): Promise<PartnerReporting> {
  const { data } = await apiClient.get<PartnerReporting>("/partenaires/reporting/", {
    params: reportingParams(filtre),
  });
  return data;
}

export async function exportReporting(
  filtre: PartnerReportingFiltre,
): Promise<{ blob: Blob; nomFichier: string }> {
  const { data, headers } = await apiClient.get("/partenaires/reporting/export/", {
    params: reportingParams(filtre),
    responseType: "blob",
  });
  const treffer = /filename="?([^"]+)"?/.exec(String(headers["content-disposition"] ?? ""));
  return { blob: data, nomFichier: treffer?.[1] ?? "reporting_partner.xlsx" };
}

/** Öffentlich (ohne Anmeldung): Logos für das Startseiten-Banner. */
export async function getBanner(): Promise<BannerPartner[]> {
  const { data } = await apiClient.get<BannerPartner[]>("/partenaires/banner/");
  return data;
}
