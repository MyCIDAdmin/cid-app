/** Logos der verknüpften Partner (Sponsoren/Kooperationen) auf Projekt- und Veranstaltungsseiten.
 * Die Liste kommt fertig gefiltert vom Server (`partner_logos`): nur Verknüpfungen mit gesetztem
 * Haken "Logo zeigen", vorhandenem Logo und nicht archiviertem Partner. */
import { useTranslation } from "react-i18next";

import type { PartnerLogoEintrag } from "../../types/partner";
import { sicherUrl } from "../../utils/sicherUrl";

export default function PartnerLogos({
  logos,
  className = "",
}: {
  logos: PartnerLogoEintrag[] | undefined;
  className?: string;
}) {
  const { t } = useTranslation("partner");
  if (!logos || logos.length === 0) return null;
  return (
    <section aria-label={t("logos_titel")} className={className}>
      <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-text-tertiary">
        {t("logos_titel")}
      </h2>
      <ul className="flex flex-wrap items-center gap-3">
        {logos.map((l) => {
          const bild = (
            <img
              src={l.logo_url}
              alt={l.nom}
              title={`${l.nom} · ${t(`rolle_${l.rolle}`)}`}
              loading="lazy"
              className="h-10 max-w-[7.5rem] object-contain"
            />
          );
          const ziel = l.website ? sicherUrl(l.website) : null;
          return (
            <li key={l.id} className="rounded-cid border border-text-tertiary/20 bg-white p-1.5">
              {ziel ? (
                <a href={ziel} target="_blank" rel="noopener noreferrer">
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
