/** Client API — Aktivität (Release 20), backend/apps/aktivitaet/views.py. */
import { apiClient } from "./client";
import type {
  AktionenListe,
  Auffaelligkeit,
  AuffaelligkeitenListe,
  AuffaelligkeitStatus,
  Journal,
  JournalFilter,
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
