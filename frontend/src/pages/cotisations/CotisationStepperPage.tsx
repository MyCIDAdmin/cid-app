/**
 * Stepper de paiement (mockup #pg-cotisation, FDD §3.2, RICEFW F-004, AHM-16).
 *
 * Portée de ce ticket : 3 étapes (article → mode de paiement → confirmation)
 * en libre-service, au-dessus de l'API déjà construite par AHM-15
 * (POST /cotisations/ avec statut=payee, cf. apps.cotisations.views).
 *
 * Deux choix de périmètre actés avec l'utilisateur :
 *  - Seuls les types d'article "cotisation", "adhesion" et "don" sont
 *    proposés — "evenement" est exclu tant que apps.evenements n'existe
 *    pas (aucun événement à sélectionner).
 *  - Aucune donnée bancaire (numéro de carte, IBAN/BIC) n'est saisie : il
 *    n'existe pas de passerelle de paiement réelle (aucun SDK Stripe/PayPal
 *    dans requirements/base.txt), et l'API se contente d'un libellé de mode
 *    de paiement avec statut=payee directement. Collecter ces champs sans
 *    les transmettre nulle part serait un anti-pattern de sécurité (risque
 *    de confusion pour l'utilisateur). Le choix du mode reste affiché pour
 *    la fidélité au mockup, mais sans champ carte/IBAN.
 *
 * Le reçu PDF (bouton "Télécharger le reçu" du mockup) est hors périmètre —
 * voir AHM-17.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { useCreerCotisation, useMesCotisations } from "../../hooks/useCotisations";
import { MONTANTS_CATALOGUE } from "../../types/cotisation";
import type { Cotisation, ModePaiement, TypeArticleStepper } from "../../types/cotisation";
import { extractApiErrorMessage } from "../../utils/apiError";

const DON_LIBELLE = "Don libre à l'association";

const STATUT_STYLES: Record<Cotisation["statut"], string> = {
  en_attente: "bg-status-warningBg text-status-warningText",
  payee: "bg-status-successBg text-status-successText",
  echouee: "bg-status-dangerBg text-status-dangerText",
  remboursee: "bg-bg-tertiary text-text-secondary",
  annulee: "bg-bg-tertiary text-text-secondary",
};

function formatMontant(montant: number): string {
  return `${montant.toFixed(2).replace(".", ",")} €`;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString();
}

interface EtapeIndicateurProps {
  numero: 1 | 2 | 3;
  label: string;
  active: boolean;
  franchie: boolean;
}

function EtapeIndicateur({ numero, label, active, franchie }: EtapeIndicateurProps) {
  const cur = active || franchie;
  return (
    <div className="flex items-center gap-2">
      <div
        className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
          cur ? "bg-ca text-white" : "bg-bg-tertiary text-text-tertiary"
        }`}
      >
        {numero}
      </div>
      <span className={`text-xs font-medium ${cur ? "text-text-primary" : "text-text-tertiary"}`}>
        {label}
      </span>
    </div>
  );
}

export default function CotisationStepperPage() {
  const { t } = useTranslation("cotisations");
  const anneeCourante = new Date().getFullYear();

  const [etape, setEtape] = useState<1 | 2 | 3>(1);
  const [articleChoisi, setArticleChoisi] = useState<TypeArticleStepper>("cotisation");
  const [donMontant, setDonMontant] = useState("10");
  const [donErreur, setDonErreur] = useState<string | null>(null);
  const [modePaiement, setModePaiement] = useState<ModePaiement>("carte");
  const [resultat, setResultat] = useState<Cotisation | null>(null);

  const historique = useMesCotisations();
  const creerMutation = useCreerCotisation();

  const ARTICLES: {
    type: TypeArticleStepper;
    titre: string;
    description: string;
    montant: number | null;
  }[] = [
    {
      type: "cotisation",
      titre: t("article.cotisation_titre", { annee: anneeCourante }),
      description: t("article.cotisation_description"),
      montant: MONTANTS_CATALOGUE.cotisation,
    },
    {
      type: "adhesion",
      titre: t("article.adhesion_titre"),
      description: t("article.adhesion_description"),
      montant: MONTANTS_CATALOGUE.adhesion,
    },
    {
      type: "don",
      titre: t("article.don_titre"),
      description: t("article.don_description"),
      montant: null,
    },
  ];

  const donMontantNombre = Number(donMontant.replace(",", "."));
  const montantAffiche =
    articleChoisi === "don"
      ? Number.isFinite(donMontantNombre)
        ? donMontantNombre
        : 0
      : (ARTICLES.find((a) => a.type === articleChoisi)?.montant ?? 0);
  const libelleAffiche =
    articleChoisi === "don"
      ? DON_LIBELLE
      : (ARTICLES.find((a) => a.type === articleChoisi)?.titre ?? "");

  function allerEtapePaiement() {
    if (articleChoisi === "don") {
      if (!(donMontantNombre > 0)) {
        setDonErreur(t("article.don_montant_erreur"));
        return;
      }
    }
    setDonErreur(null);
    setEtape(2);
  }

  function payer() {
    const payload =
      articleChoisi === "don"
        ? {
            type_article: "don" as const,
            mode_paiement: modePaiement,
            statut: "payee" as const,
            libelle: DON_LIBELLE,
            montant: donMontantNombre.toFixed(2),
          }
        : {
            type_article: articleChoisi,
            mode_paiement: modePaiement,
            statut: "payee" as const,
          };

    creerMutation.mutate(payload, {
      onSuccess: (cotisation) => {
        setResultat(cotisation);
        setEtape(3);
      },
    });
  }

  function nouveauPaiement() {
    setArticleChoisi("cotisation");
    setDonMontant("10");
    setDonErreur(null);
    setModePaiement("carte");
    setResultat(null);
    creerMutation.reset();
    setEtape(1);
  }

  return (
    <div>
      <h1 className="mb-4 text-xl font-bold text-text-primary">{t("article.titre")}</h1>

      <div className="mb-5 flex items-center gap-3">
        <EtapeIndicateur numero={1} label={t("etape.choisir")} active={etape === 1} franchie={etape > 1} />
        <div className="h-px w-8 bg-text-tertiary/30" />
        <EtapeIndicateur numero={2} label={t("etape.paiement")} active={etape === 2} franchie={etape > 2} />
        <div className="h-px w-8 bg-text-tertiary/30" />
        <EtapeIndicateur numero={3} label={t("etape.confirmation")} active={etape === 3} franchie={false} />
      </div>

      {etape === 1 && (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-cid-lg bg-bg-primary p-4 shadow-sm">
            <h2 className="mb-3 text-xs font-bold text-text-primary">{t("article.titre")}</h2>
            <div className="space-y-2">
              {ARTICLES.map((a) => (
                <button
                  key={a.type}
                  type="button"
                  onClick={() => setArticleChoisi(a.type)}
                  className={`flex w-full items-center justify-between rounded-cid border px-3 py-2 text-left ${
                    articleChoisi === a.type
                      ? "border-ca bg-cal/20"
                      : "border-text-tertiary/20 hover:bg-bg-tertiary"
                  }`}
                >
                  <div>
                    <div className="text-sm font-semibold text-text-primary">{a.titre}</div>
                    <div className="text-xs text-text-tertiary">{a.description}</div>
                  </div>
                  {a.montant !== null && (
                    <div className="text-sm font-bold text-ca">{formatMontant(a.montant)}</div>
                  )}
                </button>
              ))}
            </div>

            {articleChoisi === "don" && (
              <div className="mt-3">
                <label htmlFor="don-montant" className="mb-1 block text-xs font-medium text-text-secondary">
                  {t("article.don_montant_label")}
                </label>
                <input
                  id="don-montant"
                  type="number"
                  min="1"
                  step="0.01"
                  value={donMontant}
                  onChange={(e) => {
                    setDonMontant(e.target.value);
                    setDonErreur(null);
                  }}
                  className="w-full rounded-cid border border-text-tertiary/30 px-2 py-1.5 text-sm"
                />
                {donErreur && <p className="mt-1 text-xs text-status-dangerText">{donErreur}</p>}
              </div>
            )}
          </div>

          <div>
            <div className="rounded-cid-lg bg-bg-primary p-4 shadow-sm">
              <h2 className="mb-3 text-xs font-bold text-text-primary">{t("recap.titre")}</h2>
              <dl className="space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <dt className="text-text-secondary">{t("recap.article")}</dt>
                  <dd className="font-medium text-text-primary">{libelleAffiche}</dd>
                </div>
                <div className="flex justify-between border-t border-text-tertiary/10 pt-1.5 font-bold">
                  <dt className="text-text-primary">{t("recap.montant")}</dt>
                  <dd className="text-ca">{formatMontant(montantAffiche)}</dd>
                </div>
              </dl>
              <button
                type="button"
                onClick={allerEtapePaiement}
                className="mt-3 w-full rounded-cid bg-ca px-3 py-2 text-sm font-medium text-white hover:bg-cad"
              >
                {t("continuer")}
              </button>
            </div>

            <div className="mt-4 rounded-cid-lg bg-bg-primary p-4 shadow-sm">
              <h2 className="mb-3 text-xs font-bold text-text-primary">{t("historique.titre")}</h2>
              {historique.isLoading && (
                <p className="text-sm text-text-tertiary">{t("historique.chargement")}</p>
              )}
              {historique.isError && (
                <p className="text-sm text-status-dangerText">{t("historique.erreur")}</p>
              )}
              {historique.data && historique.data.results.length === 0 && (
                <p className="text-sm text-text-tertiary">{t("historique.aucun")}</p>
              )}
              {historique.data && historique.data.results.length > 0 && (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-text-tertiary/20 text-left uppercase text-text-tertiary">
                      <th className="py-1">{t("historique.col_date")}</th>
                      <th className="py-1">{t("historique.col_libelle")}</th>
                      <th className="py-1">{t("historique.col_montant")}</th>
                      <th className="py-1">{t("historique.col_statut")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historique.data.results.map((c) => (
                      <tr key={c.id} className="border-b border-text-tertiary/10 last:border-0">
                        <td className="py-1">{formatDate(c.date_paiement ?? c.created_at)}</td>
                        <td className="py-1">{c.libelle}</td>
                        <td className="py-1">{formatMontant(Number(c.montant))}</td>
                        <td className="py-1">
                          <span
                            className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUT_STYLES[c.statut]}`}
                          >
                            {t(`statut.${c.statut}`)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {etape === 2 && (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-cid-lg bg-bg-primary p-4 shadow-sm">
            <h2 className="mb-3 text-xs font-bold text-text-primary">{t("paiement.titre")}</h2>
            <div className="space-y-2">
              {(
                [
                  { mode: "carte" as const, titre: t("paiement.carte_titre"), desc: t("paiement.carte_description") },
                  { mode: "virement_sepa" as const, titre: t("paiement.sepa_titre"), desc: t("paiement.sepa_description") },
                  { mode: "paypal" as const, titre: t("paiement.paypal_titre"), desc: t("paiement.paypal_description") },
                ]
              ).map((m) => (
                <label
                  key={m.mode}
                  className={`flex cursor-pointer items-center gap-3 rounded-cid border px-3 py-2 ${
                    modePaiement === m.mode ? "border-ca bg-cal/20" : "border-text-tertiary/20"
                  }`}
                >
                  <input
                    type="radio"
                    name="mode_paiement"
                    checked={modePaiement === m.mode}
                    onChange={() => setModePaiement(m.mode)}
                  />
                  <div>
                    <div className="text-sm font-semibold text-text-primary">{m.titre}</div>
                    <div className="text-xs text-text-tertiary">{m.desc}</div>
                  </div>
                </label>
              ))}
            </div>
            <p className="mt-3 text-xs text-text-tertiary">{t("paiement.note")}</p>
          </div>

          <div className="rounded-cid-lg bg-bg-primary p-4 shadow-sm">
            <h2 className="mb-3 text-xs font-bold text-text-primary">{t("recap.titre")}</h2>
            <dl className="space-y-1.5 text-sm">
              <div className="flex justify-between">
                <dt className="text-text-secondary">{t("recap.article")}</dt>
                <dd className="font-medium text-text-primary">{libelleAffiche}</dd>
              </div>
              <div className="flex justify-between font-bold">
                <dt className="text-text-primary">{t("recap.montant")}</dt>
                <dd className="text-ca">{formatMontant(montantAffiche)}</dd>
              </div>
            </dl>

            {creerMutation.isError && (
              <p className="mt-2 text-sm text-status-dangerText">
                {extractApiErrorMessage(creerMutation.error, t("paiement.erreur"))}
              </p>
            )}

            <button
              type="button"
              onClick={payer}
              disabled={creerMutation.isPending}
              className="mt-3 w-full rounded-cid bg-ca px-3 py-2 text-sm font-medium text-white hover:bg-cad disabled:opacity-40"
            >
              {t("paiement.payer", { montant: formatMontant(montantAffiche).replace(" €", "") })}
            </button>
            <button
              type="button"
              onClick={() => setEtape(1)}
              className="mt-2 w-full rounded-cid border border-text-tertiary/30 px-3 py-2 text-sm text-text-secondary hover:bg-bg-tertiary"
            >
              {t("paiement.retour")}
            </button>
          </div>
        </div>
      )}

      {etape === 3 && resultat && (
        <div className="rounded-cid-lg bg-bg-primary p-8 text-center shadow-sm">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-status-successBg text-2xl text-status-successText">
            ✓
          </div>
          <div className="mb-1 text-lg font-bold text-text-primary">{t("confirmation.titre")}</div>
          <div className="mb-4 text-sm text-text-tertiary">{t("confirmation.sous_titre")}</div>

          <dl className="mx-auto mb-5 max-w-sm space-y-1.5 rounded-cid border border-text-tertiary/10 p-4 text-left text-sm">
            <div className="flex justify-between">
              <dt className="text-text-secondary">{t("confirmation.reference")}</dt>
              <dd className="font-mono text-text-primary">{resultat.reference_transaction}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-text-secondary">{t("confirmation.article")}</dt>
              <dd className="text-text-primary">{resultat.libelle}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-text-secondary">{t("confirmation.montant")}</dt>
              <dd className="font-bold text-ca">{formatMontant(Number(resultat.montant))}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-text-secondary">{t("confirmation.date")}</dt>
              <dd className="text-text-primary">{formatDate(resultat.date_paiement)}</dd>
            </div>
          </dl>

          <div className="flex justify-center gap-2">
            <button
              type="button"
              onClick={nouveauPaiement}
              className="rounded-cid border border-text-tertiary/30 px-3 py-1.5 text-sm text-text-secondary hover:bg-bg-tertiary"
            >
              {t("confirmation.nouveau_paiement")}
            </button>
            <Link
              to="/dashboard"
              className="rounded-cid bg-ca px-3 py-1.5 text-sm font-medium text-white hover:bg-cad"
            >
              {t("confirmation.accueil")}
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
