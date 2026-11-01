/**
 * „Projekte im Fokus“ der Startseite nach der Anmeldung (Vorschlag B, 2026-11) : die wichtigsten
 * laufenden Projekte mit Stand der Sammlung. Dachprojekte (mit Teilprojekten und Meilensteinen)
 * stehen zuerst. Alle Beträge kommen fertig vom Server (`montant_collecte`), nichts wird im
 * Browser neu berechnet. Ohne laufende Projekte oder bei geschlossenem Modul erscheint nichts.
 */
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { useProjets } from "../../hooks/useProjets";
import { useModuleOuvert } from "../../hooks/useRbac";
import type { Projet } from "../../types/projets";
import { formatBetrag } from "../../utils/partner";
import { uebersetzt } from "../../utils/uebersetzung";
import { waehleProjekte } from "../../utils/startseite";

function Zeile({ projekt }: { projekt: Projet }) {
  const { t, i18n } = useTranslation("public");
  const sprache = i18n.language;
  const gesammelt = Number(projekt.montant_collecte);
  const ziel = projekt.objectif_montant ? Number(projekt.objectif_montant) : 0;
  const anteil = ziel > 0 ? Math.min(100, Math.round((gesammelt / ziel) * 100)) : null;
  const teile = projekt.nb_teilprojekte ?? 0;
  const gesamt = projekt.meilensteine_gesamt ?? 0;
  let unterzeile = "";
  if (teile > 0) {
    unterzeile = t("startseite.projekte.dach", {
      erledigt: projekt.meilensteine_erledigt ?? 0,
      gesamt,
      count: teile,
    });
  } else if (projekt.parent_detail) {
    unterzeile = t("startseite.projekte.teilprojekt", {
      titel: uebersetzt(projekt.parent_detail, "titre"),
    });
  }

  return (
    <li>
      <Link to={`/projets/${projekt.id}`} className="block rounded-cid p-1 hover:bg-bg-secondary">
        <div className="flex items-baseline justify-between gap-3 text-sm font-bold text-text-primary">
          <span className="min-w-0 truncate">{uebersetzt(projekt, "titre")}</span>
          <span className="shrink-0 tabular-nums">
            {formatBetrag(gesammelt, sprache)}
            {ziel > 0 && (
              <span className="font-normal text-text-tertiary">
                {" "}
                / {formatBetrag(ziel, sprache)}
              </span>
            )}
          </span>
        </div>
        {anteil !== null && (
          <div
            role="progressbar"
            aria-valuenow={anteil}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={uebersetzt(projekt, "titre")}
            className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-bg-tertiary"
          >
            <div className="h-full rounded-full bg-ca" style={{ width: `${anteil}%` }} />
          </div>
        )}
        {unterzeile && <div className="mt-1 text-xs text-text-tertiary">{unterzeile}</div>}
      </Link>
    </li>
  );
}

function Liste() {
  const { t } = useTranslation("public");
  const { data } = useProjets();
  const projekte = waehleProjekte([...(data?.results ?? [])]);
  if (projekte.length === 0) return null;

  return (
    <section
      aria-labelledby="projekte-titel"
      className="h-full rounded-cid-lg bg-bg-primary p-4 shadow-sm sm:p-6"
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 id="projekte-titel" className="font-display text-lg font-bold text-text-primary">
          {t("startseite.projekte.titel")}
        </h2>
        <Link
          to="/projets"
          className="rounded-cid border border-text-tertiary/30 px-3 py-1 text-xs font-semibold text-text-primary hover:border-ca"
        >
          {t("startseite.projekte.alle")} →
        </Link>
      </div>
      <ul className="space-y-3">
        {projekte.map((p) => (
          <Zeile key={p.id} projekt={p} />
        ))}
      </ul>
    </section>
  );
}

export default function ProjekteImFokus() {
  const { ouvert } = useModuleOuvert("projets");
  if (!ouvert) return null;
  return <Liste />;
}
