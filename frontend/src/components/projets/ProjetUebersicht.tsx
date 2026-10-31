/**
 * Projektübersicht (Nutzerwunsch 2026-10-20): zeigt ein langfristiges (Dach-)Projekt als Ganzes —
 * Gesamtfortschritt, gesammelte Beiträge über alle Teilprojekte, Zeitachse, die Teilprojekte
 * (jedes bleibt ein eigenes Projekt mit eigener Seite) und die Meilensteine. Sie funktioniert
 * auch für ein Projekt ohne Teilprojekte (dann nur Zeitachse und Meilensteine), damit die
 * Projektleitung dort Meilensteine anlegen kann.
 */
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { useProjetUebersicht } from "../../hooks/useProjets";
import type { Projet } from "../../types/projets";
import { uebersetzt } from "../../utils/uebersetzung";
import AnimatedProgress from "../ui/AnimatedProgress";
import MeilensteineListe from "./MeilensteineListe";
import StatutProjetBadge from "./StatutProjetBadge";
import Zeitachse from "./Zeitachse";
import { lokaleSprache } from "../../utils/datum";

function formatMontant(montant: string | number): string {
  return `${Number(montant).toFixed(2).replace(".", ",")} €`;
}

function Kennzahl({ label, wert, zusatz }: { label: string; wert: string; zusatz?: string }) {
  return (
    <div className="rounded-cid border border-text-tertiary/20 p-3">
      <div className="text-xs text-text-tertiary">{label}</div>
      <div className="text-lg font-semibold text-text-primary">{wert}</div>
      {zusatz && <div className="text-xs text-text-tertiary">{zusatz}</div>}
    </div>
  );
}

export default function ProjetUebersicht({ projet }: { projet: Projet }) {
  const { t } = useTranslation("projets");
  const query = useProjetUebersicht(projet.id);

  if (query.isLoading) {
    return <p className="mt-6 text-sm text-text-tertiary">{t("page.chargement")}</p>;
  }
  if (query.isError || !query.data) {
    return <p className="mt-6 text-sm text-status-dangerText">{t("page.erreur_chargement")}</p>;
  }

  const { teilprojekte, meilensteine, summen } = query.data;
  const istDach = summen.teilprojekte_gesamt > 0;
  // Ohne Teilprojekte und ohne Meilensteine gibt es für Besucher nichts zu zeigen.
  if (!istDach && meilensteine.length === 0 && !projet.darf_team_verwalten) return null;

  const hatSumme = Number(summen.montant_collecte) > 0 || summen.objectif_montant !== null;

  return (
    <section className="mt-6" aria-labelledby="projekt-uebersicht-titel">
      <h2 id="projekt-uebersicht-titel" className="mb-3 text-base font-bold text-text-primary">
        {istDach ? t("dach.titel") : t("dach.titel_meilensteine")}
      </h2>

      {istDach && (
        <>
          <div className="mb-4 space-y-1.5 rounded-cid border border-text-tertiary/20 p-3">
            <div className="flex items-baseline justify-between text-sm">
              <span className="font-medium text-text-primary">{t("dach.fortschritt")}</span>
              <span className="font-semibold text-ca">{summen.fortschritt_prozent}%</span>
            </div>
            <AnimatedProgress value={summen.fortschritt_prozent} />
            <p className="text-xs text-text-tertiary">
              {summen.meilensteine_gesamt > 0
                ? t("dach.fortschritt_meilensteine")
                : t("dach.fortschritt_teilprojekte")}
            </p>
          </div>

          <div className="mb-4 grid gap-3 sm:grid-cols-3">
            <Kennzahl
              label={t("dach.teilprojekte_titel")}
              wert={String(summen.teilprojekte_gesamt)}
              zusatz={t("dach.teilprojekte_zaehler", {
                termine: summen.teilprojekte_termine,
                gesamt: summen.teilprojekte_gesamt,
              })}
            />
            <Kennzahl
              label={t("dach.meilensteine_titel")}
              wert={`${summen.meilensteine_erledigt}/${summen.meilensteine_gesamt}`}
              zusatz={t("dach.meilensteine_zaehler")}
            />
            {hatSumme && (
              <Kennzahl
                label={t("dach.gesammelt")}
                wert={formatMontant(summen.montant_collecte)}
                zusatz={
                  summen.objectif_montant
                    ? t("dach.ziel", { betrag: formatMontant(summen.objectif_montant) })
                    : t("dach.beitragende", { count: summen.nb_contributeurs })
                }
              />
            )}
          </div>
        </>
      )}

      {summen.beginn && summen.ende && (
        <div className="mb-4 rounded-cid border border-text-tertiary/20 p-3">
          <h3 className="mb-1 text-sm font-semibold text-text-primary">{t("dach.zeitachse")}</h3>
          <Zeitachse beginn={summen.beginn} ende={summen.ende} meilensteine={meilensteine} />
        </div>
      )}

      {istDach && (
        <div className="mb-4">
          <h3 className="mb-2 text-sm font-semibold text-text-primary">
            {t("dach.teilprojekte_titel")}
          </h3>
          <ul className="grid gap-3 sm:grid-cols-2">
            {teilprojekte.map((kind) => {
              const quote =
                kind.objectif_montant && Number(kind.objectif_montant) > 0
                  ? Math.min(
                      100,
                      (Number(kind.montant_collecte) / Number(kind.objectif_montant)) * 100,
                    )
                  : null;
              return (
                <li key={kind.id}>
                  <Link
                    to={`/projets/${kind.id}`}
                    className="block h-full rounded-cid-lg border border-text-tertiary/20 bg-card-gradient p-3 shadow-card hover:border-ca"
                  >
                    <div className="mb-1 flex items-start justify-between gap-2">
                      <span className="text-sm font-semibold text-text-primary">
                        {uebersetzt(kind, "titre")}
                      </span>
                      <StatutProjetBadge statut={kind.statut} />
                    </div>
                    {(kind.date_debut || kind.date_limite) && (
                      <p className="text-xs text-text-tertiary">
                        {[kind.date_debut, kind.date_limite]
                          .map((d) => (d ? new Date(d).toLocaleDateString(lokaleSprache()) : "…"))
                          .join(" – ")}
                      </p>
                    )}
                    {quote !== null && (
                      <div className="mt-2">
                        <AnimatedProgress value={quote} />
                        <p className="mt-1 text-xs text-text-tertiary">
                          {formatMontant(kind.montant_collecte)} /{" "}
                          {formatMontant(kind.objectif_montant as string)}
                        </p>
                      </div>
                    )}
                    {(kind.meilensteine_gesamt ?? 0) > 0 && (
                      <p className="mt-1 text-xs text-text-secondary">
                        {t("dach.kind_meilensteine", {
                          erledigt: kind.meilensteine_erledigt,
                          gesamt: kind.meilensteine_gesamt,
                        })}
                      </p>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div>
        <h3 className="mb-2 text-sm font-semibold text-text-primary">
          {t("dach.meilensteine_titel")}
        </h3>
        <MeilensteineListe
          projetId={projet.id}
          meilensteine={meilensteine}
          darfVerwalten={projet.darf_team_verwalten}
        />
      </div>
    </section>
  );
}
