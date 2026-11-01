/**
 * Steuert Willkommensfenster und Rundgang (Konzept_Erste_Schritte_Tour.md). Wird einmal im
 * AppLayout eingehängt. Der Rundgang verändert die Seitenleiste nur vorübergehend : aufgeklappte
 * Gruppen, die erweiterte Leiste und das Handy-Menü werden am Ende wieder auf den Stand der
 * Person zurückgesetzt.
 */
import { useEffect, useRef } from "react";

import { useEscapeSchliessen } from "../../hooks/useEscapeSchliessen";
import { speichereTour, useTourMerker } from "../../hooks/useTour";
import { useTourStationen } from "../../hooks/useTourStationen";
import { useAuthStore } from "../../store/authStore";
import { useTourStore } from "../../store/tourStore";
import { useUiStore, type SidebarGroupKey, type SidebarSubgroupKey } from "../../store/uiStore";
import {
  morgenIso,
  nachAbschluss,
  nachNieMehr,
  nachUeberspringen,
  istGruppenRundgang,
  statusVon,
  willkommenArten,
  type RundgangArt,
  type TourStation,
} from "../../utils/tour";
import TourKarte from "./TourKarte";
import WillkommenDialog from "./WillkommenDialog";

function istDesktop(): boolean {
  return (
    typeof window.matchMedia !== "function" || window.matchMedia("(min-width: 1024px)").matches
  );
}

interface Merkzettel {
  sidebar: boolean;
  gruppen: SidebarGroupKey[];
  untergruppen: SidebarSubgroupKey[];
}

export default function TourHost({ onTiroir }: { onTiroir: (offen: boolean) => void }) {
  const user = useAuthStore((s) => s.user);
  const tour = useTourMerker();
  const stationen = useTourStationen();
  const lauf = useTourStore((s) => s.lauf);
  const verborgen = useTourStore((s) => s.willkommenVerborgen);
  const { starten, gehezu, beenden, verbergeWillkommen, zeigeWillkommen } = useTourStore.getState();

  const liste: TourStation[] = !lauf
    ? []
    : istGruppenRundgang(lauf.art)
      ? (stationen.gruppen[lauf.art] ?? [])
      : lauf.art === "app"
        ? stationen.app
        : stationen.verwaltung;
  const station = lauf ? liste[lauf.schritt] : undefined;

  const arten =
    stationen.bereit && !lauf && !verborgen && user
      ? willkommenArten(tour, stationen.verfuegbar, new Date())
      : [];

  // --- Seitenleiste für die aktuelle Station vorbereiten (und danach zurücksetzen) -------------
  const merk = useRef<Merkzettel>({ sidebar: false, gruppen: [], untergruppen: [] });
  const aktiv = lauf !== null;

  useEffect(() => {
    if (!station) return;
    if (station.ziel === "hilfe") {
      onTiroir(false);
      return;
    }
    const ui = useUiStore.getState();
    if (istDesktop()) {
      if (ui.sidebarCollapsed) {
        merk.current.sidebar = true;
        ui.setSidebarCollapsed(false);
      }
    } else {
      onTiroir(true);
    }
    if (station.gruppe && ui.collapsedGroups[station.gruppe]) {
      merk.current.gruppen.push(station.gruppe);
      ui.toggleGroup(station.gruppe);
    }
    if (station.subgruppe && ui.collapsedSubgroups[station.subgruppe]) {
      merk.current.untergruppen.push(station.subgruppe);
      ui.toggleSubgroup(station.subgruppe);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [station?.id, lauf?.art]);

  useEffect(() => {
    if (!aktiv) return;
    return () => {
      const ui = useUiStore.getState();
      const m = merk.current;
      m.gruppen.forEach((g) => {
        if (!useUiStore.getState().collapsedGroups[g]) ui.toggleGroup(g);
      });
      m.untergruppen.forEach((g) => {
        if (!useUiStore.getState().collapsedSubgroups[g]) ui.toggleSubgroup(g);
      });
      if (m.sidebar) ui.setSidebarCollapsed(true);
      merk.current = { sidebar: false, gruppen: [], untergruppen: [] };
      onTiroir(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aktiv]);

  // --- Abläufe -------------------------------------------------------------------------------
  function ueberspringen() {
    // Gruppen-Rundgänge aus der Hilfe merken nichts und berühren die Haupt-Rundgänge nicht.
    if (lauf && istGruppenRundgang(lauf.art)) {
      beenden();
      return;
    }
    const aenderung = nachUeberspringen(tour, stationen.verfuegbar);
    beenden();
    if (Object.keys(aenderung).length > 0) void speichereTour(aenderung);
  }

  function fertig(art: RundgangArt) {
    beenden();
    if (istGruppenRundgang(art)) return;
    void speichereTour(nachAbschluss(art));
    // Zweiter Rundgang noch offen (z. B. Verwaltung nach App) : Willkommensfenster erneut anbieten.
    const rest = stationen.verfuegbar.filter((a) => a !== art && statusVon(tour, a) === "offen");
    if (rest.length > 0) zeigeWillkommen();
  }

  useEscapeSchliessen(ueberspringen, aktiv);

  if (!user) return null;

  if (lauf && station) {
    return (
      <TourKarte
        station={station}
        schritt={lauf.schritt}
        gesamt={liste.length}
        onWeiter={() =>
          lauf.schritt >= liste.length - 1 ? fertig(lauf.art) : gehezu(lauf.schritt + 1)
        }
        onZurueck={() => gehezu(Math.max(0, lauf.schritt - 1))}
        onUeberspringen={ueberspringen}
      />
    );
  }

  if (arten.length > 0) {
    return (
      <WillkommenDialog
        arten={arten}
        istFan={Boolean(user.ist_fan)}
        name={user.prenom ?? ""}
        minutenVerwaltung={Math.max(1, Math.round(stationen.verwaltung.length * 0.4))}
        onStart={(art) => starten(art)}
        onSpaeter={() => {
          verbergeWillkommen();
          void speichereTour({ spaeter_bis: morgenIso(new Date()) });
        }}
        onNieMehr={() => {
          verbergeWillkommen();
          void speichereTour(nachNieMehr());
        }}
      />
    );
  }
  return null;
}
