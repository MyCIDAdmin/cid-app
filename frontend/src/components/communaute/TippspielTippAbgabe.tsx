/**
 * Abgabe der Tipps (Tippspiel, 2026-09-24) — une ligne par rencontre de Ligue 1 de Club
 * Africain encore ouverte aux pronostics ("Spiele aus den API Daten übernehmen", retour
 * utilisateur) : périmètre `competition === "Ligue 1"` (voir docstring de tête
 * TippspielTip côté backend), date-limite 1 jour avant le coup d'envoi ("Frist der Angabe
 * der Tipps 1 Tag vor dem Spiel") — recalculée côté client uniquement pour masquer le
 * formulaire (le backend reste seul juge, voir TippspielTipSerializer.validate).
 *
 * Les rencontres déjà couvertes par `useCalendrierRencontres()` (onglet Spielplan) sont
 * réutilisées telles quelles — même requête, même cache React Query, aucun appel réseau
 * supplémentaire côté backend.
 */
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  useCalendrierRencontres,
  useCreerTippspielTip,
  useModifierTippspielTip,
  useTippspielTipps,
} from "../../hooks/useCommunaute";
import type { RencontreCalendrier, TippspielTip } from "../../types/communaute";
import { extractApiErrorMessage } from "../../utils/apiError";
import EquipeLogoImage from "./EquipeLogoImage";

const UN_JOUR_MS = 24 * 60 * 60 * 1000;

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString();
}

function rencontresPronostiquables(rencontres: RencontreCalendrier[]): RencontreCalendrier[] {
  const maintenant = Date.now();
  return rencontres
    .filter(
      (r) =>
        r.competition === "Ligue 1" &&
        r.est_a_venir &&
        new Date(r.date_heure).getTime() - maintenant > UN_JOUR_MS,
    )
    .sort((a, b) => new Date(a.date_heure).getTime() - new Date(b.date_heure).getTime());
}

interface LigneProps {
  tippspielId: string;
  rencontre: RencontreCalendrier;
  tip?: TippspielTip;
}

function LigneTipp({ tippspielId, rencontre, tip }: LigneProps) {
  const { t } = useTranslation("communaute");
  const [scoreDomicile, setScoreDomicile] = useState(String(tip?.score_domicile ?? ""));
  const [scoreExterieur, setScoreExterieur] = useState(String(tip?.score_exterieur ?? ""));
  const [erreur, setErreur] = useState("");
  const [enregistre, setEnregistre] = useState(false);

  const creer = useCreerTippspielTip();
  const modifier = useModifierTippspielTip();
  const enCours = creer.isPending || modifier.isPending;

  function enregistrer(e: React.FormEvent) {
    e.preventDefault();
    const domicile = Number(scoreDomicile);
    const exterieur = Number(scoreExterieur);
    if (
      !Number.isInteger(domicile) ||
      !Number.isInteger(exterieur) ||
      domicile < 0 ||
      exterieur < 0
    ) {
      return;
    }
    setErreur("");
    setEnregistre(false);
    const onError = (err: unknown) =>
      setErreur(extractApiErrorMessage(err, t("tippspiel.tipp_fehler")));
    const onSuccess = () => setEnregistre(true);
    if (tip) {
      modifier.mutate(
        { id: tip.id, payload: { score_domicile: domicile, score_exterieur: exterieur } },
        { onSuccess, onError },
      );
    } else {
      creer.mutate(
        {
          tippspiel: tippspielId,
          rencontre: rencontre.id,
          score_domicile: domicile,
          score_exterieur: exterieur,
        },
        { onSuccess, onError },
      );
    }
  }

  return (
    <form
      onSubmit={enregistrer}
      className="flex flex-wrap items-center justify-between gap-2 rounded-cid-lg bg-bg-primary p-3 shadow-sm"
    >
      <div className="min-w-0">
        {/* Logos de clubs (retour utilisateur du 2026-10-08 : "Im Tippspiel die Logos der Vereine
            übernehmen, wenn die vorhanden sind") — même composant que Tabelle/Spielplan/Nächstes
            Spiel ; EquipeLogoImage n'affiche rien tant qu'aucun logo n'existe pour ce nom. */}
        <div className="flex min-w-0 items-center gap-1.5 text-sm font-bold text-text-primary">
          <EquipeLogoImage
            equipe={rencontre.equipe_domicile}
            className="h-6 w-6 shrink-0 object-contain"
          />
          <span className="truncate">
            {rencontre.equipe_domicile} — {rencontre.equipe_exterieur}
          </span>
          <EquipeLogoImage
            equipe={rencontre.equipe_exterieur}
            className="h-6 w-6 shrink-0 object-contain"
          />
        </div>
        <div className="text-xs text-text-tertiary">{formatDate(rencontre.date_heure)}</div>
      </div>
      <div className="flex items-center gap-2">
        <input
          type="number"
          min={0}
          inputMode="numeric"
          value={scoreDomicile}
          onChange={(e) => setScoreDomicile(e.target.value)}
          aria-label={t("tippspiel.tipp_heim_label", { equipe: rencontre.equipe_domicile })}
          className="w-14 rounded-cid border border-text-tertiary/30 px-2 py-1 text-center text-sm tabular-nums"
        />
        <span className="text-text-tertiary">:</span>
        <input
          type="number"
          min={0}
          inputMode="numeric"
          value={scoreExterieur}
          onChange={(e) => setScoreExterieur(e.target.value)}
          aria-label={t("tippspiel.tipp_gast_label", { equipe: rencontre.equipe_exterieur })}
          className="w-14 rounded-cid border border-text-tertiary/30 px-2 py-1 text-center text-sm tabular-nums"
        />
        <button
          type="submit"
          disabled={enCours}
          className="rounded-cid bg-ca px-3 py-1.5 text-xs font-medium text-white hover:bg-cad disabled:opacity-50"
        >
          {t("tippspiel.tipp_speichern")}
        </button>
      </div>
      {enregistre && !erreur && (
        <p className="w-full text-xs text-status-successText">{t("tippspiel.tipp_gespeichert")}</p>
      )}
      {erreur && <p className="w-full text-xs text-status-dangerText">{erreur}</p>}
    </form>
  );
}

export default function TippspielTippAbgabe({ tippspielId }: { tippspielId: string }) {
  const { t } = useTranslation("communaute");
  const calendrierQuery = useCalendrierRencontres();
  const tippsQuery = useTippspielTipps({ tippspiel: tippspielId });

  const rencontres = useMemo(
    () => rencontresPronostiquables(calendrierQuery.data?.results ?? []),
    [calendrierQuery.data],
  );
  const tippsParRencontre = useMemo(() => {
    const carte = new Map<string, TippspielTip>();
    for (const tip of tippsQuery.data?.results ?? []) carte.set(tip.rencontre, tip);
    return carte;
  }, [tippsQuery.data]);

  if (calendrierQuery.isLoading || tippsQuery.isLoading) {
    return <p className="text-sm text-text-tertiary">{t("tippspiel.chargement")}</p>;
  }
  if (rencontres.length === 0) {
    return <p className="text-sm text-text-tertiary">{t("tippspiel.tipps_leer")}</p>;
  }

  return (
    <div className="space-y-2">
      {rencontres.map((rencontre) => (
        <LigneTipp
          key={rencontre.id}
          tippspielId={tippspielId}
          rencontre={rencontre}
          tip={tippsParRencontre.get(rencontre.id)}
        />
      ))}
    </div>
  );
}
