/**
 * Auswahllisten für die Album-Verwaltung (Verknüpfung mit Veranstaltung/Projekt, Wunsch vom
 * 2026-10-20). Die Listen-Endpunkte sind cursor-paginiert (20 pro Seite) — für ein Dropdown
 * werden alle Seiten geladen (Obergrenze 10 Seiten = 200 Einträge, mehr ist in einer Auswahlliste
 * ohnehin nicht sinnvoll bedienbar).
 */
import { useQuery } from "@tanstack/react-query";

import { listEvenements } from "../api/evenements";
import { listProjets } from "../api/projets";
import type { CursorPage } from "../types/membre";

const MAX_SEITEN = 10;

function cursorAus(next: string | null): string | undefined {
  if (!next) return undefined;
  try {
    return new URL(next, window.location.origin).searchParams.get("cursor") ?? undefined;
  } catch {
    return undefined;
  }
}

async function alleSeiten<T>(laden: (cursor?: string) => Promise<CursorPage<T>>): Promise<T[]> {
  const alle: T[] = [];
  let cursor: string | undefined;
  for (let i = 0; i < MAX_SEITEN; i += 1) {
    const seite = await laden(cursor);
    alle.push(...seite.results);
    cursor = cursorAus(seite.next);
    if (!cursor) break;
  }
  return alle;
}

export function useAlleEvenements(enabled = true) {
  return useQuery({
    queryKey: ["evenements", "auswahl-alle"],
    queryFn: () => alleSeiten((cursor) => listEvenements({ cursor })),
    enabled,
  });
}

export function useAlleProjets(enabled = true) {
  return useQuery({
    queryKey: ["projets", "auswahl-alle"],
    queryFn: () => alleSeiten((cursor) => listProjets({ cursor })),
    enabled,
  });
}
