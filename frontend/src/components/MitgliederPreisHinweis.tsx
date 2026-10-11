/**
 * Hinweis „Mitglieder zahlen weniger" (Anfrage vom 2026-10-11 : bei Veranstaltungen und Shop-
 * Produkten soll Nicht-Mitgliedern der günstigere Mitgliederpreis als Hinweis gezeigt werden, um
 * sie zur Mitgliedschaft zu motivieren).
 *
 * Reine Anzeige : der tatsächlich berechnete Betrag kommt weiterhin ausschließlich vom Server
 * (CLAUDE.md §8). Der Hinweis erscheint nur, wenn der Mitgliederpreis WIRKLICH niedriger ist als
 * der Preis, den die Person aktuell sieht, und nicht für Funktionsrollen (RH und höher), die die
 * Mitgliedschaft nicht „kaufen" müssen. Besucher ohne Login sehen ihn ebenfalls ; der Link führt
 * zu /mon-adhesion (nicht eingeloggt → Login, danach zurück dorthin).
 */
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { useAuthStore } from "../store/authStore";
import { mitgliederPreisIstGuenstiger } from "../utils/mitgliederPreis";

function formatEuro(betrag: number): string {
  return `${betrag.toFixed(2).replace(".", ",")} €`;
}

export default function MitgliederPreisHinweis({
  mitgliederPreis,
  aktuellerPreis,
  mitLink = true,
  className = "",
}: {
  mitgliederPreis: string | number | null | undefined;
  aktuellerPreis: string | number;
  /** `false` in Kacheln, die als Ganzes verlinkt sind (kein Link im Link). */
  mitLink?: boolean;
  className?: string;
}) {
  const { t } = useTranslation("common");
  const user = useAuthStore((s) => s.user);

  if (user && user.role !== "membre") return null;
  if (!mitgliederPreisIstGuenstiger(mitgliederPreis, aktuellerPreis)) return null;

  const ersparnis = Number(aktuellerPreis) - Number(mitgliederPreis);

  return (
    <p
      data-testid="mitglieder-preis-hinweis"
      className={`flex flex-wrap items-center gap-x-2 gap-y-0.5 rounded-md bg-status-successBg px-2 py-1 text-xs text-status-successText ${className}`}
    >
      <span>
        {t("mitgliederpreis.hinweis", {
          preis: formatEuro(Number(mitgliederPreis)),
          ersparnis: formatEuro(ersparnis),
        })}
      </span>
      {mitLink && (
        <Link to="/mon-adhesion" className="relative z-10 font-semibold underline">
          {t("mitgliederpreis.cta")}
        </Link>
      )}
    </p>
  );
}
