/**
 * Page membre "Mon adhésion" (mockup #pg-mon-adhesion, FDD §4.1-4.3, AHM-21).
 *
 * Portée actée avec l'utilisateur : campagne active + offres, souscription
 * (avec rabais optionnel), historique des souscriptions passées — sans le
 * reçu PDF téléchargeable du mockup (pas d'endpoint backend, différé).
 *
 * Flux justificatif (AHM-20, ajouté après coup) : quand la souscription est
 * en_attente_justificatif, un formulaire d'upload apparaît (FDD §4.2 étape
 * 3). Le fichier ne transite jamais en clair — seule la file de validation
 * RH+ (AdminJustificatifsPage) télécharge le document, via une URL MinIO
 * pré-signée à courte durée de vie. Si le rabais est refusé, le motif du RH
 * est affiché : le membre garde la main pour payer plein tarif ou changer
 * d'offre via la liste ci-dessous (déjà ouverte puisque dejaPayee est faux).
 *
 * Le prix affiché en aperçu (offre.prix_plein / rabais) n'est qu'indicatif :
 * comme pour le stepper de cotisations, le prix réellement enregistré est
 * toujours recalculé par le serveur (CLAUDE.md §8, voir
 * SouscriptionViewSet.souscrire côté backend).
 */
import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  useCampagneActive,
  useCampagnes,
  useMesSouscriptions,
  useSouscrire,
  useUploaderJustificatif,
} from "../../hooks/useAdhesions";
import type { CampagneAdhesion, OffreAdhesion, Souscription, StatutSouscription } from "../../types/adhesion";
import { extractApiErrorMessage } from "../../utils/apiError";

const STATUT_STYLES: Record<StatutSouscription, string> = {
  brouillon: "bg-bg-tertiary text-text-secondary",
  en_attente_justificatif: "bg-status-warningBg text-status-warningText",
  en_attente_paiement: "bg-status-warningBg text-status-warningText",
  payee: "bg-status-successBg text-status-successText",
  rabais_refuse: "bg-status-dangerBg text-status-dangerText",
  annulee: "bg-bg-tertiary text-text-secondary",
  expiree: "bg-bg-tertiary text-text-secondary",
};

function formatMontant(montant: string | number): string {
  return `${Number(montant).toFixed(2).replace(".", ",")} €`;
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString();
}

