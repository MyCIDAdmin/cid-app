/**
 * Vorteile eines Angebots als Kacheln mit Symbol (Seite „Meine Mitgliedschaft“, Release 2026.11).
 * Hat ein Vorteil ein Ziel (z. B. Shop), führt die Kachel dorthin. `ohneLinks` zeigt dieselben
 * Kacheln ohne Link (Vorschau in der Verwaltung).
 */
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import type { AvantageOffre } from "../../types/adhesion";
import VorteilSymbol from "./VorteilSymbol";
import { zielRoute } from "./vorteile";

const KACHEL = "flex h-full flex-col gap-2 rounded-cid bg-bg-secondary p-3 text-left";

export default function VorteileKacheln({
  vorteile,
  ohneLinks = false,
}: {
  vorteile: AvantageOffre[];
  ohneLinks?: boolean;
}) {
  const { t } = useTranslation("adhesions");
  if (vorteile.length === 0) return null;

  return (
    <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {vorteile.map((v) => {
        const route = ohneLinks ? null : zielRoute(v.ziel);
        const inhalt = (
          <>
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-cal text-ca">
              <VorteilSymbol name={v.icone} />
            </span>
            <span className="text-sm font-semibold leading-snug text-text-primary">
              {v.texte_fr}
            </span>
            {route && (
              <span className="mt-auto text-[11px] font-medium text-ca">
                {t(`vorteile.ziel.${v.ziel}`)} →
              </span>
            )}
          </>
        );
        return (
          <li key={`${v.ordre}-${v.texte_fr}`}>
            {route ? (
              <Link
                to={route}
                className={`${KACHEL} transition hover:-translate-y-0.5 hover:bg-cal focus-visible:outline focus-visible:outline-2 focus-visible:outline-ca`}
                aria-label={t("vorteile.oeffnen_aria", {
                  vorteil: v.texte_fr,
                  ziel: t(`vorteile.ziel.${v.ziel}`),
                })}
              >
                {inhalt}
              </Link>
            ) : (
              <div className={KACHEL}>{inhalt}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
