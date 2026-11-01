/**
 * Stationen der beiden Rundgänge für das angemeldete Konto, abgeleitet aus derselben Sichtbarkeit
 * wie die Seitenleiste (useSidebarNav) : kein zweites Regelwerk, das auseinanderlaufen könnte.
 */
import { useMemo } from "react";

import { useSidebarNav } from "../components/layout/Sidebar";
import { useAuthStore } from "../store/authStore";
import {
  appStationen,
  verwaltungStationen,
  type TourArt,
  type TourStation,
  type VerwaltungUntergruppe,
} from "../utils/tour";
import { useMesAcces } from "./useRbac";

export interface TourStationen {
  app: TourStation[];
  verwaltung: TourStation[];
  /** Rundgänge, die das Konto überhaupt hat (Verwaltung nur mit sichtbaren Verwaltungs-Einträgen). */
  verfuegbar: TourArt[];
  /** Sichtbarkeit steht fest (Zugriffsrechte der Verwaltungsseiten sind geladen). */
  bereit: boolean;
}

export function useTourStationen(): TourStationen {
  const user = useAuthStore((s) => s.user);
  const { visibleItems, groups } = useSidebarNav();
  const { isLoading } = useMesAcces();
  const istFan = Boolean(user?.ist_fan);
  const hatVerwaltungsrolle = user !== null && user.role !== "membre";

  const sichtbarKey = visibleItems.map((i) => i.to).join("|");
  const verwaltungKey = groups
    .flatMap((g) => g.subgroups.map((s) => `${s.key}:${s.items.map((i) => i.to).join(",")}`))
    .join("|");

  return useMemo(() => {
    const sichtbar = new Set(sichtbarKey ? sichtbarKey.split("|") : []);
    const gruppeVon = new Map(visibleItems.map((i) => [i.to, i.group] as const));
    const untergruppen: VerwaltungUntergruppe[] = hatVerwaltungsrolle
      ? groups.flatMap((g) =>
          g.subgroups.map((s) => ({ key: s.key, tos: s.items.map((i) => i.to) })),
        )
      : [];
    const mitGruppe = (st: TourStation): TourStation =>
      st.gruppe || !gruppeVon.has(st.ziel) ? st : { ...st, gruppe: gruppeVon.get(st.ziel) };
    const app = appStationen(istFan, sichtbar).map(mitGruppe);
    const verwaltung = istFan ? [] : verwaltungStationen(untergruppen);
    const verfuegbar: TourArt[] = verwaltung.length > 0 ? ["app", "verwaltung"] : ["app"];
    return { app, verwaltung, verfuegbar, bereit: !(hatVerwaltungsrolle && isLoading) };
    // visibleItems/groups hängen an den Schlüsseln (stabile Zeichenketten statt neuer Arrays)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sichtbarKey, verwaltungKey, istFan, hatVerwaltungsrolle, isLoading]);
}
