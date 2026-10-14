/** Client API — Aktivität (Release 20), backend/apps/aktivitaet/views.py. */
import { apiClient } from "./client";
import type {
  AktionenListe,
  Auffaelligkeit,
  AuffaelligkeitenListe,
  AuffaelligkeitStatus,
  Bericht,
  BerichteListe,
  Entscheidung,
  Journal,
  JournalFilter,
  Nutzung,
  Pflege,
  PflegeErgebnis,
  Review,
  ReviewKopf,
  ReviewListe,
  ReviewPosition,
  Uebersicht,
} from "../types/aktivitaet";

function bereinigt(filter: JournalFilter) {
  return Object.fromEntries(
    Object.entries(filter).filter(([, wert]) => wert !== undefined && wert !== ""),
  );
}

export async function getUebersicht(tage: number): Promise<Uebersicht> {
  const { data } = await apiClient.get<Uebersicht>("/aktivitaet/uebersicht/", {
    params: { tage },
  });
  return data;
}

export async function getJournal(filter: JournalFilter): Promise<Journal> {
  const { data } = await apiClient.get<Journal>("/aktivitaet/journal/", {
    params: bereinigt(filter),
  });
  return data;
}

export async function getAktionen(): Promise<AktionenListe> {
  const { data } = await apiClient.get<AktionenListe>("/aktivitaet/aktionen/");
  return data;
}

export async function exportJournal(
  filter: JournalFilter,
): Promise<{ blob: Blob; nomFichier: string }> {
  const ohneSeite = { ...filter };
  delete ohneSeite.seite;
  const { data, headers } = await apiClient.get("/aktivitaet/journal/export/", {
    params: bereinigt(ohneSeite),
    responseType: "blob",
  });
  const treffer = /filename="?([^"]+)"?/.exec(String(headers["content-disposition"] ?? ""));
  return { blob: data, nomFichier: treffer?.[1] ?? "aktivitaet.csv" };
}

export async function getAuffaelligkeiten(
  status: AuffaelligkeitStatus,
): Promise<AuffaelligkeitenListe> {
  const { data } = await apiClient.get<AuffaelligkeitenListe>("/aktivitaet/auffaelligkeiten/", {
    params: { status },
  });
  return data;
}

export async function erledigeAuffaelligkeit(id: string): Promise<Auffaelligkeit> {
  const { data } = await apiClient.post<Auffaelligkeit>(
    `/aktivitaet/auffaelligkeiten/${id}/erledigen/`,
  );
  return data;
}

export async function getNutzung(tage: number): Promise<Nutzung> {
  const { data } = await apiClient.get<Nutzung>("/aktivitaet/nutzung/", { params: { tage } });
  return data;
}

export async function getBerichte(): Promise<BerichteListe> {
  const { data } = await apiClient.get<BerichteListe>("/aktivitaet/berichte/");
  return data;
}

export async function getBericht(jahr: number, monat: number): Promise<Bericht> {
  const { data } = await apiClient.get<Bericht>(`/aktivitaet/berichte/${jahr}/${monat}/`);
  return data;
}

export async function erzeugeBericht(arg: { jahr: number; monat: number }): Promise<Bericht> {
  const { data } = await apiClient.post<Bericht>(
    `/aktivitaet/berichte/${arg.jahr}/${arg.monat}/erzeugen/`,
  );
  return data;
}

export async function sendeBericht(arg: { jahr: number; monat: number }): Promise<void> {
  await apiClient.post(`/aktivitaet/berichte/${arg.jahr}/${arg.monat}/senden/`);
}

export async function getReviews(): Promise<ReviewListe> {
  const { data } = await apiClient.get<ReviewListe>("/aktivitaet/review/");
  return data;
}

export async function getReview(id: string): Promise<Review> {
  const { data } = await apiClient.get<Review>(`/aktivitaet/review/${id}/`);
  return data;
}

export async function legeReviewAn(): Promise<ReviewKopf> {
  const { data } = await apiClient.post<ReviewKopf>("/aktivitaet/review/");
  return data;
}

export async function entscheideKonto(arg: {
  reviewId: string;
  positionId: string;
  entscheidung: Entscheidung;
  notiz: string;
}): Promise<ReviewPosition> {
  const { data } = await apiClient.post<ReviewPosition>(
    `/aktivitaet/review/${arg.reviewId}/positionen/${arg.positionId}/`,
    { entscheidung: arg.entscheidung, notiz: arg.notiz },
  );
  return data;
}

export async function schliesseReviewAb(id: string): Promise<Review> {
  const { data } = await apiClient.post<Review>(`/aktivitaet/review/${id}/abschliessen/`);
  return data;
}

export async function getPflege(): Promise<Pflege> {
  const { data } = await apiClient.get<Pflege>("/aktivitaet/pflege/");
  return data;
}

export async function speicherePflege(arg: {
  automatisch?: boolean;
  fristen?: Record<string, number | null>;
}): Promise<Pflege> {
  const { data } = await apiClient.put<Pflege>("/aktivitaet/pflege/", arg);
  return data;
}

export async function fuehrePflegeAus(arten: string[]): Promise<PflegeErgebnis> {
  const { data } = await apiClient.post<PflegeErgebnis>("/aktivitaet/pflege/ausfuehren/", {
    bestaetigt: true,
    arten,
  });
  return data;
}
