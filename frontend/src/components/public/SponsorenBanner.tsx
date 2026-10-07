/**
 * Banner "Unsere Sponsoren und Business Partner" auf der Startseite (Nutzerwunsch 2026-10-07).
 * Zeigt mittig die Logos der Partner, bei denen in der Partnerverwaltung der Schalter "Im
 * Startseiten-Banner anzeigen" gesetzt ist (der Server liefert nur aktive Partner mit Logo, siehe
 * PartnerBannerView). Ein Klick auf das Logo öffnet die Website des Partners — nur wenn sie
 * gepflegt ist und mit http(s) beginnt. Ohne Logos bleibt der Platz für Besucher leer; die
 * Verwaltung (ab Rolle RH) sieht stattdessen einen Platzhalter mit Link zur Partnerverwaltung.
 */
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { usePartnerBanner } from "../../hooks/usePartner";
import { hasRoleAtLeast, ROLE_LEVELS, useAuthStore } from "../../store/authStore";

function sicherUrl(url: string): string | null {
  return /^https?:\/\//i.test(url) ? url : null;
}

export default function SponsorenBanner() {
  const { t } = useTranslation("public");
  const { data: partner = [], isLoading } = usePartnerBanner();
  const verwaltung = hasRoleAtLeast(
    useAuthStore((s) => s.user),
    ROLE_LEVELS.rh,
  );
  if (isLoading) return null;

  if (partner.length === 0) {
    if (!verwaltung) return null;
    return (
      <section
        aria-labelledby="sponsoren-titel"
        className="rounded-cid-lg border border-dashed border-text-tertiary/40 px-4 py-8 text-center"
      >
        <h2 id="sponsoren-titel" className="font-display text-xl font-bold text-text-primary">
          {t("sponsoren.titel")}
        </h2>
        <p className="mt-2 text-sm text-text-tertiary">{t("sponsoren.platzhalter")}</p>
        <Link to="/admin/partner" className="mt-3 inline-block text-sm text-ca hover:underline">
          {t("sponsoren.zur_verwaltung")}
        </Link>
      </section>
    );
  }

  return (
    <section aria-labelledby="sponsoren-titel" className="text-center">
      <h2 id="sponsoren-titel" className="font-display text-xl font-bold text-text-primary">
        {t("sponsoren.titel")}
      </h2>
      <ul className="mt-5 flex flex-wrap items-center justify-center gap-4">
        {partner.map((p) => {
          const bild = (
            <img
              src={p.logo_url}
              alt={p.nom}
              title={p.nom}
              loading="lazy"
              className="h-14 max-w-[9rem] object-contain"
            />
          );
          const ziel = p.website ? sicherUrl(p.website) : null;
          return (
            <li key={p.id} className="p-2.5">
              {ziel ? (
                <a href={ziel} target="_blank" rel="noopener noreferrer" aria-label={p.nom}>
                  {bild}
                </a>
              ) : (
                bild
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
