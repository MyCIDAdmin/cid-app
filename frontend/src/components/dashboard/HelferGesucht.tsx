/**
 * Kachel „Gesucht: Helferinnen und Helfer“ auf der Übersicht (Nov. 2026) : volle Breite direkt
 * unter den Schnellzugriffen, farbig abgesetzt, mit sanft pulsierendem Rand, winkender Hand und
 * Glanz (nur ohne „reduzierte Bewegung“, siehe index.css). Zeigt die jüngsten offenen Gesuche
 * (Projekt-Stellen und freie Gesuche) und führt zum Tab „Hilfe gesucht“. Ohne offene Gesuche
 * erscheint keine Kachel.
 */
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { useOffeneStellen } from "../../hooks/useProjets";
import type { ProjetStelle } from "../../types/projets";

const SICHTBAR = 3;

function ziel(stelle: ProjetStelle): string {
  return stelle.projet ? `/projets/${stelle.projet}` : "/projets?tab=hilfe";
}

export default function HelferGesucht({ aktiv = true }: { aktiv?: boolean }) {
  const { t } = useTranslation("dashboard");
  const stellen = useOffeneStellen({ enabled: aktiv });
  const offene = [...(stellen.data ?? [])].sort((a, b) => b.created_at.localeCompare(a.created_at));
  if (offene.length === 0) return null;
  const gezeigt = offene.slice(0, SICHTBAR);
  const weitere = offene.length - gezeigt.length;

  return (
    <section
      className="helfer-kachel helfer-glanz relative overflow-hidden rounded-cid-lg bg-gradient-to-r from-ca to-cad p-4 text-white shadow-md sm:p-5"
      data-testid="dashboard-stellen"
      aria-label={t("stellen.titre")}
    >
      <div className="relative flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex flex-wrap items-center gap-x-2 gap-y-1 text-base font-bold sm:text-lg">
            <span className="helfer-hand text-2xl" aria-hidden>
              🙋
            </span>
            {t("stellen.titre")}
            <span className="whitespace-nowrap rounded-full bg-white/20 px-2 py-0.5 text-xs font-semibold">
              {t("stellen.anzahl", { count: offene.length })}
            </span>
          </h2>
          <p className="mt-0.5 text-sm text-white/85">{t("stellen.untertitel")}</p>
        </div>
        <Link
          to="/projets?tab=hilfe"
          className="rounded-cid bg-white px-3 py-1.5 text-sm font-semibold text-ca shadow-sm transition hover:bg-white/90"
        >
          {t("stellen.alle")}
        </Link>
      </div>

      <ul className="relative mt-3 grid gap-2 sm:grid-cols-3">
        {gezeigt.map((stelle) => (
          <li key={stelle.id} className="min-w-0 animate-slide-in-fade">
            <Link
              to={ziel(stelle)}
              className="block h-full rounded-cid bg-white/15 px-3 py-2 text-sm backdrop-blur-sm transition hover:bg-white/25"
            >
              <span className="block truncate font-semibold">{stelle.titel}</span>
              <span className="block truncate text-xs text-white/80">
                {stelle.projet_titre ?? stelle.kategorie_detail?.name_de ?? t("stellen.vom_verein")}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {weitere > 0 && (
        <p className="relative mt-2 text-xs text-white/80">
          {t("stellen.weitere", { count: weitere })}
        </p>
      )}
    </section>
  );
}
