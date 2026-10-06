/** Mitgliedskarte mit den Daten des angemeldeten Mitglieds (Name, Nummer, Eintrittsjahr) plus den
 * Vorteilen des Angebots. Eigene Komponente, damit die Mitgliederdaten nur geladen werden, wenn
 * die Karte wirklich angezeigt wird (bezahlte Mitgliedschaft). */
import { useTranslation } from "react-i18next";

import { useMembreMoi } from "../../hooks/useMembres";
import { useAuthStore } from "../../store/authStore";
import MitgliedsKarte from "./MitgliedsKarte";

export default function MitgliedsKarteAbschnitt({
  stil,
  angebot,
  kampagne,
  gueltigBis,
  vorteile,
}: {
  stil: string | null | undefined;
  angebot: string;
  kampagne?: string;
  gueltigBis?: string;
  vorteile: string[];
}) {
  const { t } = useTranslation("adhesions");
  const user = useAuthStore((s) => s.user);
  const membre = useMembreMoi().data;
  const name = membre
    ? `${membre.prenom} ${membre.nom}`.trim()
    : [user?.prenom, user?.nom].filter(Boolean).join(" ") || (user?.email ?? "");
  const seit = membre?.date_adhesion ? new Date(membre.date_adhesion).getFullYear().toString() : "";

  return (
    <div className="mb-5 space-y-3">
      <MitgliedsKarte
        stil={stil}
        angebot={angebot}
        name={name}
        mitgliedsnummer={membre?.numero_membre}
        mitgliedSeit={seit}
        gueltigBis={gueltigBis}
        kampagne={kampagne}
      />
      {vorteile.length > 0 && (
        <div>
          <div className="mb-1 text-xs uppercase text-text-tertiary">
            {t("hero.avantages_titre")}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {vorteile.map((v) => (
              <span
                key={v}
                className="rounded-full bg-bg-secondary px-2 py-0.5 text-xs text-text-secondary"
              >
                ✓ {v}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
