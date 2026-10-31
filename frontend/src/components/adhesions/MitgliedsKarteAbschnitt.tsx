/**
 * Kopf der Seite „Meine Mitgliedschaft“ bei bezahlter Mitgliedschaft (Release 2026.11, Variante B
 * „Karte im Mittelpunkt“) : Status, große drehbare Mitgliedskarte (Rückseite = Vorteile) und
 * Kennzahlen. Eigene Komponente, damit die Mitgliederdaten nur geladen werden, wenn die Karte
 * wirklich angezeigt wird (bezahlte Mitgliedschaft).
 */
import { useTranslation } from "react-i18next";

import { useMeineKarte } from "../../hooks/useAdhesions";
import { useMembreMoi, useMonHistoriqueStatut } from "../../hooks/useMembres";
import { useAuthStore } from "../../store/authStore";
import type { AvantageOffre } from "../../types/adhesion";
import KarteSpeichern from "./KarteSpeichern";
import Kennzahlen from "./Kennzahlen";
import MitgliedsKarte from "./MitgliedsKarte";

export default function MitgliedsKarteAbschnitt({
  stil,
  angebot,
  kampagne,
  gueltigBis,
  vorteile,
  tage,
}: {
  stil: string | null | undefined;
  angebot: string;
  kampagne?: string;
  gueltigBis?: string;
  vorteile: AvantageOffre[];
  /** Tage bis zum Ende der Kampagne (null = unbekannt). */
  tage: number | null;
}) {
  const { t } = useTranslation("adhesions");
  const user = useAuthStore((s) => s.user);
  const membre = useMembreMoi().data;
  const verlauf = useMonHistoriqueStatut().data;
  const qr = useMeineKarte().data?.qr;
  const name = membre
    ? `${membre.prenom} ${membre.nom}`.trim()
    : [user?.prenom, user?.nom].filter(Boolean).join(" ") || (user?.email ?? "");
  const seit = membre?.date_adhesion ? new Date(membre.date_adhesion).getFullYear() : null;
  const jahre = verlauf ? verlauf.filter((e) => e.statut === "actif").length : null;
  const bald = tage != null && tage <= 30;

  return (
    <section
      className="mb-5 space-y-3 rounded-cid-lg bg-gradient-to-b from-cal to-bg-primary p-4 text-center shadow-sm"
      aria-label={t("karte.titel")}
    >
      <span
        className={`inline-flex items-center gap-1.5 rounded-full px-3 py-0.5 text-xs font-semibold ${
          bald
            ? "bg-status-warningBg text-status-warningText"
            : "bg-status-successBg text-status-successText"
        }`}
      >
        <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current" />
        {bald ? t("karte.status_bald") : t("karte.status_aktiv")}
      </span>

      <div className="flex justify-center">
        <MitgliedsKarte
          stil={stil}
          angebot={angebot}
          name={name}
          mitgliedsnummer={membre?.numero_membre}
          mitgliedSeit={seit ? String(seit) : ""}
          gueltigBis={gueltigBis}
          kampagne={kampagne}
          vorteile={vorteile}
          qr={qr}
        />
      </div>
      {(vorteile.length > 0 || qr) && (
        <p className="flex items-center justify-center gap-1.5 text-xs text-text-tertiary">
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
            <path d="M4 12a8 8 0 0113.7-5.6L20 8.5M20 4v4.5h-4.5M20 12a8 8 0 01-13.7 5.6L4 15.5M4 20v-4.5h4.5" />
          </svg>
          {t("karte.hinweis_umdrehen")}
        </p>
      )}

      {qr && (
        <div className="flex justify-center">
          <KarteSpeichern
            daten={{
              stil,
              angebot,
              name,
              mitgliedsnummer: membre?.numero_membre,
              mitgliedSeit: seit ? String(seit) : "",
              gueltigBis,
              kampagne,
              vorteile,
              qr,
            }}
          />
        </div>
      )}

      <Kennzahlen tage={tage} jahre={jahre} seit={seit} />
    </section>
  );
}
