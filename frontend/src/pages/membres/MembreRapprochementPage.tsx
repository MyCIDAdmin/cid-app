/**
 * Zuordnung neuer Konten zu importierten Mitgliedern (Rapprochement), RH/Admin.
 *
 * Wenn sich jemand selbst registriert, wird bei identischer, bestätigter E-Mail automatisch die
 * importierte Karte verknüpft (siehe apps.membres.rapprochement). Alle übrigen Konten erscheinen
 * hier mit Vorschlägen und einer Wahrscheinlichkeit (E-Mail, CIN, Name, Geburtsdatum). RH/Admin
 * ordnet zu oder markiert "Kein Treffer". Route gated RH+ (wie die Import-Seite).
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import {
  useEcarterRapprochement,
  useFusionnerRapprochement,
  useRapprochementList,
} from "../../hooks/useMembres";
import type { RapprochementCandidat, RapprochementLigne } from "../../types/membre";
import { extractApiErrorMessage } from "../../utils/apiError";

/** Farbe des Wahrscheinlichkeits-Badges: >= 90 sehr wahrscheinlich, >= 60 wahrscheinlich. */
function niveau(score: number): "haut" | "moyen" | "bas" {
  if (score >= 90) return "haut";
  if (score >= 60) return "moyen";
  return "bas";
}

const BADGE_CLASSES: Record<"haut" | "moyen" | "bas", string> = {
  haut: "bg-status-successBg text-status-successText",
  moyen: "bg-status-warningBg text-status-warningText",
  bas: "bg-status-infoBg text-status-infoText",
};

function Candidat({
  candidat,
  enCours,
  onZuordnen,
}: {
  candidat: RapprochementCandidat;
  enCours: boolean;
  onZuordnen: (candidat: RapprochementCandidat) => void;
}) {
  const { t } = useTranslation("membres");
  const [confirmer, setConfirmer] = useState(false);
  const n = niveau(candidat.score);
  return (
    <li className="flex flex-wrap items-start justify-between gap-3 rounded-cid border border-text-tertiary/20 p-3">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-text-primary">
            {candidat.prenom} {candidat.nom}
          </span>
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-semibold ${BADGE_CLASSES[n]}`}
            data-testid="score"
          >
            {candidat.score} % · {t(`rapprochement.niveau.${n}`)}
          </span>
        </div>
        <p className="text-xs text-text-secondary">
          {candidat.numero_membre} · {candidat.email} · {candidat.date_naissance}
          {candidat.ville_de ? ` · ${candidat.ville_de}` : ""} · {t(`statut.${candidat.statut}`)}
        </p>
        <div className="mt-1 flex flex-wrap gap-1">
          {candidat.raisons.map((raison) => (
            <span
              key={raison}
              className="rounded bg-bg-tertiary px-1.5 py-0.5 text-xs text-text-secondary"
            >
              {t(`rapprochement.raison.${raison}`)}
            </span>
          ))}
        </div>
      </div>
      {confirmer ? (
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={enCours}
            onClick={() => onZuordnen(candidat)}
            className="rounded-cid bg-ca px-3 py-1.5 text-sm font-medium text-white hover:bg-cad disabled:opacity-40"
          >
            {t("rapprochement.confirmer")}
          </button>
          <button
            type="button"
            onClick={() => setConfirmer(false)}
            className="rounded-cid border border-text-tertiary/30 px-3 py-1.5 text-sm text-text-secondary hover:bg-bg-tertiary"
          >
            {t("rapprochement.annuler")}
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirmer(true)}
          className="rounded-cid bg-ca px-3 py-1.5 text-sm font-medium text-white hover:bg-cad"
        >
          {t("rapprochement.zuordnen")}
        </button>
      )}
    </li>
  );
}

function Ligne({ ligne }: { ligne: RapprochementLigne }) {
  const { t } = useTranslation("membres");
  const fusion = useFusionnerRapprochement();
  const ecarter = useEcarterRapprochement();
  const { inscrit } = ligne;
  const erreur = fusion.isError
    ? extractApiErrorMessage(fusion.error, t("rapprochement.erreur"))
    : ecarter.isError
      ? extractApiErrorMessage(ecarter.error, t("rapprochement.erreur"))
      : null;

  return (
    <section className="rounded-cid-lg bg-bg-primary p-5 shadow-sm">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-text-primary">
            {inscrit.prenom} {inscrit.nom}
          </h2>
          <p className="text-xs text-text-secondary">
            {t("rapprochement.konto")}: {inscrit.email} · {inscrit.date_naissance}
            {inscrit.ville_de ? ` · ${inscrit.ville_de}` : ""}
          </p>
        </div>
        <button
          type="button"
          disabled={ecarter.isPending}
          onClick={() => ecarter.mutate(inscrit.id)}
          className="rounded-cid border border-text-tertiary/30 px-3 py-1.5 text-sm text-text-secondary hover:bg-bg-tertiary disabled:opacity-40"
        >
          {t("rapprochement.kein_treffer")}
        </button>
      </div>
      <p className="mb-2 text-xs font-semibold uppercase text-text-tertiary">
        {t("rapprochement.vorschlaege")}
      </p>
      <ul className="space-y-2">
        {ligne.candidats.map((candidat) => (
          <Candidat
            key={candidat.id}
            candidat={candidat}
            enCours={fusion.isPending}
            onZuordnen={(c) => fusion.mutate({ inscritId: inscrit.id, importeId: c.id })}
          />
        ))}
      </ul>
      {erreur && <p className="mt-2 text-sm text-status-dangerText">{erreur}</p>}
    </section>
  );
}

export default function MembreRapprochementPage() {
  const { t } = useTranslation("membres");
  const { data, isLoading, isError } = useRapprochementList();

  return (
    <div>
      <Link to="/membres" className="mb-4 inline-block text-sm text-text-secondary hover:underline">
        ← {t("fiche.retour")}
      </Link>
      <h1 className="mb-1 text-xl font-bold text-text-primary">{t("rapprochement.titre")}</h1>
      <p className="mb-4 text-sm text-text-secondary">{t("rapprochement.beschreibung")}</p>

      {isLoading && <p className="text-sm text-text-secondary">{t("rapprochement.laden")}</p>}
      {isError && <p className="text-sm text-status-dangerText">{t("rapprochement.erreur")}</p>}
      {data && data.results.length === 0 && (
        <p className="rounded-cid-lg bg-bg-primary p-5 text-sm text-text-secondary shadow-sm">
          {t("rapprochement.leer")}
        </p>
      )}
      <div className="space-y-4">
        {data?.results.map((ligne) => (
          <Ligne key={ligne.inscrit.id} ligne={ligne} />
        ))}
      </div>
    </div>
  );
}
