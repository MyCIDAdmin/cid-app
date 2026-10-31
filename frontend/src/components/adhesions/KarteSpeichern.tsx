/**
 * Knopf „Karte als Bild speichern“ (Release 2026.11) : legt Vorder- und Rückseite samt QR als PNG
 * im Gerät ab, damit die Karte auch ohne Netz vorzeigbar ist. Das Bild entsteht im Browser.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { bildDateiname, bildSpeichern, erzeugeKartenBild } from "../../utils/karteBild";
import type { KartenBildDaten } from "../../utils/karteBild";

type Stand = "bereit" | "laeuft" | "gespeichert" | "fehler";

export default function KarteSpeichern({ daten }: { daten: Omit<KartenBildDaten, "texte"> }) {
  const { t } = useTranslation("adhesions");
  const [stand, setStand] = useState<Stand>("bereit");

  const speichern = async () => {
    setStand("laeuft");
    try {
      const blob = await erzeugeKartenBild({
        ...daten,
        texte: {
          titel: t("karte.titel"),
          mitgliedSeit: t("karte.mitglied_seit"),
          gueltigBis: t("karte.gueltig_bis"),
          rueckseite: t("karte.rueckseite_titel"),
          mehr: (anzahl) => t("karte.mehr_vorteile", { anzahl }),
        },
      });
      await bildSpeichern(blob, bildDateiname(daten.name));
      setStand("gespeichert");
    } catch {
      setStand("fehler");
    }
  };

  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={speichern}
        disabled={stand === "laeuft"}
        className="inline-flex items-center gap-2 rounded-cid border border-text-tertiary/30 bg-bg-primary px-3 py-1.5 text-sm font-medium text-text-secondary hover:bg-bg-tertiary disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ca"
      >
        <svg
          viewBox="0 0 24 24"
          aria-hidden="true"
          className="h-4 w-4"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 4v11m0 0l-4-4m4 4l4-4M5 19h14" />
        </svg>
        {stand === "laeuft" ? t("karte.speichern_laeuft") : t("karte.speichern")}
      </button>
      <p className="text-[11px] text-text-tertiary" role={stand === "fehler" ? "alert" : "status"}>
        {stand === "fehler"
          ? t("karte.speichern_fehler")
          : stand === "gespeichert"
            ? t("karte.gespeichert")
            : t("karte.speichern_hinweis")}
      </p>
    </div>
  );
}
