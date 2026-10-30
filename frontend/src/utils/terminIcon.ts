/**
 * Icons der Kalenderarten (2026-10-30). Einträge aus anderen Modulen (Abstimmung, Umfrage,
 * Aufgabe, Zahlungsfristen …) haben ein eigenes Icon nach `quelle` ; sonst bestimmt die
 * Kategorie das Icon.
 */
import {
  IconAlarm,
  IconBallFootball,
  IconBriefcase,
  IconCalendar,
  IconCalendarEvent,
  IconCash,
  IconChartBar,
  IconChecklist,
  IconFlag,
  IconGavel,
  IconHeartHandshake,
  IconPlaneDeparture,
  IconShoppingCart,
  IconUsersGroup,
  type Icon,
} from "@tabler/icons-react";

import type { Kategorie, KalenderEintrag, Quelle } from "../types/kalender";

export const KATEGORIE_ICON: Record<Kategorie, Icon> = {
  sitzung: IconUsersGroup,
  veranstaltung: IconCalendarEvent,
  frist: IconAlarm,
  projekt: IconBriefcase,
  spieltag: IconBallFootball,
  abwesenheit: IconPlaneDeparture,
  dienst: IconHeartHandshake,
  vereinsdatum: IconFlag,
  sonstiges: IconCalendar,
};

const QUELLE_ICON: Partial<Record<Quelle, Icon>> = {
  abstimmung: IconGavel,
  umfrage: IconChartBar,
  aufgabe: IconChecklist,
  dienst: IconHeartHandshake,
  event_zahlung: IconCash,
  kampagne: IconCash,
  beitrag: IconCash,
  bestellung_zahlung: IconCash,
  shop_reservierung: IconShoppingCart,
};

export function iconFuer(eintrag: Pick<KalenderEintrag, "kategorie" | "quelle">): Icon {
  return QUELLE_ICON[eintrag.quelle] ?? KATEGORIE_ICON[eintrag.kategorie] ?? IconCalendar;
}
