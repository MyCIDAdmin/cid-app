/**
 * Hinweis auf der Übersicht : dringende Beitragsaktionen und Aktionen, die ihr Ziel fast erreicht
 * haben — nur für Mitglieder, die noch nicht dazu beigetragen haben (bezahlt oder in Prüfung).
 */
import { IconSpeakerphone } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { useArticlesCatalogue, useMesCotisations } from "../../hooks/useCotisations";
import { formatFrist, istDringlich, istWaehlbareAktion, tageBisFrist } from "../../utils/aktionen";

const MAX_HINWEISE = 3;

export default function AktionenHinweis() {
  const { t, i18n } = useTranslation("cotisations");
  const katalog = useArticlesCatalogue();
  const meine = useMesCotisations();

  const bereitsBeigetragen = new Set(
    (meine.data?.results ?? [])
      .filter((c) => c.article_catalogue && (c.statut === "payee" || c.statut === "en_attente"))
      .map((c) => c.article_catalogue as string),
  );

  const aktionen = (katalog.data?.results ?? [])
    .filter(istWaehlbareAktion)
    .filter((a) => !bereitsBeigetragen.has(a.id))
    .filter(
      (a) =>
        istDringlich(a) || (a.fortschritt !== null && a.fortschritt >= 80 && a.fortschritt < 100),
    )
    .sort((a, b) => Number(istDringlich(b)) - Number(istDringlich(a)))
    .slice(0, MAX_HINWEISE);

  if (aktionen.length === 0) return null;

  return (
    <section
      aria-label={t("aktion.hinweis.titel")}
      className="space-y-2"
      data-testid="aktionen-hinweis"
    >
      {aktionen.map((a) => {
        const tage = tageBisFrist(a.frist);
        const dringend = istDringlich(a);
        let text: string;
        if (dringend && a.frist && tage !== null && tage <= 3) {
          text = t("aktion.hinweis.frist_bald", {
            titel: a.libelle,
            datum: formatFrist(a.frist, i18n.language),
          });
        } else if (dringend) {
          text = t("aktion.hinweis.dringend", { titel: a.libelle });
        } else {
          text = t("aktion.hinweis.ziel_fast", { titel: a.libelle, prozent: a.fortschritt ?? 0 });
        }
        return (
          <Link
            key={a.id}
            to={`/mon-adhesion?aktion=${a.id}`}
            className="flex items-center gap-3 rounded-cid-lg bg-status-dangerBg px-4 py-3 text-sm text-status-dangerText shadow-sm transition-colors hover:brightness-95"
          >
            <IconSpeakerphone size={20} className="shrink-0" aria-hidden="true" />
            <span className="min-w-0 flex-1">{text}</span>
            <span className="shrink-0 text-xs font-semibold underline">
              {t("aktion.hinweis.aktion")}
            </span>
          </Link>
        );
      })}
    </section>
  );
}