export default function MonAdhesionPage() {
  const { t } = useTranslation("adhesions");

  const campagneActive = useCampagneActive();
  // Catalogue complet (tous statuts, lecture ouverte — CataloguePermission) :
  // sert uniquement à résoudre les noms de campagne/offre de l'historique,
  // qui peut couvrir des campagnes déjà clôturées et donc absentes de
  // "active". Limite connue : ne couvre que la première page du cursor
  // (comme le stepper de cotisations) — acceptable pour ce périmètre.
  const campagnesQuery = useCampagnes();
  const mesSouscriptions = useMesSouscriptions();
  const souscrireMutation = useSouscrire();
  const uploaderJustificatifMutation = useUploaderJustificatif();

  const [offreSelectionneeId, setOffreSelectionneeId] = useState<string | null>(null);
  const [rabaisSelectionneId, setRabaisSelectionneId] = useState<string | null>(null);
  const [fichierJustificatif, setFichierJustificatif] = useState<File | null>(null);
  const fichierInputRef = useRef<HTMLInputElement>(null);

  const campagne = campagneActive.data;

  const campagnesById = useMemo(() => {
    const map = new Map<string, CampagneAdhesion>();
    campagnesQuery.data?.results.forEach((c) => map.set(c.id, c));
    if (campagne) map.set(campagne.id, campagne);
    return map;
  }, [campagnesQuery.data, campagne]);

  const souscriptionActuelle: Souscription | undefined = mesSouscriptions.data?.results.find(
    (s) => campagne && s.campagne === campagne.id,
  );
  const dejaPayee = souscriptionActuelle?.statut === "payee";

  const offresVisibles: OffreAdhesion[] = (campagne?.offres ?? []).filter((o) => o.visible);
  const offreSelectionnee = offresVisibles.find((o) => o.id === offreSelectionneeId) ?? null;
  const rabaisOptions = offreSelectionnee?.rabais ?? [];
  const rabaisSelectionne = rabaisOptions.find((r) => r.id === rabaisSelectionneId) ?? null;

  const offreActuelle = souscriptionActuelle
    ? campagnesById.get(souscriptionActuelle.campagne)?.offres.find(
        (o) => o.id === souscriptionActuelle.offre,
      )
    : undefined;

  // Rabais choisi pour la souscription en cours — sert à afficher les instructions membre
  // (RabaisOffre.instructions_fr) au-dessus du formulaire d'upload.
  const rabaisActuel = offreActuelle?.rabais.find((r) => r.id === souscriptionActuelle?.rabais);
  const justificatifActuel = souscriptionActuelle?.justificatif ?? null;

  function choisirOffre(offreId: string) {
    setOffreSelectionneeId((cur) => (cur === offreId ? null : offreId));
    setRabaisSelectionneId(null);
  }

  function envoyerJustificatif() {
    if (!souscriptionActuelle || !fichierJustificatif) return;
    uploaderJustificatifMutation.mutate(
      { souscriptionId: souscriptionActuelle.id, fichier: fichierJustificatif },
      {
        onSuccess: () => {
          setFichierJustificatif(null);
          if (fichierInputRef.current) fichierInputRef.current.value = "";
        },
      },
    );
  }

  function handleSouscrire() {
    if (!offreSelectionnee) return;
    souscrireMutation.mutate(
      { offre: offreSelectionnee.id, rabais: rabaisSelectionne?.id },
      {
        onSuccess: () => {
          setOffreSelectionneeId(null);
          setRabaisSelectionneId(null);
        },
      },
    );
  }

  return (
    <div>
      <h1 className="mb-4 text-xl font-bold text-text-primary">{t("page.titre")}</h1>

      {souscriptionActuelle && (
        <div className="mb-5 rounded-cid-lg bg-ca p-5 text-white shadow-sm">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-white/80">
            {t("hero.titre")}
          </h2>
          <div className="mt-1 text-lg font-bold">{offreActuelle?.nom ?? "—"}</div>
          {campagne && (
            <div className="text-sm text-white/80">
              {t("hero.campagne", { nom: campagne.nom })} ·{" "}
              {t("hero.expire_le", { date: formatDate(campagne.date_fin) })}
            </div>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-4">
            <div>
              <div className="text-xs uppercase text-white/70">{t("hero.prix_paye")}</div>
              <div className="text-lg font-bold">{formatMontant(souscriptionActuelle.prix_paye)}</div>
            </div>
            <div className="text-xs uppercase text-white/70">
              {t("hero.souscrit_le", { date: formatDate(souscriptionActuelle.date_souscription) })}
            </div>
            <span
              className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUT_STYLES[souscriptionActuelle.statut]}`}
            >
              {t(`statut.${souscriptionActuelle.statut}`)}
            </span>
          </div>
          {souscriptionActuelle.snapshot_avantages.length > 0 && (
            <div className="mt-3">
              <div className="mb-1 text-xs uppercase text-white/70">{t("hero.avantages_titre")}</div>
              <div className="flex flex-wrap gap-1.5">
                {souscriptionActuelle.snapshot_avantages
                  .slice()
                  .sort((a, b) => a.ordre - b.ordre)
                  .map((av) => (
                    <span key={av.ordre} className="rounded-full bg-white/15 px-2 py-0.5 text-xs">
                      ✓ {av.texte_fr}
                    </span>
                  ))}
              </div>
            </div>
          )}
        </div>
      )}

      {souscriptionActuelle?.statut === "en_attente_justificatif" && (
        <div className="mb-5 rounded-cid-lg border border-status-warningText/30 bg-status-warningBg p-4">
          <h2 className="mb-1 text-sm font-bold text-text-primary">{t("justificatif.titre")}</h2>
          {rabaisActuel && (
            <p className="mb-3 text-xs text-text-secondary">{rabaisActuel.instructions_fr}</p>
          )}

          {justificatifActuel && justificatifActuel.statut === "en_attente" ? (
            <p className="mb-3 text-sm text-status-warningText">
              {t("justificatif.en_attente_validation")}
            </p>
          ) : null}

          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fichierInputRef}
              type="file"
              aria-label={t("justificatif.fichier_label")}
              accept=".pdf,.jpg,.jpeg,.png"
              onChange={(e) => setFichierJustificatif(e.target.files?.[0] ?? null)}
              className="text-xs"
            />
            <button
              type="button"
              onClick={envoyerJustificatif}
              disabled={!fichierJustificatif || uploaderJustificatifMutation.isPending}
              className="rounded-cid bg-ca px-3 py-1.5 text-sm font-medium text-white hover:bg-cad disabled:opacity-40"
            >
              {justificatifActuel
                ? t("justificatif.remplacer")
                : t("justificatif.envoyer")}
            </button>
          </div>
          {uploaderJustificatifMutation.isError && (
            <p className="mt-2 text-xs text-status-dangerText">
              {extractApiErrorMessage(uploaderJustificatifMutation.error, t("justificatif.erreur"))}
            </p>
          )}
        </div>
      )}

      {souscriptionActuelle?.statut === "rabais_refuse" && justificatifActuel?.motif_rejet && (
        <div className="mb-5 rounded-cid-lg border border-status-dangerText/30 bg-status-dangerBg p-4 text-sm text-status-dangerText">
          <span className="font-semibold">{t("justificatif.rejete_titre")}</span>{" "}
          {justificatifActuel.motif_rejet}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-cid-lg bg-bg-primary p-4 shadow-sm">
          <h2 className="mb-3 text-xs font-bold text-text-primary">
            {campagne ? t("offres.titre", { annee: campagne.annee }) : t("offres.titre_sans_campagne")}
          </h2>

          {campagneActive.isLoading && (
            <p className="text-sm text-text-tertiary">{t("offres.chargement")}</p>
          )}
          {campagneActive.isError && (
            <p className="text-sm text-text-tertiary">{t("offres.aucune_campagne")}</p>
          )}
          {campagne && dejaPayee && (
            <p className="text-sm text-text-tertiary">{t("offres.deja_payee")}</p>
          )}
          {campagne && !dejaPayee && offresVisibles.length === 0 && (
            <p className="text-sm text-text-tertiary">{t("offres.aucune_campagne")}</p>
          )}

          {campagne && !dejaPayee && offresVisibles.length > 0 && (
            <div className="space-y-2">
              {offresVisibles.map((offre) => (
                <div
                  key={offre.id}
                  className={`rounded-cid border px-3 py-2 ${
                    offreSelectionneeId === offre.id ? "border-ca bg-cal/20" : "border-text-tertiary/20"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => choisirOffre(offre.id)}
                    className="flex w-full items-center justify-between gap-2 text-left"
                  >
                    <div>
                      <div className="text-sm font-semibold text-text-primary">{offre.nom}</div>
                      <div className="text-xs text-text-tertiary">{offre.description}</div>
                    </div>
                    <div className="whitespace-nowrap text-sm font-bold text-ca">
                      {t("offres.prix_plein")} : {formatMontant(offre.prix_plein)}
                    </div>
                  </button>

                  {offreSelectionneeId === offre.id && (
                    <div className="mt-2 border-t border-text-tertiary/10 pt-2">
                      {offre.rabais.length > 0 && (
                        <div className="mb-2">
                          <label
                            htmlFor={`rabais-${offre.id}`}
                            className="mb-1 block text-xs font-medium text-text-secondary"
                          >
                            {t("offres.rabais_label")}
                          </label>
                          <select
                            id={`rabais-${offre.id}`}
                            value={rabaisSelectionneId ?? ""}
                            onChange={(e) => setRabaisSelectionneId(e.target.value || null)}
                            className="w-full rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm"
                          >
                            <option value="">{t("offres.rabais_aucun")}</option>
                            {offre.rabais.map((r) => (
                              <option key={r.id} value={r.id}>
                                {r.label_fr}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}

                      {souscrireMutation.isError && (
                        <p className="mb-2 text-xs text-status-dangerText">
                          {extractApiErrorMessage(souscrireMutation.error, t("offres.erreur"))}
                        </p>
                      )}

                      <button
                        type="button"
                        onClick={handleSouscrire}
                        disabled={souscrireMutation.isPending}
                        className="w-full rounded-cid bg-ca px-3 py-1.5 text-sm font-medium text-white hover:bg-cad disabled:opacity-40"
                      >
                        {souscriptionActuelle ? t("offres.changer") : t("offres.souscrire")}
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-cid-lg bg-bg-primary p-4 shadow-sm">
          <h2 className="mb-3 text-xs font-bold text-text-primary">{t("historique.titre")}</h2>
          {mesSouscriptions.isLoading && (
            <p className="text-sm text-text-tertiary">{t("historique.chargement")}</p>
          )}
          {mesSouscriptions.isError && (
            <p className="text-sm text-status-dangerText">{t("historique.erreur")}</p>
          )}
          {mesSouscriptions.data && mesSouscriptions.data.results.length === 0 && (
            <p className="text-sm text-text-tertiary">{t("historique.aucun")}</p>
          )}
          {mesSouscriptions.data && mesSouscriptions.data.results.length > 0 && (
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-text-tertiary/20 text-left uppercase text-text-tertiary">
                  <th className="py-1">{t("historique.col_campagne")}</th>
                  <th className="py-1">{t("historique.col_offre")}</th>
                  <th className="py-1">{t("historique.col_prix")}</th>
                  <th className="py-1">{t("historique.col_statut")}</th>
                  <th className="py-1">{t("historique.col_date")}</th>
                </tr>
              </thead>
              <tbody>
                {mesSouscriptions.data.results.map((s) => {
                  const camp = campagnesById.get(s.campagne);
                  const offreNom = camp?.offres.find((o) => o.id === s.offre)?.nom;
                  return (
                    <tr key={s.id} className="border-b border-text-tertiary/10 last:border-0">
                      <td className="py-1">{camp?.nom ?? "—"}</td>
                      <td className="py-1">{offreNom ?? "—"}</td>
                      <td className="py-1">{formatMontant(s.prix_paye)}</td>
                      <td className="py-1">
                        <span
                          className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUT_STYLES[s.statut]}`}
                        >
                          {t(`statut.${s.statut}`)}
                        </span>
                      </td>
                      <td className="py-1">{formatDate(s.date_souscription)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
