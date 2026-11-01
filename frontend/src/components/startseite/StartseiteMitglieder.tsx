/**
 * Startseite nach der Anmeldung (Route "/" im AppLayout), Vorschlag B „Gemeinschaft“ (Wunsch vom
 * 2026-11-01, Reihenfolge laut „Startseite_Einordnung“) — von oben nach unten :
 *   1. Hero und die zwei Kacheln unter dem Hero-Video (StartseiteKopf, einstellbar wie bisher)
 *   2. Nächstes Spiel
 *   3. Club Africain Live (Tabelle / Spielplan)
 *   4. Regionen-Arena
 *   5. Wir sind Clubistes | Fotoalben
 *   6. Kennzahlen (Spender, Gesammelt, Projekte)
 *   7. Projekte im Fokus | Neu im Shop
 *   8. Sponsoren und Partner
 * „Veranstaltungen“ steht hier nicht mehr (Termine bleiben unter „Veranstaltungen“ und „Kalender“).
 * Die Themen der Übersicht (Tipp, Hinweise, Termine, Stand, Zahlungen …) kommen hier absichtlich
 * nicht vor. Die öffentliche Startseite (AccueilTab) bleibt unverändert.
 */
import FanClubPreview from "../public/FanClubPreview";
import KennzahlenBar from "../public/KennzahlenBar";
import NextMatchTile from "../public/NextMatchTile";
import SponsorenBanner from "../public/SponsorenBanner";
import StartseiteKopf from "../public/StartseiteKopf";
import FotoalbenKarte from "./FotoalbenKarte";
import ProjekteImFokus from "./ProjekteImFokus";
import RegionenArena from "./RegionenArena";
import ShopNeuheiten from "./ShopNeuheiten";
import WirSindClubistes from "./WirSindClubistes";

// Zwei Karten nebeneinander ; fehlt eine (Modul geschlossen, keine Daten), füllt die andere die
// Zeile, und eine ganz leere Zeile verschwindet (`empty:hidden`).
const ZEILE = "grid grid-cols-[repeat(auto-fit,minmax(min(100%,22rem),1fr))] gap-4 empty:hidden";

export default function StartseiteMitglieder() {
  return (
    <div className="mx-auto max-w-6xl space-y-10 px-4 py-16 sm:px-6">
      <StartseiteKopf />
      <NextMatchTile />
      <FanClubPreview />
      <RegionenArena />
      <div className={ZEILE}>
        <WirSindClubistes />
        <FotoalbenKarte />
      </div>
      <KennzahlenBar />
      <div className={ZEILE}>
        <ProjekteImFokus />
        <ShopNeuheiten />
      </div>
      <SponsorenBanner />
    </div>
  );
}
