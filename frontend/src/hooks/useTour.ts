/**
 * Merker der Erste-Schritte-Tour am Konto (`User.ui_praeferenzen.tour`). Die Änderung wirkt sofort
 * lokal und wird danach per PATCH /auth/me/ gespeichert (best effort : schlägt es fehl, gilt der
 * lokale Stand bis zum nächsten Laden). Das Backend ersetzt das Objekt `tour` als Ganzes, deshalb
 * wird immer der gesamte neue Merker gesendet.
 */
import { speicherePraeferenzen } from "../api/auth";
import { useAuthStore } from "../store/authStore";
import { useHilfeStore } from "../store/hilfeStore";
import { useTourStore } from "../store/tourStore";
import { TOUR_VERSION, type TourArt, type TourPraeferenz } from "../utils/tour";

export function useTourMerker(): TourPraeferenz | undefined {
  return useAuthStore((s) => s.user?.ui_praeferenzen?.tour);
}

export async function speichereTour(aenderung: Partial<TourPraeferenz>): Promise<void> {
  const user = useAuthStore.getState().user;
  if (!user) return;
  const neu: TourPraeferenz = { ...(user.ui_praeferenzen?.tour ?? {}), ...aenderung };
  for (const key of Object.keys(neu) as (keyof TourPraeferenz)[]) {
    if (neu[key] === undefined) delete neu[key];
  }
  neu.version = TOUR_VERSION;
  useAuthStore.getState().setUser({
    ...user,
    ui_praeferenzen: { ...(user.ui_praeferenzen ?? {}), tour: neu },
  });
  try {
    const gespeichert = await speicherePraeferenzen({ ui_praeferenzen: { tour: neu } });
    const aktuell = useAuthStore.getState().user;
    if (aktuell && aktuell.id === user.id) {
      useAuthStore.getState().setUser({ ...aktuell, ui_praeferenzen: gespeichert.ui_praeferenzen });
    }
  } catch {
    // best effort — der lokale Stand bleibt wirksam
  }
}

/** Startet einen Rundgang (auch aus der Hilfe, unabhängig vom gemerkten Stand). */
export function startTour(art: TourArt): void {
  useHilfeStore.getState().schliessen();
  useTourStore.getState().starten(art);
}
